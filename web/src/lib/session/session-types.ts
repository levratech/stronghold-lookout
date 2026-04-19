export type SessionStatus =
  | "loading"
  | "unauthenticated"
  | "authenticating"
  | "authenticated"
  | "expired"
  | "degraded"
  | "error";

export type PrincipalType =
  | "human"
  | "agent"
  | "managed"
  | "system"
  | "ephemeral"
  | "unknown";

export interface PrincipalIdentity {
  principalId?: string;
  principalType?: PrincipalType;
  domainId?: string;
  contextId?: string;
  realmId?: string;
  email?: string;
  badgeIds: string[];
  roles: string[];
  interfaceId?: string;
}

export interface RootSessionIdentity extends PrincipalIdentity {}

export interface SessionTransportState {
  path?: string;
  mode?: string;
  ready: boolean;
  detail: string;
}

export interface SessionSnapshot {
  status: SessionStatus;
  source: "bootstrap" | "callback" | "local-hint" | "unknown";
  root: RootSessionIdentity | null;
  activePrincipal: PrincipalIdentity | null;
  transport: SessionTransportState;
  detail: string;
  validUntil?: string;
}

export interface SessionContextValue {
  snapshot: SessionSnapshot;
  login: () => void;
  logout: () => void;
  refresh: () => Promise<void>;
  authBasePath: string;
}
