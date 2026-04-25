export interface PageInfo {
  limit: number;
  next_cursor?: string;
}

export interface AccountReadModel {
  id: string;
  domain_id: string;
  email: string;
  provider_id?: string;
}

export interface ContextReadModel {
  id: string;
  parent_id?: string;
  name: string;
}

export interface PrincipalReadModel {
  id: string;
  account_id?: string;
  context_id: string;
  principal_type: string;
  is_ephemeral: boolean;
  minted_by_principal_id?: string;
  authority_root_principal_id?: string;
  expires_at?: string;
  revoked_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface IdentityReadModel {
  id: string;
  account_id: string;
  context_id: string;
  principal_id: string;
  principal: PrincipalReadModel;
  badge_ids?: string[];
  lineage?: PrincipalReadModel[];
}

export interface BadgeDefinitionReadModel {
  id: string;
  context_id: string;
  name: string;
  description?: string;
  archived_at?: string;
}

export interface PrincipalBadgeGrantReadModel {
  id: string;
  principal_id: string;
  badge_id: string;
  context_id: string;
  permission: string;
  granted_by_principal_id?: string;
  reason?: string;
  created_at?: string;
  revoked_at?: string;
}

export interface PrincipalKeyReadModel {
  id: string;
  principal_id: string;
  key_id: string;
  algorithm: string;
  status: string;
  created_at?: string;
  expires_at?: string;
  revoked_at?: string;
}

export interface AuthorityOverviewReadModel {
  accounts?: AccountReadModel[];
  contexts?: ContextReadModel[];
  identities?: IdentityReadModel[];
  principals?: PrincipalReadModel[];
  badge_definitions?: BadgeDefinitionReadModel[];
  badge_grants?: PrincipalBadgeGrantReadModel[];
  principal_keys?: PrincipalKeyReadModel[];
  page: PageInfo;
}

export interface AuthorityReadFilter {
  account_id?: string;
  identity_id?: string;
  principal_id?: string;
  context_id?: string;
  status?: string;
  limit?: number;
  cursor?: string;
}

export type AuthorityReadSurface =
  | "overview"
  | "accounts"
  | "contexts"
  | "identities"
  | "principals"
  | "badges"
  | "grants"
  | "keys";

export type AuthorityLoadStatus = "idle" | "loading" | "ready" | "denied" | "empty" | "error";

export type AuthorityMutationCommand =
  | "account.create"
  | "identity.create"
  | "principal.create_durable"
  | "context.create"
  | "context.update"
  | "badge_definition.create"
  | "badge_definition.update"
  | "badge_definition.archive"
  | "principal_badge.grant"
  | "principal_badge.revoke";

export type AuthorityMutationStatus = "accepted" | "denied" | "invalid" | "error";

export interface AuthorityMutationResult {
  status: AuthorityMutationStatus;
  command_type?: AuthorityMutationCommand;
  command_id?: string;
  idempotency_key?: string;
  actor_principal_id?: string;
  target_context_id?: string;
  resource_type?: string;
  resource_id?: string;
  message?: string;
  error_code?: string;
  correlation_id?: string;
  decided_at: string;
}

export interface CreateAccountPayload {
  account_id?: string;
  domain_id: string;
  email: string;
  password?: string;
  provider_id?: string;
}

export interface CreateIdentityPayload {
  identity_id?: string;
  account_id: string;
  context_id: string;
  principal_id?: string;
}

export interface CreateDurablePrincipalPayload {
  principal_id?: string;
  account_id?: string;
  context_id?: string;
  principal_type: "node" | "app" | "service" | "durable_agent" | "agent" | "managed";
  parent_principal_id?: string;
}

export interface ContextMutationPayload {
  context_id?: string;
  parent_id?: string;
  name: string;
}

export interface BadgeDefinitionMutationPayload {
  badge_id?: string;
  context_id?: string;
  name?: string;
  description?: string;
}

export interface PrincipalBadgeGrantMutationPayload {
  principal_id: string;
  badge_id: string;
  context_id: string;
  permission: string;
  reason?: string;
}
