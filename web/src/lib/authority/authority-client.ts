import { lookoutEnvironment } from "../../env";
import type {
  AccountReadModel,
  AuthorityOverviewReadModel,
  AuthorityReadFilter,
  AuthorityReadSurface,
  BadgeDefinitionReadModel,
  ContextReadModel,
  IdentityReadModel,
  PageInfo,
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
