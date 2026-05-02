import { lookoutEnvironment } from "../../env";
import type {
  BrowserTransportGrantResponse,
  InterfaceMode,
  PrincipalType,
  SessionSnapshot,
  SessionTransportState,
} from "./session-types";

const authHintStorageKey = "lookout.session.hint";

const defaultTransport = {
  ready: false,
  detail:
    "Browser transport credentials are not exposed to JavaScript. A session-backed transport rail is still pending.",
};

function normalizeTransport(rawTransport: Record<string, unknown> | null): SessionTransportState {
  return {
    path:
      rawTransport && typeof rawTransport.path === "string"
        ? rawTransport.path
        : lookoutEnvironment.natsPath,
    mode:
      rawTransport && typeof rawTransport.mode === "string"
        ? rawTransport.mode
        : "session_backed",
    grantReady:
      rawTransport && typeof rawTransport.grant_ready === "boolean"
        ? rawTransport.grant_ready
        : false,
    credentialPath:
      rawTransport && typeof rawTransport.credential_path === "string"
        ? rawTransport.credential_path
        : undefined,
    credentialMethod:
      rawTransport && typeof rawTransport.credential_method === "string"
        ? rawTransport.credential_method
        : undefined,
    credentialRail:
      rawTransport && typeof rawTransport.credential_rail === "string"
        ? rawTransport.credential_rail
        : undefined,
    credentialProfile:
      rawTransport && typeof rawTransport.credential_profile === "string"
        ? rawTransport.credential_profile
        : undefined,
    nativeRequired:
      rawTransport && typeof rawTransport.native_required === "boolean"
        ? rawTransport.native_required
        : undefined,
    ready:
      rawTransport && typeof rawTransport.ready === "boolean" ? rawTransport.ready : false,
    detail:
      rawTransport && typeof rawTransport.detail === "string"
        ? rawTransport.detail
        : defaultTransport.detail,
  };
}

function normalizeIdentity(raw: Record<string, unknown> | null | undefined) {
  if (!raw) {
    return null;
  }

  const badgeIds = Array.isArray(raw.badge_ids)
    ? raw.badge_ids.filter((value): value is string => typeof value === "string")
    : [];
  const roles = Array.isArray(raw.roles)
    ? raw.roles.filter((value): value is string => typeof value === "string")
    : [];

  const principalType = normalizePrincipalType(raw.principal_type);

  return {
    accountId: typeof raw.account_id === "string" ? raw.account_id : undefined,
    identityId: typeof raw.identity_id === "string" ? raw.identity_id : undefined,
    principalId: typeof raw.principal_id === "string" ? raw.principal_id : undefined,
    principalType,
    authorityRootPrincipalId:
      typeof raw.authority_root_principal_id === "string"
        ? raw.authority_root_principal_id
        : undefined,
    domainId: typeof raw.domain_id === "string" ? raw.domain_id : undefined,
    contextId: typeof raw.context_id === "string" ? raw.context_id : undefined,
    realmId: typeof raw.realm_id === "string" ? raw.realm_id : undefined,
    email: typeof raw.email === "string" ? raw.email : undefined,
    badgeIds,
    roles,
    interfaceId: typeof raw.interface_id === "string" ? raw.interface_id : undefined,
    interfaceMode: normalizeInterfaceMode(raw.interface_mode),
  };
}

function normalizeInterfaceMode(value: unknown): InterfaceMode {
  switch (value) {
    case "user":
    case "system":
    case "public":
      return value;
    default:
      return "unknown";
  }
}

function normalizePrincipalType(value: unknown): PrincipalType {
  switch (value) {
    case "human":
    case "agent":
    case "managed":
    case "system":
    case "ephemeral":
      return value;
    default:
      return "unknown";
  }
}

