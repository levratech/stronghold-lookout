import { lookoutEnvironment } from "../../env";
import { headers as natsHeaders, type NatsConnection } from "nats.ws";
import {
  commandAuthHeaderValue,
  signCommandPayload,
} from "../command-signing/command-signing";
import type {
  AccountAuthMethodMutationPayload,
  AccountAuthMethodReadModel,
  AccountReadModel,
  AuthorityAuditEventReadModel,
  AuthorityOverviewReadModel,
  AuthorityReadFilter,
  AuthorityReadSurface,
  AuthorityMutationCommand,
  AuthorityMutationResult,
  BadgeDefinitionMutationPayload,
  BadgeDefinitionReadModel,
  ContextReadModel,
  ContextMutationPayload,
  CreateAccountPayload,
  CreateDurablePrincipalPayload,
  CreateIdentityPayload,
  IdentityReadModel,
  PageInfo,
  PrincipalBadgeGrantMutationPayload,
  PrincipalBadgeGrantReadModel,
  PrincipalKeyMutationPayload,
  PrincipalKeyReadModel,
  PrincipalReadModel,
  ProvisionContextServicePayload,
  ContextServiceBindingReadModel,
  ServiceDefinitionReadModel,
} from "./authority-types";

const commandAuthHeader = "X-Stronghold-Command-Auth";

export interface AuthorityMutationSigningOptions {
  principalId: string;
  identityId?: string;
  keyId?: string;
}

interface AuthorityListResponse<T> {
  page: PageInfo;
  items: T[];
}

export interface AuthorityNatsReadTransport {
  connection?: NatsConnection | null;
  grantToken?: string;
}

interface RawAuthorityListResponse<T> {
  page?: PageInfo;
  accounts?: T[];
  auth_methods?: T[];
  contexts?: T[];
  identities?: T[];
  principals?: T[];
  badge_definitions?: T[];
  badge_grants?: T[];
  service_definitions?: T[];
  service_bindings?: T[];
  principal_keys?: T[];
  audit_events?: T[];
}

export class AuthorityReadError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AuthorityReadError";
    this.status = status;
  }
}

export class AuthorityMutationError extends Error {
  status: number;
  result?: AuthorityMutationResult;

  constructor(status: number, message: string, result?: AuthorityMutationResult) {
    super(message);
    this.name = "AuthorityMutationError";
    this.status = status;
    this.result = result;
  }
}

function authorityReadURL(surface: AuthorityReadSurface, filter: AuthorityReadFilter = {}) {
  const base =
    surface === "overview"
      ? lookoutEnvironment.authorityReadBasePath
      : `${lookoutEnvironment.authorityReadBasePath}/${surface}`;
  const url = new URL(base, window.location.origin);
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

function authorityMutationURL(command: AuthorityMutationCommand) {
  return new URL(`/_/authority/mutate/${command}`, window.location.origin);
}

function authorityReadSubject(surface: AuthorityReadSurface) {
  switch (surface) {
    case "overview":
      return "stronghold.authority.read.overview";
    case "badges":
      return "stronghold.authority.read.badge_definitions";
    case "grants":
      return "stronghold.authority.read.badge_grants";
    case "service_definitions":
      return "stronghold.authority.read.service_definitions";
    case "service_bindings":
      return "stronghold.authority.read.service_bindings";
    case "keys":
      return "stronghold.authority.read.principal_keys";
    case "audit":
      return "stronghold.authority.read.audit_events";
    default:
      return `stronghold.authority.read.${surface}`;
  }
}

function natsReadPayload(filter?: AuthorityReadFilter) {
  if (!filter) {
    return new TextEncoder().encode("{}");
  }
  return new TextEncoder().encode(JSON.stringify(filter));
}

async function readJSON<T>(
  surface: AuthorityReadSurface,
  signal?: AbortSignal,
  filter?: AuthorityReadFilter,
  transport?: AuthorityNatsReadTransport,
): Promise<T> {
  if (transport?.connection && transport.grantToken) {
    const headers = natsHeaders();
    headers.set("Authorization", `Bearer ${transport.grantToken}`);
    const response = await transport.connection.request(
      authorityReadSubject(surface),
      natsReadPayload(filter),
      { timeout: 5_000, headers },
    );
    const payload = JSON.parse(new TextDecoder().decode(response.data || new Uint8Array())) as
      | (T & { error?: string })
      | { error?: string };
    if (payload && typeof payload === "object" && "error" in payload && payload.error) {
      throw new AuthorityReadError(403, payload.error);
    }
    return payload as T;
  }

  const response = await fetch(authorityReadURL(surface, filter), {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    const message =
      response.status === 403
        ? "Authority read denied for the current session."
        : `Authority read returned ${response.status}.`;
    throw new AuthorityReadError(response.status, message);
  }

  return (await response.json()) as T;
}

async function mutateJSON<T extends object>(
  command: AuthorityMutationCommand,
  payload: T,
  signing?: AuthorityMutationSigningOptions,
): Promise<AuthorityMutationResult> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID(),
    "X-Stronghold-Mutation-Reason": "Lookout cockpit operator request",
  };
  if (signing && authorityMutationRequiresSignature(command)) {
    const signedData = {
      command_type: command,
      payload,
    };
    const signature = await signCommandPayload({
      principalId: signing.principalId,
      identityId: signing.identityId,
      keyId: signing.keyId,
      data: signedData,
    });
    headers[commandAuthHeader] = commandAuthHeaderValue(signature, signing.identityId);
  }

  const response = await fetch(authorityMutationURL(command), {
    method: "POST",
    credentials: "same-origin",
    headers,
    body,
  });
  const result = (await response.json()) as AuthorityMutationResult;
  if (!response.ok || result.status !== "accepted") {
    throw new AuthorityMutationError(
      response.status,
      result.message ?? `Authority mutation returned ${response.status}.`,
      result,
    );
  }
  return result;
}

