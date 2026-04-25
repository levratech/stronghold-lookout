import type { NatsConnection, NatsError } from "nats.ws";

export type NatsConnectionState =
  | "disconnected"
  | "credentialing"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "auth_error"
  | "credential_error"
  | "rail_error"
  | "error";

export interface NatsContextValue {
  state: NatsConnectionState;
  detail: string;
  serverURL: string;
  lastError?: string;
  lastDeniedAction?: string;
  connectedServer?: string;
  grantToken?: string;
  grantPosture?: NatsGrantPosture;
  connection?: NatsConnection | null;
  reconnects: number;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export interface NatsGrantPermissions {
  pubAllow: string[];
  pubDeny: string[];
  subAllow: string[];
  subDeny: string[];
}

export interface NatsGrantPosture {
  source: "session-grant";
  credentialFormat?: string;
  credentialId?: string;
  principalId?: string;
  activePrincipalId?: string;
  contextId?: string;
  rail?: string;
  profile?: string;
  issuedAt?: string;
  expiresAt?: string;
  refreshable?: boolean;
  nativeCredential: boolean;
  userPublicKey?: string;
  permissions?: NatsGrantPermissions;
}

export function describeNatsError(error: NatsError | Error | unknown) {
  if (!error) {
    return "Unknown NATS transport error.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