export async function fetchSessionSnapshot(signal?: AbortSignal): Promise<SessionSnapshot> {
  const response = await fetch(lookoutEnvironment.sessionBootstrapPath, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  if (response.status === 401 || response.status === 403) {
    return {
      status: "unauthenticated",
      source: "bootstrap",
      account: null,
      identity: null,
      context: null,
      interfaceMode: "unknown",
      root: null,
      activePrincipal: null,
      badgeSummary: {
        badgeIds: [],
        count: 0,
      },
      transport: {
        ...defaultTransport,
        path: lookoutEnvironment.natsPath,
      },
      detail: "The same-origin auth bootstrap reports that no operator session is active.",
    };
  }

  if (response.status === 404) {
    return sessionHintSnapshot();
  }

  if (!response.ok) {
    return {
      status: "degraded",
      source: "bootstrap",
      account: null,
      identity: null,
      context: null,
      interfaceMode: "unknown",
      root: null,
      activePrincipal: null,
      badgeSummary: {
        badgeIds: [],
        count: 0,
      },
      transport: {
        ...defaultTransport,
        path: lookoutEnvironment.natsPath,
      },
      detail: `Session bootstrap returned ${response.status}. The cockpit is ready, but the estate is not exposing identity bootstrap data yet.`,
    };
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const root = normalizeIdentity(
    payload.root && typeof payload.root === "object"
      ? (payload.root as Record<string, unknown>)
      : payload,
  );
  const activePrincipal = normalizeIdentity(
    payload.active_principal && typeof payload.active_principal === "object"
      ? (payload.active_principal as Record<string, unknown>)
      : root,
  );
  const rawTransport =
    payload.transport && typeof payload.transport === "object"
      ? (payload.transport as Record<string, unknown>)
      : null;
  const rawAccount =
    payload.account && typeof payload.account === "object"
      ? (payload.account as Record<string, unknown>)
      : null;
  const rawContext =
    payload.context && typeof payload.context === "object"
      ? (payload.context as Record<string, unknown>)
      : null;
  const rawBadgeSummary =
    payload.badge_summary && typeof payload.badge_summary === "object"
      ? (payload.badge_summary as Record<string, unknown>)
      : null;
  const badgeIds = Array.isArray(rawBadgeSummary?.badge_ids)
    ? rawBadgeSummary.badge_ids.filter((value): value is string => typeof value === "string")
    : activePrincipal?.badgeIds ?? root?.badgeIds ?? [];

  return {
    status: "authenticated",
    source: "bootstrap",
    account: rawAccount
      ? {
          accountId:
            typeof rawAccount.account_id === "string" ? rawAccount.account_id : undefined,
          userId: typeof rawAccount.user_id === "string" ? rawAccount.user_id : undefined,
          domainId:
            typeof rawAccount.domain_id === "string" ? rawAccount.domain_id : undefined,
        }
      : null,
    identity: normalizeIdentity(
      payload.identity && typeof payload.identity === "object"
        ? (payload.identity as Record<string, unknown>)
        : null,
    ),
    context: rawContext
      ? {
          contextId:
            typeof rawContext.context_id === "string" ? rawContext.context_id : undefined,
          realmId: typeof rawContext.realm_id === "string" ? rawContext.realm_id : undefined,
          domainId: typeof rawContext.domain_id === "string" ? rawContext.domain_id : undefined,
          interfaceId:
            typeof rawContext.interface_id === "string" ? rawContext.interface_id : undefined,
          interfaceMode: normalizeInterfaceMode(rawContext.interface_mode),
        }
      : null,
    interfaceMode: normalizeInterfaceMode(payload.interface_mode),
    root,
    activePrincipal,
    badgeSummary: {
      badgeIds,
      count: typeof rawBadgeSummary?.count === "number" ? rawBadgeSummary.count : badgeIds.length,
    },
    validUntil: typeof payload.valid_until === "string" ? payload.valid_until : undefined,
    transport: normalizeTransport(rawTransport),
    detail:
      typeof payload.detail === "string"
        ? payload.detail
        : "Session bootstrap completed through the same-origin auth rail.",
  };
}

export async function requestBrowserTransportGrant(
  snapshot: SessionSnapshot,
  signal?: AbortSignal,
): Promise<BrowserTransportGrantResponse> {
  const credentialPath = snapshot.transport.credentialPath;
  if (snapshot.status !== "authenticated" || !credentialPath || !snapshot.transport.grantReady) {
    throw new Error("Browser transport grant is not available for the current session.");
  }

  const response = await fetch(credentialPath, {
    method: snapshot.transport.credentialMethod ?? "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      rail: snapshot.transport.credentialRail ?? "browser_websocket",
      profile: snapshot.transport.credentialProfile ?? "browser_session",
      native_required: snapshot.transport.nativeRequired ?? true,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Browser transport grant returned ${response.status}.`);
  }

  return (await response.json()) as BrowserTransportGrantResponse;
}

export function persistAuthHint() {
  sessionStorage.setItem(authHintStorageKey, "authenticated");
}

export function clearAuthHint() {
  sessionStorage.removeItem(authHintStorageKey);
}

export async function logoutSession(signal?: AbortSignal) {
  const response = await fetch(lookoutEnvironment.logoutPath, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Logout returned ${response.status}.`);
  }
}

export function sessionHintSnapshot(): SessionSnapshot {
  const hinted = sessionStorage.getItem(authHintStorageKey) === "authenticated";
  if (hinted) {
    return {
      status: "authenticated",
      source: "local-hint",
      account: null,
      identity: null,
      context: null,
      interfaceMode: "unknown",
      root: null,
      activePrincipal: null,
      badgeSummary: {
        badgeIds: [],
        count: 0,
      },
      transport: {
        ...defaultTransport,
        path: lookoutEnvironment.natsPath,
      },
      detail:
        "Drawbridge reported a completed login in this tab, but no bootstrap endpoint currently exposes operator identity details.",
    };
  }

  return {
    status: "degraded",
    source: "unknown",
    account: null,
    identity: null,
    context: null,
    interfaceMode: "unknown",
    root: null,
    activePrincipal: null,
    badgeSummary: {
      badgeIds: [],
      count: 0,
    },
    transport: {
      ...defaultTransport,
      path: lookoutEnvironment.natsPath,
    },
    detail:
      "No same-origin session bootstrap endpoint is exposed yet. The shell can still drive auth completion and report the gap honestly.",
  };
}

export function openAuthWindow() {
  const target = `${lookoutEnvironment.authBasePath}/login/${lookoutEnvironment.authProvider}`;
  const width = 560;
  const height = 720;
  const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);

  window.open(
    target,
    "stronghold-lookout-auth",
    `popup=yes,width=${width},height=${height},left=${left},top=${top}`,
  );
}
