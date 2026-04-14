export type SessionStatus =
  | "loading"
  | "unauthenticated"
  | "authenticating"
  | "authenticated"
  | "expired"
  | "degraded"
  | "error";

export interface OperatorIdentity {
  principalId?: string;
  domainId?: string;
  contextId?: string;
  realmId?: string;
  email?: string;
  badgeIds: string[];
  roles: string[];
}

export interface SessionSnapshot {
  status: SessionStatus;
  source: "bootstrap" | "callback" | "local-hint" | "unknown";
  operator: OperatorIdentity | null;
  detail: string;
  validUntil?: string;
  natsAuthToken?: string;
}

export interface SessionContextValue {
  snapshot: SessionSnapshot;
  login: () => void;
  logout: () => void;
  refresh: () => Promise<void>;
  authBasePath: string;
}