export function authorityMutationRequiresSignature(command: AuthorityMutationCommand) {
  return [
    "principal_badge.grant",
    "principal_badge.revoke",
    "context_service.provision",
    "principal_key.revoke",
    "principal_key.rotate",
  ].includes(command);
}

function normalizeList<T>(payload: RawAuthorityListResponse<T>, key: keyof RawAuthorityListResponse<T>) {
  return {
    items: Array.isArray(payload[key]) ? (payload[key] as T[]) : [],
    page: payload.page ?? { limit: 0 },
  };
}

export function readAuthorityOverview(signal?: AbortSignal, filter?: AuthorityReadFilter, transport?: AuthorityNatsReadTransport) {
  return readJSON<AuthorityOverviewReadModel>("overview", signal, filter, transport);
}

export async function readAccounts(signal?: AbortSignal, filter?: AuthorityReadFilter, transport?: AuthorityNatsReadTransport) {
  const payload = await readJSON<RawAuthorityListResponse<AccountReadModel>>(
    "accounts",
    signal,
    filter,
    transport,
  );
  return normalizeList(payload, "accounts") as AuthorityListResponse<AccountReadModel>;
}

export async function readAccountAuthMethods(signal?: AbortSignal, filter?: AuthorityReadFilter, transport?: AuthorityNatsReadTransport) {
  const payload = await readJSON<RawAuthorityListResponse<AccountAuthMethodReadModel>>(
    "auth_methods",
    signal,
    filter,
    transport,
  );
  return normalizeList(payload, "auth_methods") as AuthorityListResponse<AccountAuthMethodReadModel>;
}

export async function readContexts(signal?: AbortSignal, filter?: AuthorityReadFilter, transport?: AuthorityNatsReadTransport) {
  const payload = await readJSON<RawAuthorityListResponse<ContextReadModel>>(
    "contexts",
    signal,
    filter,
    transport,
  );
  return normalizeList(payload, "contexts") as AuthorityListResponse<ContextReadModel>;
}

export async function readIdentities(signal?: AbortSignal, filter?: AuthorityReadFilter, transport?: AuthorityNatsReadTransport) {
  const payload = await readJSON<RawAuthorityListResponse<IdentityReadModel>>(
    "identities",
    signal,
    filter,
    transport,
  );
  return normalizeList(payload, "identities") as AuthorityListResponse<IdentityReadModel>;
}

export async function readPrincipals(signal?: AbortSignal, filter?: AuthorityReadFilter, transport?: AuthorityNatsReadTransport) {
  const payload = await readJSON<RawAuthorityListResponse<PrincipalReadModel>>(
    "principals",
    signal,
    filter,
    transport,
  );
  return normalizeList(payload, "principals") as AuthorityListResponse<PrincipalReadModel>;
}

export async function readBadgeDefinitions(signal?: AbortSignal, filter?: AuthorityReadFilter, transport?: AuthorityNatsReadTransport) {
  const payload = await readJSON<RawAuthorityListResponse<BadgeDefinitionReadModel>>(
    "badges",
    signal,
    filter,
    transport,
  );
  return normalizeList(payload, "badge_definitions") as AuthorityListResponse<BadgeDefinitionReadModel>;
}

export async function readBadgeGrants(signal?: AbortSignal, filter?: AuthorityReadFilter, transport?: AuthorityNatsReadTransport) {
  const payload = await readJSON<RawAuthorityListResponse<PrincipalBadgeGrantReadModel>>(
    "grants",
    signal,
    filter,
    transport,
  );
  return normalizeList(payload, "badge_grants") as AuthorityListResponse<PrincipalBadgeGrantReadModel>;
}

