import { lookoutEnvironment } from "../../env";
import type { SessionSnapshot } from "./session-types";

const authHintStorageKey = "lookout.session.hint";

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

  return {
    principalId: typeof raw.principal_id === "string" ? raw.principal_id : undefined,
    domainId: typeof raw.domain_id === "string" ? raw.domain_id : undefined,
    contextId: typeof raw.context_id === "string" ? raw.context_id : undefined,
    realmId: typeof raw.realm_id === "string" ? raw.realm_id : undefined,
    email: typeof raw.email === "string" ? raw.email : undefined,
    badgeIds,
    roles,
  };
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
      operator: null,
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
      operator: null,
      detail: `Session bootstrap returned ${response.status}. The cockpit is ready, but the estate is not exposing identity bootstrap data yet.`,
    };
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const operator = normalizeIdentity(
    payload.operator && typeof payload.operator === "object"
      ? (payload.operator as Record<string, unknown>)
      : payload,
  );

  return {
    status: "authenticated",
    source: "bootstrap",
    operator,
    validUntil: typeof payload.valid_until === "string" ? payload.valid_until : undefined,
    natsAuthToken:
      payload.nats_ws &&
      typeof payload.nats_ws === "object" &&
      typeof (payload.nats_ws as Record<string, unknown>).auth_token === "string"
        ? ((payload.nats_ws as Record<string, unknown>).auth_token as string)
        : undefined,
    detail:
      typeof payload.detail === "string"
        ? payload.detail
        : "Session bootstrap completed through the same-origin auth rail.",
  };
}

export function persistAuthHint() {
  sessionStorage.setItem(authHintStorageKey, "authenticated");
}

export function clearAuthHint() {
  sessionStorage.removeItem(authHintStorageKey);
}

export function sessionHintSnapshot(): SessionSnapshot {
  const hinted = sessionStorage.getItem(authHintStorageKey) === "authenticated";
  if (hinted) {
    return {
      status: "authenticated",
      source: "local-hint",
      operator: null,
      detail:
        "Drawbridge reported a completed login in this tab, but no bootstrap endpoint currently exposes operator identity details.",
    };
  }

  return {
    status: "degraded",
    source: "unknown",
    operator: null,
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
