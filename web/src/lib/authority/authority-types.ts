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
  domain_id?: string;
  parent_id?: string;
  parent_name?: string;
  root_scope_id?: string;
  root_context_id?: string;
  name: string;
  description?: string;
  kind?: "organization" | "personal" | "system";
  domain?: string;
  owner_identity_id?: string;
  created_by_identity_id?: string;
  archived_at?: string;
  depth?: number;
  child_count?: number;
}

export interface PrincipalReadModel {
  id: string;
  account_id?: string;
  domain_id?: string;
  scope_id?: string;
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
  domain_id?: string;
  scope_id?: string;
  context_id: string;
  principal_id: string;
  principal: PrincipalReadModel;
  badge_ids?: string[];
  lineage?: PrincipalReadModel[];
}

export interface BadgeDefinitionReadModel {
  id: string;
  scope_id?: string;
  context_id: string;
  name: string;
  description?: string;
  archived_at?: string;
}

export interface PrincipalBadgeGrantReadModel {
  id: string;
  principal_id: string;
  badge_id: string;
  scope_id?: string;
  context_id: string;
  effective_scope_id?: string;
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
  scope_id?: string;
  context_id: string;
  service_id: string;
  service_key?: string;
  scope_mode: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  revoked_at?: string;
}

export interface AccountNamespaceReadModel {
  id: string;
  name: string;
  owning_scope_id?: string;
  owning_context_id: string;
  default_scope_id?: string;
  default_context_id: string;
  status: string;
  archived_at?: string;
}

export interface InterfaceBindingReadModel {
  id: string;
  interface_key: string;
  account_namespace_id: string;
  owning_scope_id?: string;
  owning_context_id: string;
  default_scope_id?: string;
  default_context_id: string;
  display_name?: string;
  status: string;
  archived_at?: string;
}

export interface DomainBindingReadModel {
  id: string;
  interface_id: string;
  hostname: string;
  kind: string;
  verification_status: string;
  tls_status: string;
  status: string;
  verification_ready: boolean;
  tls_ready: boolean;
  verified_at?: string;
  archived_at?: string;
}

export interface InterfaceAuthProviderConfigReadModel {
  id: string;
  interface_id: string;
  domain_binding_id?: string;
  provider: string;
  client_id_present: boolean;
  client_secret_present: boolean;
  auth_url_present?: boolean;
  token_url_present?: boolean;
  userinfo_url_present?: boolean;
  scopes?: string[];
  redirect_path?: string;
  enrollment_policy?: string;
  status: string;
  redacted: boolean;
  archived_at?: string;
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
  scope_id?: string;
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
  scopes?: ContextReadModel[];
  contexts?: ContextReadModel[];
  identities?: IdentityReadModel[];
  principals?: PrincipalReadModel[];
  badge_definitions?: BadgeDefinitionReadModel[];
  badge_grants?: PrincipalBadgeGrantReadModel[];
  service_definitions?: ServiceDefinitionReadModel[];
  service_bindings?: ContextServiceBindingReadModel[];
  account_namespaces?: AccountNamespaceReadModel[];
  interfaces?: InterfaceBindingReadModel[];
  domain_bindings?: DomainBindingReadModel[];
  interface_auth_providers?: InterfaceAuthProviderConfigReadModel[];
  principal_keys?: PrincipalKeyReadModel[];
  audit_events?: AuthorityAuditEventReadModel[];
  page: PageInfo;
}

export interface AuthorityReadFilter {
  account_id?: string;
  identity_id?: string;
  principal_id?: string;
  domain_id?: string;
  scope_id?: string;
  context_id?: string;
  status?: string;
  limit?: number;
  cursor?: string;
}

export type AuthorityReadSurface =
  | "overview"
  | "accounts"
  | "auth_methods"
  | "scopes"
  | "contexts"
  | "identities"
  | "principals"
  | "badges"
  | "grants"
  | "service_definitions"
  | "service_bindings"
  | "account_namespaces"
  | "interfaces"
  | "domain_bindings"
  | "interface_auth_providers"
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
  | "scope.create"
  | "scope.create_child"
  | "scope.create_org_root"
  | "scope.create_personal_root"
  | "scope.update"
  | "scope.archive"
  | "scope.transfer_ownership"
  | "context.create"
  | "context.create_child"
  | "context.create_org_root"
  | "context.create_personal_root"
  | "context.update"
  | "context.archive"
  | "context.transfer_ownership"
  | "badge_definition.create"
  | "badge_definition.update"
  | "badge_definition.archive"
  | "principal_badge.grant"
  | "principal_badge.revoke"
  | "scope_service.provision"
  | "context_service.provision"
  | "domain_binding.create"
  | "domain_binding.verify"
  | "domain_binding.enable"
  | "domain_binding.disable"
  | "domain_binding.archive"
  | "interface_auth_provider.upsert"
  | "interface_auth_provider.archive"
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
  target_scope_id?: string;
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

export interface ContextArchivePayload {
  context_id: string;
}

export interface ContextOwnershipTransferPayload {
  context_id: string;
  owner_identity_id: string;
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

export interface DomainBindingMutationPayload {
  domain_binding_id?: string;
  interface_id?: string;
  hostname?: string;
  kind?: string;
  verification_token?: string;
}

export interface InterfaceAuthProviderMutationPayload {
  config_id?: string;
  interface_id?: string;
  domain_binding_id?: string;
  provider?: string;
  client_id_ref?: string;
  client_secret_ref?: string;
  auth_url_ref?: string;
  token_url_ref?: string;
  userinfo_url_ref?: string;
  scopes?: string[];
  redirect_path?: string;
  enrollment_policy?: string;
  status?: string;
}