export async function readServiceDefinitions(signal?: AbortSignal, filter?: AuthorityReadFilter, transport?: AuthorityNatsReadTransport) {
  const payload = await readJSON<RawAuthorityListResponse<ServiceDefinitionReadModel>>(
    "service_definitions",
    signal,
    filter,
    transport,
  );
  return normalizeList(payload, "service_definitions") as AuthorityListResponse<ServiceDefinitionReadModel>;
}

export async function readServiceBindings(signal?: AbortSignal, filter?: AuthorityReadFilter, transport?: AuthorityNatsReadTransport) {
  const payload = await readJSON<RawAuthorityListResponse<ContextServiceBindingReadModel>>(
    "service_bindings",
    signal,
    filter,
    transport,
  );
  return normalizeList(payload, "service_bindings") as AuthorityListResponse<ContextServiceBindingReadModel>;
}

export async function readPrincipalKeys(signal?: AbortSignal, filter?: AuthorityReadFilter, transport?: AuthorityNatsReadTransport) {
  const payload = await readJSON<RawAuthorityListResponse<PrincipalKeyReadModel>>(
    "keys",
    signal,
    filter,
    transport,
  );
  return normalizeList(payload, "principal_keys") as AuthorityListResponse<PrincipalKeyReadModel>;
}

export async function readAuthorityAuditEvents(signal?: AbortSignal, filter?: AuthorityReadFilter, transport?: AuthorityNatsReadTransport) {
  const payload = await readJSON<RawAuthorityListResponse<AuthorityAuditEventReadModel>>(
    "audit",
    signal,
    filter,
    transport,
  );
  return normalizeList(payload, "audit_events") as AuthorityListResponse<AuthorityAuditEventReadModel>;
}

export function createAccount(payload: CreateAccountPayload, signing?: AuthorityMutationSigningOptions) {
  return mutateJSON("account.create", payload, signing);
}

export function linkAccountAuthMethod(payload: AccountAuthMethodMutationPayload, signing?: AuthorityMutationSigningOptions) {
  return mutateJSON("account_auth_method.link", payload, signing);
}

export function revokeAccountAuthMethod(payload: AccountAuthMethodMutationPayload, signing?: AuthorityMutationSigningOptions) {
  return mutateJSON("account_auth_method.revoke", payload, signing);
}

export function setAccountAuthMethodStatus(payload: AccountAuthMethodMutationPayload, signing?: AuthorityMutationSigningOptions) {
  return mutateJSON("account_auth_method.status", payload, signing);
}

export function createIdentity(payload: CreateIdentityPayload, signing?: AuthorityMutationSigningOptions) {
  return mutateJSON("identity.create", payload, signing);
}

export function createDurablePrincipal(payload: CreateDurablePrincipalPayload, signing?: AuthorityMutationSigningOptions) {
  return mutateJSON("principal.create_durable", payload, signing);
}

export function createContext(payload: ContextMutationPayload, signing?: AuthorityMutationSigningOptions) {
  return mutateJSON("context.create", payload, signing);
}

export function updateContext(payload: ContextMutationPayload, signing?: AuthorityMutationSigningOptions) {
  return mutateJSON("context.update", payload, signing);
}

export function createBadgeDefinition(payload: BadgeDefinitionMutationPayload, signing?: AuthorityMutationSigningOptions) {
  return mutateJSON("badge_definition.create", payload, signing);
}

export function updateBadgeDefinition(payload: BadgeDefinitionMutationPayload, signing?: AuthorityMutationSigningOptions) {
  return mutateJSON("badge_definition.update", payload, signing);
}

export function archiveBadgeDefinition(payload: BadgeDefinitionMutationPayload, signing?: AuthorityMutationSigningOptions) {
  return mutateJSON("badge_definition.archive", payload, signing);
}

export function grantPrincipalBadge(payload: PrincipalBadgeGrantMutationPayload, signing?: AuthorityMutationSigningOptions) {
  return mutateJSON("principal_badge.grant", payload, signing);
}

export function revokePrincipalBadge(payload: PrincipalBadgeGrantMutationPayload, signing?: AuthorityMutationSigningOptions) {
  return mutateJSON("principal_badge.revoke", payload, signing);
}

export function provisionContextService(payload: ProvisionContextServicePayload, signing?: AuthorityMutationSigningOptions) {
  return mutateJSON("context_service.provision", payload, signing);
}

export function registerPrincipalKey(payload: PrincipalKeyMutationPayload) {
  return mutateJSON("principal_key.register", payload);
}

export function revokePrincipalKey(payload: PrincipalKeyMutationPayload, signing?: AuthorityMutationSigningOptions) {
  return mutateJSON("principal_key.revoke", payload, signing);
}

export function rotatePrincipalKey(payload: PrincipalKeyMutationPayload, signing?: AuthorityMutationSigningOptions) {
  return mutateJSON("principal_key.rotate", payload, signing);
}
