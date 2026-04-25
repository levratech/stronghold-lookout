import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { connect, credsAuthenticator, type NatsConnection, type Status } from "nats.ws";
import { getNatsServerURL } from "../../env";
import { useSession } from "../session/SessionProvider";
import { requestBrowserTransportGrant } from "../session/session-client";
import type { BrowserTransportGrantResponse } from "../session/session-types";
import {
  describeNatsError,
  type NatsContextValue,
  type NatsConnectionState,
  type NatsGrantPermissions,
  type NatsGrantPosture,
} from "./nats-types";

const NatsContext = createContext<NatsContextValue | null>(null);

const defaultState: Pick<
  NatsContextValue,
  | "state"
  | "detail"
  | "reconnects"
  | "lastError"
  | "lastDeniedAction"
  | "connectedServer"
  | "grantPosture"
> = {
  state: "disconnected" as NatsConnectionState,
  detail: "NATS WebSocket transport is idle.",
  reconnects: 0,
  lastError: undefined,
  lastDeniedAction: undefined,
  connectedServer: undefined,
  grantPosture: undefined,
};

export function NatsProvider({ children }: PropsWithChildren) {
  const { snapshot } = useSession();
  const [state, setState] = useState(defaultState);
  const connectionRef = useRef<NatsConnection | null>(null);
  const grantTokenRef = useRef<string | undefined>(undefined);
  const statusIteratorRef = useRef<Promise<void> | null>(null);
  const serverURL = getNatsServerURL();

  const disconnect = () => {
    connectionRef.current?.close();
    connectionRef.current = null;
    grantTokenRef.current = undefined;
    setState({
      state: "disconnected",
      detail: "NATS WebSocket transport is closed.",
      reconnects: 0,
      lastError: undefined,
      lastDeniedAction: undefined,
      connectedServer: undefined,
      grantPosture: undefined,
    });
  };

  const watchConnection = async (connection: NatsConnection) => {
    const iterator = connection.status();
    for await (const status of iterator) {
      applyStatus(status);
    }
  };

  const applyStatus = (status: Status) => {
    if (status.type === "disconnect") {
      setState((current) => ({
        ...current,
        state: "reconnecting",
        detail: "NATS transport dropped; waiting for the browser rail to recover.",
        lastError: status.data ? describeNatsError(status.data) : current.lastError,
        lastDeniedAction: status.data
          ? describeDeniedAction(status.data) ?? current.lastDeniedAction
          : current.lastDeniedAction,
      }));
      return;
    }

    if (status.type === "reconnect") {
      setState((current) => ({
        ...current,
        state: "connected",
        detail: "NATS transport re-established through the same-origin WebSocket rail.",
        reconnects: current.reconnects + 1,
        connectedServer: String(status.data),
        lastError: undefined,
      }));
      return;
    }

    if (status.type === "error") {
      setState((current) => ({
        ...current,
        state: "error",
        detail: "NATS transport reported an application-level error.",
        lastError: describeNatsError(status.data),
        lastDeniedAction: describeDeniedAction(status.data) ?? current.lastDeniedAction,
      }));
    }
  };

  const connectTransport = async () => {
    if (connectionRef.current) {
      return;
    }

    if (snapshot.status !== "authenticated") {
      setState({
        state: "auth_error",
        detail: "An authenticated browser session is required before requesting NATS transport.",
        reconnects: 0,
        connectedServer: undefined,
        lastError: undefined,
        lastDeniedAction: undefined,
        grantPosture: undefined,
      });
      return;
    }

    if (!snapshot.transport.ready) {
      setState({
        state: "disconnected",
        detail: snapshot.transport.detail,
        reconnects: 0,
        connectedServer: undefined,
        lastError: undefined,
        lastDeniedAction: undefined,
        grantPosture: undefined,
      });
      return;
    }

    if (!snapshot.transport.grantReady || !snapshot.transport.credentialPath) {
      setState({
        state: "disconnected",
        detail: snapshot.transport.detail,
        reconnects: 0,
        connectedServer: undefined,
        lastError: undefined,
        lastDeniedAction: undefined,
        grantPosture: undefined,
      });
      return;
    }

    setState((current) => ({
      ...current,
      state: "credentialing",
      detail: "Requesting a short-lived principal-scoped NATS credential through the current session.",
      lastError: undefined,
    }));

    let credsFile: string | undefined;
    let grantToken: string | undefined;
    let grantPosture: NatsGrantPosture | undefined;
    try {
      const grant = await requestBrowserTransportGrant(snapshot);
      grantPosture = grantPostureFromResponse(grant);
      if (!grant.transport_ready) {
        setState((current) => ({
          ...current,
          state: "credential_error",
          detail: "Sentry issued a transport grant, but the runtime rail did not confirm readiness.",
          lastError: "transport_ready=false",
          grantPosture,
        }));
        return;
      }
      grantToken = grant.grant_token;
      credsFile = grant.native_credential?.creds_file;
      if (!credsFile) {
        setState((current) => ({
          ...current,
          state: "credential_error",
          detail: "Sentry issued a transport grant, but no native NATS credential was returned.",
          lastError: grant.nats_native ? undefined : "Grant response was not NATS-native.",
          grantPosture,
        }));
        return;
      }
    } catch (error) {
      setState((current) => ({
        ...current,
        state: "credential_error",
        detail: "Unable to obtain a scoped NATS credential through the current session.",
        lastError: describeNatsError(error),
        lastDeniedAction: describeDeniedAction(error) ?? current.lastDeniedAction,
      }));
      return;
    }

    try {
      setState((current) => ({
        ...current,
        state: "connecting",
        detail: `Connecting to estate transport at ${serverURL}.`,
        lastError: undefined,
        grantPosture,
      }));

      const connection = await connect({
        name: "Stronghold Lookout Web",
        servers: serverURL,
        authenticator: credsAuthenticator(new TextEncoder().encode(credsFile)),
        maxReconnectAttempts: -1,
        reconnectTimeWait: 2_000,
      });

      connectionRef.current = connection;
      grantTokenRef.current = grantToken;
      setState((current) => ({
        ...current,
        state: "connected",
        detail: "NATS WebSocket transport is live.",
        connectedServer: connection.getServer(),
        lastError: undefined,
        grantPosture,
      }));

      statusIteratorRef.current = watchConnection(connection);
      void connection.closed().then((error) => {
        if (connectionRef.current === connection) {
          connectionRef.current = null;
        }
        if (error) {
          setState((current) => ({
            ...current,
            state: "error",
            detail: "NATS transport closed with an error.",
            lastError: describeNatsError(error),
            lastDeniedAction: describeDeniedAction(error) ?? current.lastDeniedAction,
          }));
          return;
        }
        setState((current) => ({
          ...current,
          state: "disconnected",
          detail: "NATS transport closed cleanly.",
        }));
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        state: "rail_error",
        detail:
          "Unable to establish the browser transport after obtaining a scoped credential.",
        lastError: describeNatsError(error),
        lastDeniedAction: describeDeniedAction(error) ?? current.lastDeniedAction,
        grantPosture,
      }));
    }
  };

  useEffect(() => {
    if (snapshot.status === "unauthenticated") {
      disconnect();
      setState({
        state: "auth_error",
        detail: "No authenticated browser session is available for NATS transport.",
        reconnects: 0,
        connectedServer: undefined,
        lastError: undefined,
        lastDeniedAction: undefined,
        grantPosture: undefined,
      });
      return;
    }

    void connectTransport();
    return () => {
      disconnect();
    };
  }, [
    snapshot.status,
    snapshot.transport.ready,
    snapshot.transport.grantReady,
    snapshot.transport.credentialPath,
    snapshot.transport.credentialMethod,
    snapshot.transport.credentialRail,
    snapshot.transport.credentialProfile,
    snapshot.transport.nativeRequired,
    snapshot.transport.detail,
    serverURL,
  ]);

  return (
    <NatsContext.Provider
      value={{
        ...state,
        serverURL,
        connection: connectionRef.current,
        grantToken: grantTokenRef.current,
        grantPosture: state.grantPosture,
        connect: connectTransport,
        disconnect,
      }}
    >
      {children}
    </NatsContext.Provider>
  );
}

