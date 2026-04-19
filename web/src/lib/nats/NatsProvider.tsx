import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { connect, type NatsConnection, type Status } from "nats.ws";
import { getNatsServerURL } from "../../env";
import { useSession } from "../session/SessionProvider";
import { describeNatsError, type NatsContextValue, type NatsConnectionState } from "./nats-types";

const NatsContext = createContext<NatsContextValue | null>(null);

const defaultState: Pick<
  NatsContextValue,
  "state" | "detail" | "reconnects" | "lastError" | "connectedServer"
> = {
  state: "disconnected" as NatsConnectionState,
  detail: "NATS WebSocket transport is idle.",
  reconnects: 0,
  lastError: undefined,
  connectedServer: undefined,
};

export function NatsProvider({ children }: PropsWithChildren) {
  const { snapshot } = useSession();
  const [state, setState] = useState(defaultState);
  const connectionRef = useRef<NatsConnection | null>(null);
  const statusIteratorRef = useRef<Promise<void> | null>(null);
  const serverURL = getNatsServerURL();

  const disconnect = () => {
    connectionRef.current?.close();
    connectionRef.current = null;
    setState({
      state: "disconnected",
      detail: "NATS WebSocket transport is closed.",
      reconnects: 0,
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
      }));
    }
  };

  const connectTransport = async () => {
    if (connectionRef.current) {
      return;
    }

    if (!snapshot.transport.ready) {
      setState({
        state: "disconnected",
        detail: snapshot.transport.detail,
        reconnects: 0,
        connectedServer: undefined,
        lastError: undefined,
      });
      return;
    }

    setState((current) => ({
      ...current,
      state: "connecting",
      detail: `Connecting to estate transport at ${serverURL}.`,
      lastError: undefined,
    }));

    try {
      const connection = await connect({
        name: "Stronghold Lookout Web",
        servers: serverURL,
        maxReconnectAttempts: -1,
        reconnectTimeWait: 2_000,
      });

      connectionRef.current = connection;
      setState((current) => ({
        ...current,
        state: "connected",
        detail: "NATS WebSocket transport is live.",
        connectedServer: connection.getServer(),
        lastError: undefined,
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
        state: "error",
        detail:
          "Unable to establish the browser transport. This usually means the `/_/nats` rail is not exposed yet or the current session is not accepted there.",
        lastError: describeNatsError(error),
      }));
    }
  };

  useEffect(() => {
    if (snapshot.status === "unauthenticated") {
      disconnect();
      return;
    }

    void connectTransport();
    return () => {
      disconnect();
    };
  }, [snapshot.status, snapshot.transport.ready, snapshot.transport.detail, serverURL]);

  return (
    <NatsContext.Provider
      value={{
        ...state,
        serverURL,
        connection: connectionRef.current,
        connect: connectTransport,
        disconnect,
      }}
    >
      {children}
    </NatsContext.Provider>
  );
}

export function useNats() {
  const context = useContext(NatsContext);
  if (!context) {
    throw new Error("useNats must be used within a NatsProvider");
  }
  return context;
}
