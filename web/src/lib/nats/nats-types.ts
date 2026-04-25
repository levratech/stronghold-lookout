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
  connectedServer?: string;
  connection?: NatsConnection | null;
  reconnects: number;
  connect: () => Promise<void>;
  disconnect: () => void;
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
