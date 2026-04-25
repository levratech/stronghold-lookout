import { lookoutEnvironment } from "../../env";
import type {
  AccountReadModel,
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
  PrincipalKeyReadModel,
  PrincipalReadModel,
} from "./authority-types";

interface AuthorityListResponse<T> {
  page: PageInfo;
  items: T[];
}

interface RawAuthorityListResponse<T> {
  page?: PageInfo;
  accounts?: T[];
  contexts?: T[];
  identities?: T[];
  principals?: T[];
  badge_definitions?: T[];
  badge_grants?: T[];
  principal_keys?: T[];
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

async function readJSON<T>(
  surface: AuthorityReadSurface,
  signal?: AbortSignal,
  filter?: AuthorityReadFilter,
): Promise<T> {
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
): Promise<AuthorityMutationResult> {
  const response = await fetch(authorityMutationURL(command), {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
      "X-Stronghold-Mutation-Reason": "Lookout cockpit operator request",
    },
    body: JSON.stringify(payload),
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

function normalizeList<T>(payload: RawAuthorityListResponse<T>, key: keyof RawAuthorityListResponse<T>) {
  return {
    items: Array.isArray(payload[key]) ? (payload[key] as T[]) : [],
    page: payload.page ?? { limit: 0 },
  };
}

export function readAuthorityOverview(signal?: AbortSignal, filter?: AuthorityReadFilter) {
  return readJSON<AuthorityOverviewReadModel>("overview", signal, filter);
}

export async function readAccounts(signal?: AbortSignal, filter?: AuthorityReadFilter) {
  const payload = await readJSON<RawAuthorityListResponse<AccountReadModel>>(
    "accounts",
    signal,
    filter,
  );
  return normalizeList(payload, "accounts") as AuthorityListResponse<AccountReadModel>;
}

export async function readContexts(signal?: AbortSignal, filter?: AuthorityReadFilter) {
  const payload = await readJSON<RawAuthorityListResponse<ContextReadModel>>(
    "contexts",
    signal,
    filter,
  );
  return normalizeList(payload, "contexts") as AuthorityListResponse<ContextReadModel>;
}

export async function readIdentities(signal?: AbortSignal, filter?: AuthorityReadFilter) {
  const payload = await readJSON<RawAuthorityListResponse<IdentityReadModel>>(
    "identities",
    signal,
    filter,
  );
  return normalizeList(payload, "identities") as AuthorityListResponse<IdentityReadModel>;
}

export async function readPrincipals(signal?: AbortSignal, filter?: AuthorityReadFilter) {
  const payload = await readJSON<RawAuthorityListResponse<PrincipalReadModel>>(
    "principals",
    signal,
    filter,
  );
  return normalizeList(payload, "principals") as AuthorityListResponse<PrincipalReadModel>;
}

export async function readBadgeDefinitions(signal?: AbortSignal, filter?: AuthorityReadFilter) {
  const payload = await readJSON<RawAuthorityListResponse<BadgeDefinitionReadModel>>(
    "badges",
    signal,
    filter,
  );
  return normalizeList(payload, "badge_definitions") as AuthorityListResponse<BadgeDefinitionReadModel>;
}

export async function readBadgeGrants(signal?: AbortSignal, filter?: AuthorityReadFilter) {
  const payload = await readJSON<RawAuthorityListResponse<PrincipalBadgeGrantReadModel>>(
    "grants",
    signal,
    filter,
  );
  return normalizeList(payload, "badge_grants") as AuthorityListResponse<PrincipalBadgeGrantReadModel>;
}

export async function readPrincipalKeys(signal?: AbortSignal, filter?: AuthorityReadFilter) {
  const payload = await readJSON<RawAuthorityListResponse<PrincipalKeyReadModel>>(
    "keys",
    signal,
    filter,
  );
  return normalizeList(payload, "principal_keys") as AuthorityListResponse<PrincipalKeyReadModel>;
}

export function createAccount(payload: CreateAccountPayload) {
  return mutateJSON("account.create", payload);
}

export function createIdentity(payload: CreateIdentityPayload) {
  return mutateJSON("identity.create", payload);
}

export function createDurablePrincipal(payload: CreateDurablePrincipalPayload) {
  return mutateJSON("principal.create_durable", payload);
}

export function createContext(payload: ContextMutationPayload) {
  return mutateJSON("context.create", payload);
}

export function updateContext(payload: ContextMutationPayload) {
  return mutateJSON("context.update", payload);
}

export function createBadgeDefinition(payload: BadgeDefinitionMutationPayload) {
  return mutateJSON("badge_definition.create", payload);
}

export function updateBadgeDefinition(payload: BadgeDefinitionMutationPayload) {
  return mutateJSON("badge_definition.update", payload);
}

export function archiveBadgeDefinition(payload: BadgeDefinitionMutationPayload) {
  return mutateJSON("badge_definition.archive", payload);
}

export function grantPrincipalBadge(payload: PrincipalBadgeGrantMutationPayload) {
  return mutateJSON("principal_badge.grant", payload);
}

export function revokePrincipalBadge(payload: PrincipalBadgeGrantMutationPayload) {
  return mutateJSON("principal_badge.revoke", payload);
}
