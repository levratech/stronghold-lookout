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
  accountId?: string;
  identityId?: string;
  principalId?: string;
  principalType?: PrincipalType;
  authorityRootPrincipalId?: string;
  domainId?: string;
  contextId?: string;
  realmId?: string;
  email?: string;
  badgeIds: string[];
  roles: string[];
  interfaceId?: string;
}

export interface RootSessionIdentity extends PrincipalIdentity {}

export interface AccountSessionIdentity {
  accountId?: string;
  userId?: string;
  domainId?: string;
}

export interface ContextSessionState {
  contextId?: string;
  realmId?: string;
  domainId?: string;
  interfaceId?: string;
}

export interface BadgeSummary {
  badgeIds: string[];
  count: number;
}

export interface SessionTransportState {
  path?: string;
  mode?: string;
  ready: boolean;
  detail: string;
}

export interface SessionSnapshot {
  status: SessionStatus;
  source: "bootstrap" | "callback" | "local-hint" | "unknown";
  account: AccountSessionIdentity | null;
  identity: PrincipalIdentity | null;
  context: ContextSessionState | null;
  root: RootSessionIdentity | null;
  activePrincipal: PrincipalIdentity | null;
  badgeSummary: BadgeSummary;
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