function grantPostureFromResponse(grant: BrowserTransportGrantResponse): NatsGrantPosture {
  const claims = grant.claims ?? {};
  return {
    source: "session-grant",
    credentialFormat: grant.credential_format,
    credentialId: stringClaim(claims, "jti"),
    principalId: stringClaim(claims, "principal_id"),
    activePrincipalId: stringClaim(claims, "active_principal_id"),
    contextId: stringClaim(claims, "context_id"),
    rail: stringClaim(claims, "rail"),
    profile: stringClaim(claims, "profile"),
    issuedAt: timeClaim(claims, "iat"),
    expiresAt: timeClaim(claims, "exp"),
    refreshable: booleanClaim(claims, "refreshable"),
    nativeCredential: grant.nats_native && Boolean(grant.native_credential?.creds_file),
    userPublicKey: grant.native_credential?.user_public_key,
    permissions: permissionsClaim(claims.permissions),
  };
}

function stringClaim(claims: Record<string, unknown>, key: string) {
  const value = claims[key];
  return typeof value === "string" && value ? value : undefined;
}

function booleanClaim(claims: Record<string, unknown>, key: string) {
  const value = claims[key];
  return typeof value === "boolean" ? value : undefined;
}

function timeClaim(claims: Record<string, unknown>, key: string) {
  const value = claims[key];
  if (typeof value === "string" && value) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }
  return undefined;
}

function permissionsClaim(value: unknown): NatsGrantPermissions | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return {
    pubAllow: stringArrayClaim(record.pub_allow),
    pubDeny: stringArrayClaim(record.pub_deny),
    subAllow: stringArrayClaim(record.sub_allow),
    subDeny: stringArrayClaim(record.sub_deny),
  };
}

function stringArrayClaim(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function describeDeniedAction(error: unknown) {
  const message = describeNatsError(error);
  return /permission|permissions|authorization|not authorized|denied/i.test(message)
    ? message
    : undefined;
}

export function useNats() {
  const context = useContext(NatsContext);
  if (!context) {
    throw new Error("useNats must be used within a NatsProvider");
  }
  return context;
}
