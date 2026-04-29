export interface PageInfo {
  limit: number;
  next_cursor?: string;
}

export interface AccountReadModel {
  id: string;
  domain_id: string;
  email: string;
  provider_id?: string;
  auth_method_count?: number;
  auth_providers?: string[];
}

export interface AccountAuthMethodReadModel {
  id: string;
  account_id: string;
  domain_id: string;
  method_type: string;
  provider: string;
  email?: string;
  subject_present: boolean;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface ContextReadModel {
  id: string;
  parent_id?: string;
  parent_name?: string;
  root_context_id?: string;
  name: string;
  description?: string;
  kind?: "organization" | "personal" | "system";
  domain?: string;
  owner_identity_id?: string;
  created_by_identity_id?: string;
  depth?: number;
  child_count?: number;
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
  effective_context_id?: string;
  inherited?: boolean;
  scope_mode?: string;
  permission: string;
  granted_by_principal_id?: string;
  reason?: string;
  created_at?: string;
  revoked_at?: string;
}

export interface ServiceDefinitionReadModel {
  id: string;
  service_key: string;
  name: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ContextServiceBindingReadModel {
  id: string;
  context_id: string;
  service_id: string;
  service_key?: string;
  scope_mode: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  revoked_at?: string;
}

export interface PrincipalKeyReadModel {
  id: string;
  principal_id: string;
  key_id: string;
  algorithm: string;
  status: string;
  issuer_signature_present?: boolean;
  created_at?: string;
  expires_at?: string;
  revoked_at?: string;
}

export interface AuthorityAuditEventReadModel {
  id: string;
  event_type: string;
  resource_type: string;
  resource_id: string;
  actor_principal_id?: string;
  target_principal_id?: string;
  context_id?: string;
  status: string;
  error_code?: string;
  reason?: string;
  correlation_id?: string;
  created_at?: string;
}

export interface AuthorityOverviewReadModel {
  accounts?: AccountReadModel[];
  auth_methods?: AccountAuthMethodReadModel[];
  contexts?: ContextReadModel[];
  identities?: IdentityReadModel[];
  principals?: PrincipalReadModel[];
  badge_definitions?: BadgeDefinitionReadModel[];
  badge_grants?: PrincipalBadgeGrantReadModel[];
  service_definitions?: ServiceDefinitionReadModel[];
  service_bindings?: ContextServiceBindingReadModel[];
  principal_keys?: PrincipalKeyReadModel[];
  audit_events?: AuthorityAuditEventReadModel[];
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
  | "auth_methods"
  | "contexts"
  | "identities"
  | "principals"
  | "badges"
  | "grants"
  | "service_definitions"
  | "service_bindings"
  | "keys"
  | "audit";

export type AuthorityLoadStatus = "idle" | "loading" | "ready" | "denied" | "empty" | "error";

export type AuthorityMutationCommand =
  | "account.create"
  | "account_auth_method.link"
  | "account_auth_method.revoke"
  | "account_auth_method.status"
  | "subject.create"
  | "identity.create"
  | "principal.create_durable"
  | "context.create"
  | "context.update"
  | "badge_definition.create"
  | "badge_definition.update"
  | "badge_definition.archive"
  | "principal_badge.grant"
  | "principal_badge.revoke"
  | "context_service.provision"
  | "principal_key.register"
  | "principal_key.revoke"
  | "principal_key.rotate";

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

export interface AccountAuthMethodMutationPayload {
  method_id?: string;
  account_id?: string;
  domain_id?: string;
  method_type?: string;
  provider?: string;
  subject?: string;
  email?: string;
  status?: string;
}

export interface CreateIdentityPayload {
  identity_id?: string;
  account_id: string;
  context_id: string;
  principal_id?: string;
}

export interface SubjectCreationPayload {
  subject_type: "person" | "agent" | "service";
  context_id: string;
  account_id?: string;
  email?: string;
  identity_id?: string;
  principal_id?: string;
  interactive_login_allowed?: boolean;
  token_key_required?: boolean;
  personal_context_requested?: boolean;
  service_key?: string;
  key_id?: string;
  algorithm?: string;
  public_key?: string;
  dry_run?: boolean;
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
  description?: string;
  kind?: "organization" | "personal" | "system";
  domain?: string;
  owner_identity_id?: string;
  created_by_identity_id?: string;
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
  scope_mode?: string;
  reason?: string;
}

export interface ProvisionContextServicePayload {
  service_id?: string;
  service_key: string;
  name?: string;
  description?: string;
  binding_id?: string;
  context_id?: string;
  binding_scope_mode?: string;
  principal_id?: string;
  account_id?: string;
  key_id: string;
  algorithm?: string;
  public_key: string;
  registration_id?: string;
  initial_grants?: PrincipalBadgeGrantMutationPayload[];
}

export interface PrincipalKeyMutationPayload {
  principal_id: string;
  key_id: string;
  old_key_id?: string;
  algorithm?: string;
  public_key?: string;
}
