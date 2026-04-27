import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useParams } from "react-router-dom";
import { connect, credsAuthenticator, type NatsConnection } from "nats.ws";
import { Panel } from "../../components/ui/Panel";
import { StatusPill } from "../../components/ui/StatusPill";
import { ResourceInterfaceShell } from "../../components/resource/ResourceInterfaceShell";
import { useNats } from "../../lib/nats/NatsProvider";
import { describeNatsError, type NatsPermissionProbeResult } from "../../lib/nats/nats-types";
import { useSession } from "../../lib/session/SessionProvider";
import {
  AuthorityReadError,
  AuthorityMutationError,
  authorityMutationRequiresSignature,
  archiveBadgeDefinition,
  createAccount,
  createBadgeDefinition,
  createContext,
  createDurablePrincipal,
  createIdentity,
  createSubject,
  grantPrincipalBadge,
  linkAccountAuthMethod,
  provisionContextService,
  readAccounts,
  readAccountAuthMethods,
  readAuthorityAuditEvents,
  readBadgeDefinitions,
  readBadgeGrants,
  readContexts,
  readIdentities,
  readPrincipalKeys,
  readPrincipals,
  readServiceBindings,
  readServiceDefinitions,
  registerPrincipalKey,
  revokeAccountAuthMethod,
  revokePrincipalBadge,
  revokePrincipalKey,
  rotatePrincipalKey,
  setAccountAuthMethodStatus,
  updateBadgeDefinition,
  updateContext,
  type AuthorityMutationSigningOptions,
} from "../../lib/authority/authority-client";
import type {
  AccountAuthMethodReadModel,
  AccountReadModel,
  AuthorityAuditEventReadModel,
  AuthorityMutationCommand,
  AuthorityMutationResult,
  AuthorityReadFilter,
  AuthorityLoadStatus,
  BadgeDefinitionReadModel,
  ContextServiceBindingReadModel,
  ContextReadModel,
  IdentityReadModel,
  PrincipalBadgeGrantReadModel,
  PrincipalKeyReadModel,
  PrincipalReadModel,
  ServiceDefinitionReadModel,
} from "../../lib/authority/authority-types";
import type {
  ResourceInterfaceState,
  ResourceListColumn,
  ResourceRecordSummary,
} from "../../components/resource/resource-types";
import {
  commandAuthHeaderValue,
  generateAndStoreBrowserCommandSigningKey,
  getCommandSigningPosture,
  signCommandPayload,
  type CommandPayloadSignature,
  type CommandSigningPosture,
} from "../../lib/command-signing/command-signing";
import { lookoutModules, type LookoutModuleDefinition } from "../../shell/module-registry";

const authorityModules = lookoutModules.filter((module) =>
  module.route.startsWith("/authority/"),
);

const contextPermissionCatalog = [
  "context.read",
  "context.admin",
  "identity.read",
  "identity.manage",
  "principal.read",
  "principal.manage",
  "badge.read",
  "badge.manage",
  "key.read",
  "key.manage",
  "files.read",
  "files.write",
  "agents.request",
  "agents.execute",
  "services.invoke",
];

const surfaceNotes: Record<string, string[]> = {
  accounts: [
    "Read account/user records without password hashes or OAuth secrets.",
    "Show enrollment posture before exposing any account creation controls.",
    "Use Sentry authority reads only; Lookout must not talk directly to Postgres.",
  ],
  "auth-methods": [
    "Show account authentication methods as ways to prove access to an account.",
    "Never treat Google, password, or provider bindings as identities, badges, or principal authority.",
    "Provider subjects and password material stay redacted; status changes alter account access posture only.",
  ],
  identities: [
    "Show identity records linked to accounts and contexts.",
    "Surface paired principal IDs and lineage without collapsing identity into user.",
    "Preserve root versus active principal language from session bootstrap.",
  ],
  contexts: [
    "Show the context tree and current context scope.",
    "Make context boundaries explicit before badge mutation work begins.",
    "Keep context inspection read-only in this phase.",
  ],
  badges: [
    "Show context-scoped badge definitions.",
    "Explain badges as authority labels, not implicit permissions by ownership.",
    "Defer badge creation and editing to controlled mutation phases.",
  ],
  grants: [
    "Show explicit badge grants to principals.",
    "Include direct/subtree scope, inherited posture, effective context, and revoked state when available.",
    "Make account sibling identity leakage visually obvious instead of implying grants are account-wide.",
  ],
  services: [
    "Show service definitions separately from context service bindings.",
    "Provision service principals with service-held public keys only; never paste private key material.",
    "Expose permission lane posture as badge-scoped, context-bound service visibility.",
  ],
  principals: [
    "Show principal types: human, node/service/app/agent, system, and ephemeral.",
    "Separate ownership/provenance from permission grants.",
    "Keep durable and ephemeral posture visible without merging them.",
  ],
  keys: [
    "Show key IDs, algorithm, status, created, expiry, and revoked state.",
    "Never show public key material, private key material, or metadata blobs that may leak secrets.",
    "Level 3 browser command signing requires native WebCrypto Ed25519 or Lookout Desktop.",
  ],
  providers: [
    "Show Drawbridge provider posture and missing-header state.",
    "Confirm OAuth secrets and client IDs remain redacted.",
    "Defer provider mutation to controlled authority-management work.",
  ],
  transport: [
    "Show browser transport readiness separately from login state.",
    "Request only short-lived scoped credentials through session-backed or signed delegated grant routes.",
    "Exercise service and agent delegated credentials without rendering native creds material.",
  ],
  audit: [
    "Show authority audit events as evidence, not as canonical authority state.",
    "Start with key lifecycle audit readback while broader mutation auditing lands deliberately.",
    "Use this surface for operator confidence after register, revoke, and rotate flows.",
  ],
};

function findModule(slug: string | undefined): LookoutModuleDefinition | undefined {
  return authorityModules.find((module) => module.route === `/authority/${slug}`);
}

type LiveReadState =
  | {
      status: "idle";
      detail: string;
      accounts: AccountReadModel[];
      authMethods: AccountAuthMethodReadModel[];
      contexts: ContextReadModel[];
      identities: IdentityReadModel[];
      badges: BadgeDefinitionReadModel[];
      principals: PrincipalReadModel[];
      grants: PrincipalBadgeGrantReadModel[];
      serviceDefinitions: ServiceDefinitionReadModel[];
      serviceBindings: ContextServiceBindingReadModel[];
      keys: PrincipalKeyReadModel[];
      auditEvents: AuthorityAuditEventReadModel[];
    }
  | {
      status: AuthorityLoadStatus;
      detail: string;
      accounts: AccountReadModel[];
      authMethods: AccountAuthMethodReadModel[];
      contexts: ContextReadModel[];
      identities: IdentityReadModel[];
      badges: BadgeDefinitionReadModel[];
      principals: PrincipalReadModel[];
      grants: PrincipalBadgeGrantReadModel[];
      serviceDefinitions: ServiceDefinitionReadModel[];
      serviceBindings: ContextServiceBindingReadModel[];
      keys: PrincipalKeyReadModel[];
      auditEvents: AuthorityAuditEventReadModel[];
    };

function statusTone(status: AuthorityLoadStatus) {
  switch (status) {
    case "ready":
      return "success" as const;
    case "denied":
    case "error":
      return "danger" as const;
    case "empty":
    case "loading":
      return "warning" as const;
    default:
      return "neutral" as const;
  }
}

function sessionTone(status: string) {
  switch (status) {
    case "authenticated":
      return "success" as const;
    case "authenticating":
    case "degraded":
    case "loading":
      return "warning" as const;
    case "error":
    case "expired":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

function natsTone(status: string) {
  switch (status) {
    case "connected":
      return "success" as const;
    case "connecting":
    case "credentialing":
    case "reconnecting":
      return "warning" as const;
    case "error":
    case "auth_error":
    case "credential_error":
    case "rail_error":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

function liveSurfaceLabel(moduleId: string) {
  switch (moduleId) {
    case "accounts":
      return "Account Inventory";
    case "auth-methods":
      return "Authentication Methods";
    case "identities":
      return "Identity Lineage";
    case "contexts":
      return "Context Tree";
    case "badges":
      return "Badge Catalog";
    case "principals":
      return "Principal Lineage";
    case "grants":
      return "Badge Grants";
    case "services":
      return "Service Bindings";
    case "keys":
      return "Key Posture";
    case "audit":
      return "Authority Audit";
    default:
      return "";
  }
}

function isLiveReadSurface(moduleId: string) {
  return ["accounts", "auth-methods", "identities", "contexts", "badges", "principals", "grants", "services", "keys", "audit"].includes(moduleId);
}

function isMutationSurface(moduleId: string) {
  return ["accounts", "auth-methods", "identities", "contexts", "principals", "badges", "grants", "services", "keys"].includes(moduleId);
}

function isCommandSigningSurface(moduleId: string) {
  return isMutationSurface(moduleId) || moduleId === "transport";
}

type MutationState =
  | { status: "idle"; detail: string; result?: undefined }
  | { status: "submitting"; detail: string; result?: undefined }
  | { status: "accepted"; detail: string; result: AuthorityMutationResult }
  | { status: "denied" | "invalid" | "error"; detail: string; result?: AuthorityMutationResult };

interface CommandSigningState {
  status: "idle" | "loading" | "working" | "ready" | "error";
  detail: string;
  posture?: CommandSigningPosture;
  smoke?: CommandPayloadSignature;
}

type DelegatedTransportDrillState =
  | { status: "idle"; detail: string; result?: undefined }
  | { status: "running"; detail: string; result?: undefined }
  | { status: "passed" | "failed" | "error"; detail: string; result?: DelegatedTransportDrillResult };

type NegativeTransportDrillState =
  | { status: "idle"; detail: string; checks?: undefined }
  | { status: "running"; detail: string; checks?: undefined }
  | { status: "passed" | "failed" | "error"; detail: string; checks?: NegativeTransportDrillCheck[] };

interface DelegatedTransportDrillResult {
  credentialPrincipalId?: string;
  activePrincipalId?: string;
  rail?: string;
  profile?: string;
  expiresAt?: string;
  permissions?: {
    pubAllow: string[];
    subAllow: string[];
  };
  probeResults: NatsPermissionProbeResult[];
}

interface NegativeTransportDrillCheck {
  check: string;
  expected: string;
  observed: string;
  detail?: string;
}

export function AuthorityPlaceholderPage() {
  const { surface } = useParams();
  const module = findModule(surface);
  const { snapshot } = useSession();
  const nats = useNats();
  const activePrincipal = snapshot.activePrincipal ?? snapshot.root;
  const activeAccountId = activePrincipal?.accountId ?? snapshot.account?.accountId ?? "";
  const activeIdentityId = activePrincipal?.identityId ?? snapshot.identity?.identityId ?? "";
  const activePrincipalId = activePrincipal?.principalId ?? "";
  const activeContextId = activePrincipal?.contextId ?? snapshot.context?.contextId ?? "";
  const scopedFilters = useMemo(() => {
    const base = { limit: 100 };
    const withAccount: AuthorityReadFilter = activeAccountId ? { ...base, account_id: activeAccountId } : base;
    const withContext: AuthorityReadFilter = activeContextId ? { ...base, context_id: activeContextId } : base;
    const withAccountContext: AuthorityReadFilter = {
      ...base,
      ...(activeAccountId ? { account_id: activeAccountId } : {}),
      ...(activeContextId ? { context_id: activeContextId } : {}),
    };
    const withPrincipal: AuthorityReadFilter = activePrincipalId ? { ...base, principal_id: activePrincipalId } : base;
    const withPrincipalContext: AuthorityReadFilter = {
      ...base,
      ...(activePrincipalId ? { principal_id: activePrincipalId } : {}),
      ...(activeContextId ? { context_id: activeContextId } : {}),
    };
    const withIdentityContext: AuthorityReadFilter = {
      ...base,
      ...(activeIdentityId ? { identity_id: activeIdentityId } : {}),
      ...(activeContextId ? { context_id: activeContextId } : {}),
    };
    return {
      account: withAccount,
      context: withContext,
      accountContext: withAccountContext,
      principal: withPrincipal,
      principalContext: withPrincipalContext,
      identityContext: withIdentityContext,
    };
  }, [activeAccountId, activeContextId, activeIdentityId, activePrincipalId]);
  const authorityReadTransport = useMemo(
    () =>
      nats.state === "connected" && nats.connection && nats.grantToken
        ? { connection: nats.connection, grantToken: nats.grantToken }
        : undefined,
    [nats.state, nats.connection, nats.grantToken],
  );
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [mutationState, setMutationState] = useState<MutationState>({
    status: "idle",
    detail: "Mutation controls are idle.",
  });
  const [commandSigningState, setCommandSigningState] = useState<CommandSigningState>({
    status: "idle",
    detail: "Command-signing posture has not been checked yet.",
  });
  const [readState, setReadState] = useState<LiveReadState>({
    status: "idle",
    detail: "This authority surface has not requested data yet.",
    accounts: [],
    authMethods: [],
    contexts: [],
    identities: [],
    badges: [],
    principals: [],
    grants: [],
    serviceDefinitions: [],
    serviceBindings: [],
    keys: [],
    auditEvents: [],
  });

  useEffect(() => {
    if (!module || !isLiveReadSurface(module.id)) {
      setReadState({
        status: "idle",
        detail: "This surface remains a read-first placeholder until its work order lands.",
        accounts: [],
        authMethods: [],
        contexts: [],
        identities: [],
        badges: [],
        principals: [],
        grants: [],
        serviceDefinitions: [],
        serviceBindings: [],
        keys: [],
        auditEvents: [],
      });
      return;
    }

    const controller = new AbortController();
    setReadState({
      status: "loading",
      detail: `Loading ${module.name.toLowerCase()} through ${
        authorityReadTransport ? "browser NATS" : "the Sentry HTTP authority read adapter"
      }.`,
      accounts: [],
      authMethods: [],
      contexts: [],
      identities: [],
      badges: [],
      principals: [],
      grants: [],
      serviceDefinitions: [],
      serviceBindings: [],
      keys: [],
      auditEvents: [],
    });

    async function load() {
      try {
        if (module?.id === "accounts") {
          const response = await readAccounts(controller.signal, scopedFilters.account, authorityReadTransport);
          setReadState({
            status: response.items.length ? "ready" : "empty",
            detail: response.items.length
              ? `Accounts loaded through ${authorityReadTransport ? "browser NATS" : "Sentry authority reads"}.`
              : "No accounts were returned for this session scope.",
            accounts: response.items,
            authMethods: [],
            contexts: [],
            identities: [],
            badges: [],
            principals: [],
            grants: [],
            serviceDefinitions: [],
            serviceBindings: [],
            keys: [],
            auditEvents: [],
          });
          return;
        }

        if (module?.id === "auth-methods") {
          const [response, accounts] = await Promise.all([
            readAccountAuthMethods(controller.signal, scopedFilters.account, authorityReadTransport),
            readAccounts(controller.signal, scopedFilters.account, authorityReadTransport),
          ]);
          setReadState({
            status: response.items.length ? "ready" : "empty",
            detail: response.items.length
              ? `Authentication methods loaded through ${authorityReadTransport ? "browser NATS" : "Sentry authority reads"}.`
              : "No account authentication methods were returned for this session scope.",
            accounts: accounts.items,
            authMethods: response.items,
            contexts: [],
            identities: [],
            badges: [],
            principals: [],
            grants: [],
            serviceDefinitions: [],
            serviceBindings: [],
            keys: [],
            auditEvents: [],
          });
          return;
        }

        if (module?.id === "identities") {
          const [response, accounts, contexts] = await Promise.all([
            readIdentities(controller.signal, scopedFilters.accountContext, authorityReadTransport),
            readAccounts(controller.signal, scopedFilters.account, authorityReadTransport),
            readContexts(controller.signal, scopedFilters.context, authorityReadTransport),
          ]);
          setReadState({
            status: response.items.length ? "ready" : "empty",
            detail: response.items.length
              ? `Identities and paired principals loaded through ${authorityReadTransport ? "browser NATS" : "Sentry authority reads"}.`
              : "No identities were returned for this session scope.",
            accounts: accounts.items,
            authMethods: [],
            contexts: contexts.items,
            identities: response.items,
            badges: [],
            principals: [],
            grants: [],
            serviceDefinitions: [],
            serviceBindings: [],
            keys: [],
            auditEvents: [],
          });
          return;
        }

        if (module?.id === "contexts") {
          const [contexts, identities, badges, grants] = await Promise.all([
            readContexts(controller.signal, scopedFilters.context, authorityReadTransport),
            readIdentities(controller.signal, scopedFilters.accountContext, authorityReadTransport),
            readBadgeDefinitions(controller.signal, scopedFilters.context, authorityReadTransport),
            readBadgeGrants(controller.signal, scopedFilters.principalContext, authorityReadTransport),
          ]);
          setReadState({
            status: contexts.items.length ? "ready" : "empty",
            detail: contexts.items.length
              ? `Contexts loaded through ${authorityReadTransport ? "browser NATS" : "Sentry authority reads"}.`
              : "No contexts were returned for this session scope.",
            accounts: [],
            authMethods: [],
            contexts: contexts.items,
            identities: identities.items,
            badges: badges.items,
            principals: [],
            grants: grants.items,
            serviceDefinitions: [],
            serviceBindings: [],
            keys: [],
            auditEvents: [],
          });
          return;
        }

        if (module?.id === "badges") {
          const [response, contexts] = await Promise.all([
            readBadgeDefinitions(controller.signal, scopedFilters.context, authorityReadTransport),
            readContexts(controller.signal, scopedFilters.context, authorityReadTransport),
          ]);
          setReadState({
            status: response.items.length ? "ready" : "empty",
            detail: response.items.length
              ? `Badge definitions loaded through ${authorityReadTransport ? "browser NATS" : "Sentry authority reads"}.`
              : "No badge definitions were returned for this session scope.",
            accounts: [],
            authMethods: [],
            contexts: contexts.items,
            identities: [],
            badges: response.items,
            principals: [],
            grants: [],
            serviceDefinitions: [],
            serviceBindings: [],
            keys: [],
            auditEvents: [],
          });
          return;
        }

        if (module?.id === "principals") {
          const response = await readPrincipals(controller.signal, scopedFilters.accountContext, authorityReadTransport);
          setReadState({
            status: response.items.length ? "ready" : "empty",
            detail: response.items.length
              ? `Principals loaded through ${authorityReadTransport ? "browser NATS" : "Sentry authority reads"}.`
              : "No principals were returned for this session scope.",
            accounts: [],
            authMethods: [],
            contexts: [],
            identities: [],
            badges: [],
            principals: response.items,
            grants: [],
            serviceDefinitions: [],
            serviceBindings: [],
            keys: [],
            auditEvents: [],
          });
          return;
        }

        if (module?.id === "grants") {
          const [response, badges, principals, identities] = await Promise.all([
            readBadgeGrants(controller.signal, scopedFilters.principalContext, authorityReadTransport),
            readBadgeDefinitions(controller.signal, scopedFilters.context, authorityReadTransport),
            readPrincipals(controller.signal, scopedFilters.accountContext, authorityReadTransport),
            readIdentities(controller.signal, scopedFilters.accountContext, authorityReadTransport),
          ]);
          setReadState({
            status: response.items.length ? "ready" : "empty",
            detail: response.items.length
              ? `Badge grants loaded through ${authorityReadTransport ? "browser NATS" : "Sentry authority reads"}.`
              : "No badge grants were returned for this session scope.",
            accounts: [],
            authMethods: [],
            contexts: [],
            identities: identities.items,
            badges: badges.items,
            principals: principals.items,
            grants: response.items,
            serviceDefinitions: [],
            serviceBindings: [],
            keys: [],
            auditEvents: [],
          });
          return;
        }

        if (module?.id === "services") {
          const [definitions, bindings, principals, badges] = await Promise.all([
            readServiceDefinitions(controller.signal, { limit: 100 }, authorityReadTransport),
            readServiceBindings(controller.signal, scopedFilters.context, authorityReadTransport),
            readPrincipals(controller.signal, scopedFilters.accountContext, authorityReadTransport),
            readBadgeDefinitions(controller.signal, scopedFilters.context, authorityReadTransport),
          ]);
          setReadState({
            status: definitions.items.length || bindings.items.length ? "ready" : "empty",
            detail: definitions.items.length || bindings.items.length
              ? `Service definitions and context bindings loaded through ${authorityReadTransport ? "browser NATS" : "Sentry authority reads"}.`
              : "No service definitions or context service bindings were returned for this session scope.",
            accounts: [],
            authMethods: [],
            contexts: [],
            identities: [],
            badges: badges.items,
            principals: principals.items,
            grants: [],
            serviceDefinitions: definitions.items,
            serviceBindings: bindings.items,
            keys: [],
            auditEvents: [],
          });
          return;
        }

        if (module?.id === "audit") {
          const response = await readAuthorityAuditEvents(controller.signal, scopedFilters.principalContext, authorityReadTransport);
          setReadState({
            status: response.items.length ? "ready" : "empty",
            detail: response.items.length
              ? `Authority audit events loaded through ${authorityReadTransport ? "browser NATS" : "Sentry authority reads"}.`
              : "No authority audit events were returned for this session scope.",
            accounts: [],
            authMethods: [],
            contexts: [],
            identities: [],
            badges: [],
            principals: [],
            grants: [],
            serviceDefinitions: [],
            serviceBindings: [],
            keys: [],
            auditEvents: response.items,
          });
          return;
        }

        const [response, principals] = await Promise.all([
          readPrincipalKeys(controller.signal, scopedFilters.principal, authorityReadTransport),
          readPrincipals(controller.signal, scopedFilters.accountContext, authorityReadTransport),
        ]);
        setReadState({
          status: response.items.length ? "ready" : "empty",
          detail: response.items.length
            ? `Principal key posture loaded through ${authorityReadTransport ? "browser NATS" : "Sentry authority reads"}.`
            : "No principal keys were returned for this session scope.",
          accounts: [],
          authMethods: [],
          contexts: [],
          identities: [],
          badges: [],
          principals: principals.items,
          grants: [],
          serviceDefinitions: [],
          serviceBindings: [],
          keys: response.items,
          auditEvents: [],
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setReadState({
          status: error instanceof AuthorityReadError && error.status === 403 ? "denied" : "error",
          detail:
            error instanceof Error
              ? error.message
              : "Unknown authority read failure.",
          accounts: [],
          authMethods: [],
          contexts: [],
          identities: [],
          badges: [],
          principals: [],
          grants: [],
          serviceDefinitions: [],
          serviceBindings: [],
          keys: [],
          auditEvents: [],
        });
      }
    }

    void load();
    return () => controller.abort();
  }, [module, refreshNonce, authorityReadTransport, scopedFilters]);

  useEffect(() => {
    if (!module || !isCommandSigningSurface(module.id)) {
      setCommandSigningState({
        status: "idle",
        detail: "Command-signing posture is checked on authority mutation and delegated transport surfaces.",
      });
      return;
    }

    let cancelled = false;
    const principalId = activePrincipal?.principalId;
    setCommandSigningState((current) => ({
      ...current,
      status: "loading",
      detail: "Checking browser-local Ed25519 command-signing posture.",
    }));

    const visibleKeys = readState.keys;
    const postureKeys = visibleKeys.length
      ? Promise.resolve(visibleKeys)
      : readPrincipalKeys(undefined, { limit: 100 }).then((response) => response.items);

    void postureKeys
      .then((keys) => getCommandSigningPosture(principalId, keys))
      .then((posture) => {
        if (cancelled) {
          return;
        }
        setCommandSigningState({
          status: posture.status === "ready" ? "ready" : posture.status === "error" ? "error" : "idle",
          detail: posture.detail,
          posture,
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setCommandSigningState({
          status: "error",
          detail: error instanceof Error ? error.message : "Unable to inspect command-signing posture.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [module, activePrincipal?.principalId, readState.keys]);

  if (!module) {
    return <Navigate to="/authority/accounts" replace />;
  }

  const isLiveSurface = isLiveReadSurface(module.id);
  const usesResourceInterfaceShell = [
    "identities",
    "contexts",
    "badges",
    "principals",
    "grants",
    "services",
    "keys",
  ].includes(module.id);
  const showTransportPosturePanel = module.id === "transport";
  const signingOptions =
    commandSigningState.posture?.status === "ready" && activePrincipal?.principalId
      ? {
          principalId: activePrincipal.principalId,
          identityId: activePrincipal.identityId,
          keyId: commandSigningState.posture.keyId,
        }
      : undefined;
  const liveReadContent =
    readState.status === "loading" || readState.status === "denied" || readState.status === "error" ? (
      <AuthorityReadNotice status={readState.status} detail={readState.detail} sessionStatus={snapshot.status} />
    ) : module.id === "accounts" ? (
      <AccountList accounts={readState.accounts} />
    ) : module.id === "auth-methods" ? (
      <AuthMethodList methods={readState.authMethods} accounts={readState.accounts} />
    ) : module.id === "identities" ? (
      <IdentityList
        state={{ status: readState.status, detail: readState.detail }}
        identities={readState.identities}
        accounts={readState.accounts}
        contexts={readState.contexts}
      />
    ) : module.id === "contexts" ? (
      <ContextManagerReadSurface
        state={{ status: readState.status, detail: readState.detail }}
        contexts={readState.contexts}
        identities={readState.identities}
        badges={readState.badges}
        grants={readState.grants}
      />
    ) : module.id === "badges" ? (
      <BadgeManagerSurface
        state={{ status: readState.status, detail: readState.detail }}
        badges={readState.badges}
        contexts={readState.contexts}
      />
    ) : module.id === "principals" ? (
      <PrincipalList
        state={{ status: readState.status, detail: readState.detail }}
        principals={readState.principals}
      />
    ) : module.id === "grants" ? (
      <GrantList
        state={{ status: readState.status, detail: readState.detail }}
        grants={readState.grants}
        badges={readState.badges}
        principals={readState.principals}
        identities={readState.identities}
      />
    ) : module.id === "services" ? (
      <ServiceBindingList
        state={{ status: readState.status, detail: readState.detail }}
        definitions={readState.serviceDefinitions}
        bindings={readState.serviceBindings}
      />
    ) : module.id === "audit" ? (
      <AuditList events={readState.auditEvents} />
    ) : (
      <KeyList
        state={{ status: readState.status, detail: readState.detail }}
        keys={readState.keys}
        principals={readState.principals}
      />
    );

  async function createBrowserCommandSigningKey() {
    const principalId = activePrincipal?.principalId;
    if (!principalId) {
      setCommandSigningState({
        status: "error",
        detail: "No active principal is resolved for Level 3 command-signing setup.",
        posture: commandSigningState.posture,
      });
      return;
    }

    setCommandSigningState((current) => ({
      ...current,
      status: "working",
      detail: "Generating a browser-local non-exportable Ed25519 key and registering its public key with Sentry.",
    }));

    try {
      const registration = await generateAndStoreBrowserCommandSigningKey(principalId);
      const result = await registerPrincipalKey({
        principal_id: registration.principalId,
        key_id: registration.keyId,
        algorithm: registration.algorithm,
        public_key: registration.publicKey,
      });
      setMutationState({
        status: "accepted",
        detail: `principal_key ${result.resource_id ?? registration.keyId} accepted by Sentry.`,
        result,
      });
      setCommandSigningState((current) => ({
        ...current,
        status: "ready",
        detail: `Generated and registered browser Ed25519 key ${registration.keyId}. Refreshing Sentry key posture.`,
      }));
      setRefreshNonce((value) => value + 1);
    } catch (error) {
      setCommandSigningState((current) => ({
        ...current,
        status: "error",
        detail: error instanceof Error ? error.message : "Unable to generate or register a browser command-signing key.",
      }));
    }
  }

  async function signSmokeCommand() {
    const principalId = activePrincipal?.principalId;
    const keyId = commandSigningState.posture?.keyId;
    if (!principalId || !keyId) {
      setCommandSigningState((current) => ({
        ...current,
        status: "error",
        detail: "A ready active-principal signing key is required before smoke signing.",
      }));
      return;
    }

    setCommandSigningState((current) => ({
      ...current,
      status: "working",
      detail: "Signing a local Level 3 command payload smoke check.",
    }));

    try {
      const smoke = await signCommandPayload({
        principalId,
        identityId: activePrincipal?.identityId,
        keyId,
        data: {
          command_type: "lookout.command_signing.smoke",
          principal_id: principalId,
          checked_at: new Date().toISOString(),
        },
      });
      setCommandSigningState((current) => ({
        ...current,
        status: "ready",
        detail: "Local Ed25519 command-signing smoke check succeeded.",
        smoke,
      }));
    } catch (error) {
      setCommandSigningState((current) => ({
        ...current,
        status: "error",
        detail: error instanceof Error ? error.message : "Local command-signing smoke check failed.",
      }));
    }
  }

  return (
    <div className="page">
      <header className="page__header">
        <div className="page__title-block">
          <div className="panel__eyebrow">{module.surfaceLabel}</div>
          <h1 className="page__title">{module.name}</h1>
          <p className="page__summary">{module.summary}</p>
        </div>
      </header>

      <section className="grid grid--panels">
        {isLiveSurface && usesResourceInterfaceShell ? (
          liveReadContent
        ) : isLiveSurface ? (
          <Panel
            eyebrow="Records"
            title={liveSurfaceLabel(module.id)}
            description={readState.detail}
            actions={<StatusPill tone={statusTone(readState.status)} label={readState.status} />}
          >
            {liveReadContent}
          </Panel>
        ) : null}

        {showTransportPosturePanel ? (
          <Panel
          eyebrow="Access State"
          title="Session and Transport Posture"
          description="Authority reads prefer browser NATS once the rail is connected, with same-origin Sentry HTTP kept visible as the compatibility fallback."
          actions={<StatusPill tone={sessionTone(snapshot.status)} label={snapshot.status} />}
        >
          <div className="kv-grid">
            <div className="kv">
              <div className="kv__label">Operator</div>
              <div className="kv__value">
                {activePrincipal?.email ?? activePrincipal?.principalId ?? "No authenticated operator"}
              </div>
            </div>
            <div className="kv">
              <div className="kv__label">Session Source</div>
              <div className="kv__value">{snapshot.source}</div>
            </div>
            <div className="kv">
              <div className="kv__label">Browser Rail Ready</div>
              <div className="kv__value">{String(snapshot.transport.ready)}</div>
            </div>
            <div className="kv">
              <div className="kv__label">Grant Discovery</div>
              <div className="kv__value">{snapshot.transport.grantReady ? "available" : "unavailable"}</div>
            </div>
            <div className="kv">
              <div className="kv__label">NATS State</div>
              <div className="kv__value">
                <StatusPill tone={natsTone(nats.state)} label={nats.state} />
              </div>
            </div>
            <div className="kv">
              <div className="kv__label">Authority Read Rail</div>
              <div className="kv__value">
                {authorityReadTransport ? "browser NATS request/reply" : "Sentry HTTP fallback"}
              </div>
            </div>
            <div className="kv">
              <div className="kv__label">Grant Token</div>
              <div className="kv__value">{nats.grantToken ? "in-memory only" : "not available"}</div>
            </div>
            <div className="kv">
              <div className="kv__label">Grant Expires</div>
              <div className="kv__value">{nats.grantPosture?.expiresAt ?? "No grant expiry observed"}</div>
            </div>
            <div className="kv">
              <div className="kv__label">Last Denied Action</div>
              <div className="kv__value">
                {readState.status === "denied"
                  ? readState.detail
                  : mutationState.status === "denied"
                    ? mutationState.detail
                    : nats.lastDeniedAction ?? "None observed in this tab"}
              </div>
            </div>
          </div>
          {snapshot.status === "unauthenticated" ? (
            <div className="state-notice state-notice--denied">
              <div className="state-notice__title">No operator session is active.</div>
              <div className="state-notice__body">
                Use the Login control to complete Drawbridge auth before expecting authority reads to resolve.
              </div>
            </div>
          ) : !snapshot.transport.ready ? (
            <div className="state-notice state-notice--warning">
              <div className="state-notice__title">Browser transport is not ready.</div>
              <div className="state-notice__body">{snapshot.transport.detail}</div>
            </div>
          ) : null}
          </Panel>
        ) : null}

        {isMutationSurface(module.id) ? (
          <AuthorityMutationPanel
            moduleId={module.id}
            readState={readState}
            snapshotContextId={activePrincipal?.contextId ?? ""}
            mutationState={mutationState}
            signingOptions={signingOptions}
            onState={setMutationState}
            onAccepted={() => setRefreshNonce((value) => value + 1)}
          />
        ) : null}

        {module.id === "keys" ? (
          <BrowserCommandSigningPanel
            state={commandSigningState}
            activePrincipalId={activePrincipal?.principalId}
            onCreate={createBrowserCommandSigningKey}
            onSmoke={signSmokeCommand}
          />
        ) : null}

        {module.id === "transport" ? (
          <DelegatedTransportDrillPanel
            state={commandSigningState}
            activePrincipalId={activePrincipal?.principalId}
            activeIdentityId={activePrincipal?.identityId}
            activeContextId={activePrincipal?.contextId}
            natsServerURL={nats.serverURL}
          />
        ) : null}

      </section>
    </div>
  );
}

function AuthorityReadNotice({
  status,
  detail,
  sessionStatus,
}: {
  status: AuthorityLoadStatus;
  detail: string;
  sessionStatus: string;
}) {
  const title =
    status === "loading"
      ? "Loading authority records."
      : status === "denied" && sessionStatus === "unauthenticated"
        ? "Authentication is required."
        : status === "denied"
          ? "Authority read denied."
          : "Authority read failed.";
  const body =
    status === "denied" && sessionStatus === "unauthenticated"
      ? "No same-origin operator session is active, so the Sentry read adapter cannot be reached with authority."
      : detail;
  const className =
    status === "loading"
      ? "state-notice state-notice--loading"
      : status === "denied"
        ? "state-notice state-notice--denied"
        : "state-notice state-notice--error";

  return (
    <div className={className}>
      <div className="state-notice__title">{title}</div>
      <div className="state-notice__body">{body}</div>
    </div>
  );
}

function AuthorityMutationPanel({
  moduleId,
  readState,
  snapshotContextId,
  mutationState,
  signingOptions,
  onState,
  onAccepted,
}: {
  moduleId: string;
  readState: LiveReadState;
  snapshotContextId: string;
  mutationState: MutationState;
  signingOptions?: AuthorityMutationSigningOptions;
  onState: (state: MutationState) => void;
  onAccepted: () => void;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    onState({ status: "submitting", detail: "Submitting action through Sentry." });
    try {
      const result = await submitAuthorityMutation(moduleId, form, signingOptions);
      onState({
        status: "accepted",
        detail: `${result.resource_type ?? "resource"} ${result.resource_id ?? ""} accepted by Sentry.`,
        result,
      });
      onAccepted();
      formElement.reset();
    } catch (error) {
      if (error instanceof AuthorityMutationError) {
        onState({
          status: error.result?.status === "denied" ? "denied" : error.result?.status === "invalid" ? "invalid" : "error",
          detail: error.message,
          result: error.result,
        });
        return;
      }
      onState({
        status: "error",
        detail: error instanceof Error ? error.message : "Unknown mutation failure.",
      });
    }
  }

  return (
    <Panel
      eyebrow="Manage"
      title={mutationTitle(moduleId)}
      description="Create, update, archive, revoke, or rotate records using the current Sentry-backed action path."
      actions={<StatusPill tone={mutationTone(mutationState.status)} label={mutationState.status} />}
    >
      <form className="authority-form" onSubmit={submit}>
        {moduleId === "accounts" ? (
          <AccountMutationFields defaultDomainId={snapshotContextId} />
        ) : moduleId === "auth-methods" ? (
          <AuthMethodMutationFields accounts={readState.accounts} defaultDomainId={snapshotContextId} />
        ) : moduleId === "identities" ? (
          <IdentityMutationFields accounts={readState.accounts} contexts={readState.contexts} defaultContextId={snapshotContextId} />
        ) : moduleId === "principals" ? (
          <PrincipalMutationFields principals={readState.principals} defaultContextId={snapshotContextId} />
        ) : moduleId === "badges" ? (
          <BadgeMutationFields badges={readState.badges} contexts={readState.contexts} defaultContextId={snapshotContextId} />
        ) : moduleId === "grants" ? (
          <GrantMutationFields badges={readState.badges} identities={readState.identities} principals={readState.principals} defaultContextId={snapshotContextId} />
        ) : moduleId === "services" ? (
          <ServiceProvisionFields badges={readState.badges} defaultContextId={snapshotContextId} />
        ) : moduleId === "keys" ? (
          <KeyMutationFields keys={readState.keys} principals={readState.principals} />
        ) : (
          <ContextMutationFields contexts={readState.contexts} />
        )}
        <div className="button-row">
          <button className="button" type="submit" disabled={mutationState.status === "submitting"}>
            Submit Action
          </button>
        </div>
      </form>
      <div className={`state-notice ${mutationState.status === "accepted" ? "state-notice--success" : mutationState.status === "idle" ? "" : mutationState.status === "submitting" ? "state-notice--loading" : "state-notice--error"}`}>
        <div className="state-notice__title">Action Result</div>
        <div className="state-notice__body">
          {mutationState.detail}
          {mutationState.result?.error_code ? ` (${mutationState.result.error_code})` : ""}
        </div>
      </div>
    </Panel>
  );
}

function BrowserCommandSigningPanel({
  state,
  activePrincipalId,
  onCreate,
  onSmoke,
}: {
  state: CommandSigningState;
  activePrincipalId?: string;
  onCreate: () => Promise<void>;
  onSmoke: () => Promise<void>;
}) {
  const posture = state.posture;
  const unsupported = posture?.status === "unsupported";
  const ready = posture?.status === "ready";
  const busy = state.status === "loading" || state.status === "working";

  return (
    <Panel
      eyebrow="Level 3 Command Signing"
      title="Browser Ed25519 Signer"
      description="Lookout Web can create a browser-local non-exportable Ed25519 key for the active principal, register only the public key with Sentry, and use that key for command-authorship envelopes."
      actions={<StatusPill tone={commandSigningTone(state, posture)} label={posture?.status ?? state.status} />}
    >
      <div className="kv-grid">
        <div className="kv">
          <div className="kv__label">Active Principal</div>
          <div className="kv__value">{activePrincipalId ?? "Unavailable"}</div>
        </div>
        <div className="kv">
          <div className="kv__label">Algorithm</div>
          <div className="kv__value">ed25519</div>
        </div>
        <div className="kv">
          <div className="kv__label">Selected Key</div>
          <div className="kv__value">{posture?.keyId ?? "Not selected"}</div>
        </div>
        <div className="kv">
          <div className="kv__label">Local Keys</div>
          <div className="kv__value">{posture?.localKeyCount ?? 0}</div>
        </div>
      </div>
      <div className={`state-notice ${unsupported ? "state-notice--denied" : ready ? "state-notice--success" : state.status === "error" ? "state-notice--error" : "state-notice--warning"}`}>
        <div className="state-notice__title">Command-Signing Posture</div>
        <div className="state-notice__body">{state.detail}</div>
      </div>
      {state.smoke ? (
        <div className="list">
          <div className="list-item">
            <div>
              <div className="list-item__title">Local Signing Smoke</div>
              <div className="list-item__body">
                key:{state.smoke.keyId} · nonce:{state.smoke.nonce} · expires:{state.smoke.expiresAt}
              </div>
              <div className="list-item__body">
                signature:{state.smoke.principalSignature.slice(0, 18)}...
              </div>
            </div>
            <StatusPill tone="success" label="signed" />
          </div>
        </div>
      ) : null}
      <div className="button-row">
        <button
          className="button"
          type="button"
          disabled={busy || unsupported || !activePrincipalId}
          onClick={() => void onCreate()}
        >
          Generate Browser Ed25519 Key
        </button>
        <button
          className="button button--ghost"
          type="button"
          disabled={busy || !ready}
          onClick={() => void onSmoke()}
        >
          Sign Smoke Payload
        </button>
      </div>
      <div className="empty-state">
        This is for Level 3 Stronghold access only. If native WebCrypto Ed25519 is unavailable,
        use Lookout Desktop rather than a fallback algorithm or JavaScript crypto polyfill.
      </div>
    </Panel>
  );
}

function DelegatedTransportDrillPanel({
  state,
  activePrincipalId,
  activeIdentityId,
  activeContextId,
  natsServerURL,
}: {
  state: CommandSigningState;
  activePrincipalId?: string;
  activeIdentityId?: string;
  activeContextId?: string;
  natsServerURL: string;
}) {
  const [drillState, setDrillState] = useState<DelegatedTransportDrillState>({
    status: "idle",
    detail: "Delegated service/agent transport drill has not run in this tab.",
  });
  const [negativeState, setNegativeState] = useState<NegativeTransportDrillState>({
    status: "idle",
    detail: "Negative transport drill has not run in this tab.",
  });
  const [targetPrincipalId, setTargetPrincipalId] = useState("");
  const [foreignPrincipalId, setForeignPrincipalId] = useState("");
  const ready = state.posture?.status === "ready" && activePrincipalId && state.posture.keyId;
  const busy = drillState.status === "running" || negativeState.status === "running";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const requestedPrincipalId = targetPrincipalId.trim();
    const rail = String(form.get("rail") ?? "service_runtime").trim();
    const profile = String(form.get("profile") ?? "").trim();

    if (!activePrincipalId || !state.posture?.keyId) {
      setDrillState({
        status: "error",
        detail: "A ready active-principal command-signing key is required before requesting delegated transport.",
      });
      return;
    }
    if (!requestedPrincipalId) {
      setDrillState({ status: "error", detail: "Target service or agent principal ID is required." });
      return;
    }

    setDrillState({
      status: "running",
      detail: "Requesting a signed delegated native NATS credential and probing scoped subjects.",
    });

    let delegatedConnection: NatsConnection | undefined;
    try {
      const payload = {
        principal_id: requestedPrincipalId,
        rail,
        ...(profile ? { profile } : {}),
        native_required: true,
      };
      const body = JSON.stringify(payload);
      const signature = await signCommandPayload({
        principalId: activePrincipalId,
        identityId: activeIdentityId,
        keyId: state.posture.keyId,
        data: {
          command_type: "nats_transport_credential.issue",
          payload,
        },
      });
      const response = await fetch("/_/transport/nats/credential", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
          "X-Stronghold-Command-Auth": commandAuthHeaderValue(signature, activeIdentityId),
        },
        body,
      });
      const grant = (await response.json()) as DelegatedTransportGrantResponse;
      if (!response.ok) {
        throw new Error(grant.message ?? `Delegated transport credential returned ${response.status}.`);
      }
      const credsFile = grant.native_credential?.creds_file;
      if (!grant.transport_ready || !grant.nats_native || !credsFile) {
        throw new Error("Delegated native credential was issued without a ready NATS rail.");
      }

      delegatedConnection = await connect({
        servers: natsServerURL,
        authenticator: credsAuthenticator(new TextEncoder().encode(credsFile)),
      });

      const permissions = {
        pubAllow: stringArrayClaim((grant.claims?.permissions as Record<string, unknown> | undefined)?.pub_allow),
        subAllow: stringArrayClaim((grant.claims?.permissions as Record<string, unknown> | undefined)?.sub_allow),
      };
      const stamp = Date.now().toString(36);
      const allowedPub =
        concreteDrillSubject(
          permissions.pubAllow.find((subject) => subject.includes(".permission.services.invoke.")) ??
            permissions.pubAllow.find((subject) => subject.includes(".permission.agents.")) ??
            permissions.pubAllow.find((subject) => subject.includes(".outbox.")) ??
            permissions.pubAllow[0],
          `rcd5.${stamp}.allowed`,
        );
      const forbiddenPub = `stronghold.authority.read.rcd5.${stamp}`;
      const otherContext = "550e8400-e29b-41d4-a716-446655442222";
      const otherContextPub = `context.${otherContext}.permission.services.invoke.rcd5.${stamp}`;
      const results: NatsPermissionProbeResult[] = [
        await expectDrillPublish(delegatedConnection, allowedPub, true),
        await expectDrillPublish(delegatedConnection, forbiddenPub, false),
        await expectDrillPublish(delegatedConnection, otherContextPub, false),
      ];
      const passed = results.every((result) => result.expected === result.observed);
      setDrillState({
        status: passed ? "passed" : "failed",
        detail: passed
          ? "Delegated service/agent NATS credential matched expected scoped allow/deny behavior."
          : "Delegated service/agent NATS credential produced an unexpected allow/deny result.",
        result: {
          credentialPrincipalId: stringClaim(grant.claims, "principal_id"),
          activePrincipalId: stringClaim(grant.claims, "active_principal_id"),
          rail: stringClaim(grant.claims, "rail"),
          profile: stringClaim(grant.claims, "profile"),
          expiresAt: timeClaim(grant.claims, "exp"),
          permissions,
          probeResults: results,
        },
      });
    } catch (error) {
      setDrillState({
        status: "error",
        detail: error instanceof Error ? error.message : "Delegated transport drill failed.",
      });
    } finally {
      delegatedConnection?.close();
    }
  }

  async function runNegativeDrill() {
    const requestedPrincipalId = targetPrincipalId.trim();
    const requestedForeignPrincipalId = foreignPrincipalId.trim();
    if (!activePrincipalId || !state.posture?.keyId) {
      setNegativeState({
        status: "error",
        detail: "A ready active-principal command-signing key is required before running negative transport checks.",
      });
      return;
    }
    if (!requestedPrincipalId) {
      setNegativeState({ status: "error", detail: "Target service or agent principal ID is required." });
      return;
    }

    setNegativeState({
      status: "running",
      detail: "Running unsigned, replay, forged-header, and bad-delegation checks.",
    });

    const checks: NegativeTransportDrillCheck[] = [];
    try {
      const unsignedPayload = {
        principal_id: requestedPrincipalId,
        rail: "service_runtime",
        native_required: false,
      };
      const unsigned = await requestDelegatedTransport(unsignedPayload);
      checks.push({
        check: "unsigned delegated service credential",
        expected: "denied",
        observed: unsigned.response.status === 403 ? "denied" : `HTTP ${unsigned.response.status}`,
        detail: errorCodeOrMessage(unsigned.body),
      });

      const replayPayload = {
        principal_id: requestedPrincipalId,
        rail: "service_runtime",
        native_required: false,
      };
      const replayBody = JSON.stringify(replayPayload);
      const replaySignature = await signCommandPayload({
        principalId: activePrincipalId,
        identityId: activeIdentityId,
        keyId: state.posture.keyId,
        data: {
          command_type: "nats_transport_credential.issue",
          payload: replayPayload,
        },
      });
      const replayHeader = commandAuthHeaderValue(replaySignature, activeIdentityId);
      const firstReplay = await requestDelegatedTransport(replayPayload, replayHeader, replayBody);
      const secondReplay = await requestDelegatedTransport(replayPayload, replayHeader, replayBody);
      checks.push({
        check: "signed credential replay",
        expected: "first accepted, replay denied",
        observed:
          firstReplay.response.ok && secondReplay.response.status === 403
            ? "first accepted, replay denied"
            : `first HTTP ${firstReplay.response.status}, second HTTP ${secondReplay.response.status}`,
        detail: errorCodeOrMessage(secondReplay.body),
      });

      const forgedPrincipal = "00000000-0000-0000-0000-000000000000";
      const forged = await requestDelegatedTransport(
        { rail: "browser_websocket", native_required: false },
        undefined,
        undefined,
        { "X-Aegis-Principal": forgedPrincipal, "X-Aegis-Context": "00000000-0000-0000-0000-000000000000" },
      );
      const forgedPrincipalObserved = stringClaim(forged.body?.claims, "principal_id");
      checks.push({
        check: "browser-forged Aegis headers",
        expected: "ignored by edge",
        observed:
          forged.response.ok && forgedPrincipalObserved === activePrincipalId
            ? "ignored by edge"
            : `HTTP ${forged.response.status}, principal ${forgedPrincipalObserved ?? "unavailable"}`,
        detail: forgedPrincipalObserved ? `claims.principal_id=${forgedPrincipalObserved}` : errorCodeOrMessage(forged.body),
      });

      if (requestedForeignPrincipalId) {
        const foreignPayload = {
          principal_id: requestedForeignPrincipalId,
          rail: "service_runtime",
          native_required: false,
        };
        const foreignBody = JSON.stringify(foreignPayload);
        const foreignSignature = await signCommandPayload({
          principalId: activePrincipalId,
          identityId: activeIdentityId,
          keyId: state.posture.keyId,
          data: {
            command_type: "nats_transport_credential.issue",
            payload: foreignPayload,
          },
        });
        const foreign = await requestDelegatedTransport(
          foreignPayload,
          commandAuthHeaderValue(foreignSignature, activeIdentityId),
          foreignBody,
        );
        checks.push({
          check: "signed unowned runtime principal delegation",
          expected: "denied",
          observed: foreign.response.status === 403 ? "denied" : `HTTP ${foreign.response.status}`,
          detail: errorCodeOrMessage(foreign.body),
        });
      }

      const passed = checks.every((check) => check.expected === check.observed);
      setNegativeState({
        status: passed ? "passed" : "failed",
        detail: passed
          ? "Negative transport checks matched expected fail-closed behavior."
          : "One or more negative transport checks did not match the expected behavior.",
        checks,
      });
    } catch (error) {
      setNegativeState({
        status: "error",
        detail: error instanceof Error ? error.message : "Negative transport drill failed.",
        checks,
      });
    }
  }

  return (
    <Panel
      eyebrow="RCD-05 Drill"
      title="Delegated Service/Agent Transport"
      description="Requests a short-lived native NATS credential for a service or agent principal using the active principal's command signature, then probes allowed and forbidden subjects."
      actions={<StatusPill tone={drillTone(drillState.status)} label={drillState.status} />}
    >
      <form className="authority-form" onSubmit={submit}>
        <div className="authority-form__grid">
          <label>
            Service or Agent Principal ID
            <input name="principal_id" value={targetPrincipalId} onChange={(event) => setTargetPrincipalId(event.currentTarget.value)} required />
          </label>
          <label>
            Rail
            <select name="rail" defaultValue="service_runtime">
              <option value="service_runtime">service_runtime</option>
              <option value="agent_runtime">agent_runtime</option>
              <option value="desktop_node">desktop_node</option>
            </select>
          </label>
          <label>
            Profile (optional)
            <input name="profile" placeholder="service, durable_agent, desktop_node" />
          </label>
          <label>
            Foreign Principal ID (optional)
            <input value={foreignPrincipalId} onChange={(event) => setForeignPrincipalId(event.currentTarget.value)} placeholder="Unowned runtime principal for denial check" />
          </label>
          <label>
            Active Context
            <input value={activeContextId ?? "Unavailable"} readOnly />
          </label>
        </div>
        <div className="button-row">
          <button className="button" type="submit" disabled={busy || !ready}>
            Run Delegated Transport Drill
          </button>
          <button className="button button--ghost" type="button" disabled={busy || !ready} onClick={() => void runNegativeDrill()}>
            Run Negative Drill
          </button>
        </div>
      </form>
      <div className={`state-notice ${drillState.status === "passed" ? "state-notice--success" : drillState.status === "running" ? "state-notice--loading" : drillState.status === "idle" ? "" : "state-notice--error"}`}>
        <div className="state-notice__title">Delegated Transport Result</div>
        <div className="state-notice__body">{drillState.detail}</div>
      </div>
      {drillState.result ? (
        <div className="list">
          <div className="list-item">
            <div>
              <div className="list-item__title">Credential Principal</div>
              <div className="list-item__body">
                {drillState.result.credentialPrincipalId ?? "unknown"} · {drillState.result.rail ?? "rail unknown"} ·{" "}
                {drillState.result.profile ?? "profile unknown"}
              </div>
              <div className="list-item__body">expires:{drillState.result.expiresAt ?? "unknown"}</div>
            </div>
            <StatusPill tone="success" label="short-lived" />
          </div>
          {drillState.result.probeResults.map((result) => (
            <div className="list-item" key={`${result.step}-${result.subject}`}>
              <div>
                <div className="list-item__title">
                  {result.step} {result.expected}
                </div>
                <div className="list-item__body">{result.subject}</div>
                {result.error ? <div className="list-item__body">{result.error}</div> : null}
              </div>
              <StatusPill tone={result.expected === result.observed ? "success" : "danger"} label={result.observed} />
            </div>
          ))}
        </div>
      ) : null}
      <div className={`state-notice ${negativeState.status === "passed" ? "state-notice--success" : negativeState.status === "running" ? "state-notice--loading" : negativeState.status === "idle" ? "" : "state-notice--error"}`}>
        <div className="state-notice__title">Negative Transport Result</div>
        <div className="state-notice__body">{negativeState.detail}</div>
      </div>
      {negativeState.checks?.length ? (
        <div className="list">
          {negativeState.checks.map((check) => (
            <div className="list-item" key={check.check}>
              <div>
                <div className="list-item__title">{check.check}</div>
                <div className="list-item__body">expected:{check.expected} · observed:{check.observed}</div>
                {check.detail ? <div className="list-item__body">{check.detail}</div> : null}
              </div>
              <StatusPill tone={check.expected === check.observed ? "success" : "danger"} label={check.expected === check.observed ? "matched" : "mismatch"} />
            </div>
          ))}
        </div>
      ) : null}
      <div className="empty-state">
        The native creds file is kept in memory for this probe and is not rendered. This drill is for service,
        node, app, durable-agent, managed, or ephemeral runtime principals owned by the active authority root.
      </div>
    </Panel>
  );
}

function AccountMutationFields({ defaultDomainId }: { defaultDomainId: string }) {
  return (
    <div className="authority-form__grid">
      <label>
        Domain ID
        <input name="domain_id" defaultValue={defaultDomainId} required />
      </label>
      <label>
        Email
        <input name="email" type="email" required />
      </label>
      <label>
        Account ID (optional)
        <input name="account_id" />
      </label>
      <label>
        Provider ID (optional)
        <input name="provider_id" />
      </label>
    </div>
  );
}

function AuthMethodMutationFields({
  accounts,
  defaultDomainId,
}: {
  accounts: AccountReadModel[];
  defaultDomainId: string;
}) {
  return (
    <div className="authority-form__grid">
      <label>
        Mode
        <select name="auth_method_command" required defaultValue="account_auth_method.link">
          <option value="account_auth_method.link">link external method</option>
          <option value="account_auth_method.status">set status</option>
          <option value="account_auth_method.revoke">revoke</option>
        </select>
      </label>
      <label>
        Account
        <select name="account_id" defaultValue="">
          <option value="">Required for link</option>
          {accounts.map((account) => (
            <option value={account.id} key={account.id}>{account.email || account.id}</option>
          ))}
        </select>
      </label>
      <label>
        Method ID
        <input name="method_id" placeholder="Required for status/revoke, optional for link" />
      </label>
      <label>
        Domain ID
        <input name="domain_id" defaultValue={defaultDomainId} />
      </label>
      <label>
        Method Type
        <select name="method_type" defaultValue="external_provider">
          <option value="external_provider">external_provider</option>
        </select>
      </label>
      <label>
        Provider
        <input name="provider" placeholder="google, github, microsoft" />
      </label>
      <label>
        Provider Subject
        <input name="subject" placeholder="Opaque provider subject for link only" />
      </label>
      <label>
        Email
        <input name="email" type="email" placeholder="Provider email, if available" />
      </label>
      <label>
        Status
        <select name="status" defaultValue="active">
          <option value="active">active</option>
          <option value="disabled">disabled</option>
          <option value="revoked">revoked</option>
        </select>
      </label>
    </div>
  );
}

function IdentityMutationFields({
  accounts,
  contexts,
  defaultContextId,
}: {
  accounts: AccountReadModel[];
  contexts: ContextReadModel[];
  defaultContextId: string;
}) {
  return (
    <div className="authority-form__grid">
      <label>
        Mode
        <select name="identity_command" required defaultValue="identity.create">
          <option value="identity.create">enroll existing account identity</option>
          <option value="subject.create">create / invite person</option>
        </select>
      </label>
      <label>
        Account
        <select name="account_id" defaultValue="">
          <option value="">Create/select from email</option>
          {accounts.map((account) => (
            <option value={account.id} key={account.id}>{account.email || account.id}</option>
          ))}
        </select>
      </label>
      <label>
        Context
        <select name="context_id" required defaultValue={defaultContextId}>
          {contexts.map((context) => (
            <option value={context.id} key={context.id}>{context.name || context.id}</option>
          ))}
          {!contexts.length ? <option value={defaultContextId}>{defaultContextId || "No context loaded"}</option> : null}
        </select>
      </label>
      <label>
        Subject Type
        <select name="subject_type" defaultValue="person">
          <option value="person">person</option>
          <option value="agent">agent</option>
          <option value="service">service</option>
        </select>
      </label>
      <label>
        Person Email
        <input name="email" type="email" placeholder="Required for create / invite person" />
      </label>
      <label>
        Identity ID (optional)
        <input name="identity_id" />
      </label>
      <label>
        Principal ID (optional)
        <input name="principal_id" />
      </label>
      <label>
        Interactive Login
        <select name="interactive_login_allowed" defaultValue="true">
          <option value="true">allow login setup</option>
          <option value="false">no interactive login</option>
        </select>
      </label>
      <label>
        Token Key Required
        <select name="token_key_required" defaultValue="false">
          <option value="false">no</option>
          <option value="true">yes, register public key</option>
        </select>
      </label>
      <label>
        Key ID
        <input name="key_id" placeholder="Required for agent/service bootstrap" />
      </label>
      <label className="authority-form__wide">
        Public Key
        <input name="public_key" placeholder="Ed25519 public key; Sentry never receives the private key" />
      </label>
      <label>
        Service Key
        <input name="service_key" placeholder="Required for service subjects" />
      </label>
      <label>
        Personal Context
        <select name="personal_context_requested" defaultValue="false">
          <option value="false">do not create</option>
          <option value="true">create personal context</option>
        </select>
      </label>
    </div>
  );
}

function PrincipalMutationFields({
  principals,
  defaultContextId,
}: {
  principals: PrincipalReadModel[];
  defaultContextId: string;
}) {
  return (
    <div className="authority-form__grid">
      <label>
        Principal Type
        <select name="principal_type" required defaultValue="service">
          <option value="service">service</option>
          <option value="app">app</option>
          <option value="node">node</option>
          <option value="durable_agent">durable_agent</option>
          <option value="agent">agent</option>
          <option value="managed">managed</option>
        </select>
      </label>
      <label>
        Parent Principal
        <select name="parent_principal_id" defaultValue="">
          <option value="">Use active actor principal</option>
          {principals.map((principal) => (
            <option value={principal.id} key={principal.id}>{principal.principal_type}:{principal.id}</option>
          ))}
        </select>
      </label>
      <label>
        Context ID
        <input name="context_id" defaultValue={defaultContextId} />
      </label>
      <label>
        Principal ID (optional)
        <input name="principal_id" />
      </label>
    </div>
  );
}

function ContextMutationFields({ contexts }: { contexts: ContextReadModel[] }) {
  return (
    <div className="authority-form__grid">
      <label>
        Mode
        <select name="context_command" required defaultValue="context.create">
          <option value="context.create">create</option>
          <option value="context.update">update</option>
        </select>
      </label>
      <label>
        Name
        <input name="name" required />
      </label>
      <label>
        Context ID (required for update, optional for create)
        <input name="context_id" />
      </label>
      <label>
        Parent Context
        <select name="parent_id" defaultValue="">
          <option value="">No parent</option>
          {contexts.map((context) => (
            <option value={context.id} key={context.id}>{context.name || context.id}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function BadgeMutationFields({
  badges,
  contexts,
  defaultContextId,
}: {
  badges: BadgeDefinitionReadModel[];
  contexts: ContextReadModel[];
  defaultContextId: string;
}) {
  return (
    <div className="authority-form__grid">
      <label>
        Mode
        <select name="badge_command" required defaultValue="badge_definition.create">
          <option value="badge_definition.create">create</option>
          <option value="badge_definition.update">update</option>
          <option value="badge_definition.archive">archive</option>
        </select>
      </label>
      <label>
        Badge ID
        <input name="badge_id" list="badge-options" />
        <datalist id="badge-options">
          {badges.map((badge) => (
            <option value={badge.id} key={badge.id}>{badge.name}</option>
          ))}
        </datalist>
      </label>
      <label>
        Context ID
        <select name="context_id" defaultValue={defaultContextId}>
          <option value={defaultContextId}>Active context ({defaultContextId})</option>
          {contexts.map((context) => (
            <option value={context.id} key={context.id}>{context.name || context.id}</option>
          ))}
        </select>
      </label>
      <label>
        Badge Name / Permission
        <select name="name" defaultValue="badge.read">
          {contextPermissionCatalog.map((permission) => (
            <option value={permission} key={permission}>{permission}</option>
          ))}
        </select>
      </label>
      <label className="authority-form__wide">
        Description
        <input name="description" placeholder="What authority does this badge describe?" />
      </label>
    </div>
  );
}

function GrantMutationFields({
  badges,
  identities,
  principals,
  defaultContextId,
}: {
  badges: BadgeDefinitionReadModel[];
  identities: IdentityReadModel[];
  principals: PrincipalReadModel[];
  defaultContextId: string;
}) {
  return (
    <div className="authority-form__grid">
      <label>
        Mode
        <select name="grant_command" required defaultValue="principal_badge.grant">
          <option value="principal_badge.grant">grant</option>
          <option value="principal_badge.revoke">revoke</option>
        </select>
      </label>
      <label>
        Identity
        <select name="principal_id" required defaultValue="">
          <option value="" disabled>Select identity</option>
          {identities.map((identity) => (
            <option value={identity.principal_id} key={identity.id}>
              {identity.id} ({identity.principal.principal_type})
            </option>
          ))}
        </select>
      </label>
      <label>
        Principal ID fallback
        <input name="principal_id_fallback" list="principal-options" />
        <datalist id="principal-options">
          {principals.map((principal) => (
            <option value={principal.id} key={principal.id}>{principal.principal_type}</option>
          ))}
        </datalist>
      </label>
      <label>
        Badge ID
        <input name="badge_id" list="grant-badge-options" required />
        <datalist id="grant-badge-options">
          {badges.map((badge) => (
            <option value={badge.id} key={badge.id}>{badge.name}</option>
          ))}
        </datalist>
      </label>
      <label>
        Context ID
        <input name="context_id" defaultValue={defaultContextId} required />
      </label>
      <label>
        Permission
        <select name="permission" required defaultValue="badge.read">
          {contextPermissionCatalog.map((permission) => (
            <option value={permission} key={permission}>{permission}</option>
          ))}
        </select>
      </label>
      <label>
        Scope Mode
        <select name="scope_mode" defaultValue="direct">
          <option value="direct">direct</option>
          <option value="subtree">subtree</option>
        </select>
      </label>
      <label>
        Reason
        <input name="reason" placeholder="Why is this authority being changed?" />
      </label>
    </div>
  );
}

function ServiceProvisionFields({
  badges,
  defaultContextId,
}: {
  badges: BadgeDefinitionReadModel[];
  defaultContextId: string;
}) {
  return (
    <div className="authority-form__grid">
      <label>
        Service Key
        <input name="service_key" required placeholder="files.v1, agent-runner.v1" />
      </label>
      <label>
        Service Name
        <input name="name" placeholder="Files" />
      </label>
      <label>
        Context ID
        <input name="context_id" defaultValue={defaultContextId} />
      </label>
      <label>
        Binding Scope
        <select name="binding_scope_mode" defaultValue="direct">
          <option value="direct">direct</option>
          <option value="subtree">subtree</option>
        </select>
      </label>
      <label>
        Principal ID (optional)
        <input name="principal_id" placeholder="Generated if empty" />
      </label>
      <label>
        Account ID (optional)
        <input name="account_id" placeholder="Defaults from active session" />
      </label>
      <label>
        Service ID (optional)
        <input name="service_id" placeholder="Generated if empty" />
      </label>
      <label>
        Binding ID (optional)
        <input name="binding_id" placeholder="Generated if empty" />
      </label>
      <label>
        Key ID
        <input name="key_id" required placeholder="service-main-ed25519" />
      </label>
      <label>
        Algorithm
        <select name="algorithm" defaultValue="ed25519">
          <option value="ed25519">ed25519</option>
        </select>
      </label>
      <label>
        Registration ID (optional)
        <input name="registration_id" placeholder="Bootstrap/provenance id, not a private key" />
      </label>
      <label>
        Initial Badge
        <input name="initial_badge_id" list="service-badge-options" placeholder="Optional initial grant badge" />
        <datalist id="service-badge-options">
          {badges.map((badge) => (
            <option value={badge.id} key={badge.id}>{badge.name}</option>
          ))}
        </datalist>
      </label>
      <label>
        Initial Permission
        <select name="initial_permission" defaultValue="">
          <option value="">No initial grant</option>
          {contextPermissionCatalog.map((permission) => (
            <option value={permission} key={permission}>{permission}</option>
          ))}
        </select>
      </label>
      <label>
        Initial Grant Scope
        <select name="initial_scope_mode" defaultValue="direct">
          <option value="direct">direct</option>
          <option value="subtree">subtree</option>
        </select>
      </label>
      <label>
        Initial Grant Reason
        <input name="initial_reason" placeholder="Why should this service receive the badge?" />
      </label>
      <label className="authority-form__wide">
        Description
        <input name="description" placeholder="What does this service do in the context?" />
      </label>
      <label className="authority-form__wide">
        Service Public Key
        <textarea name="public_key" required placeholder="Paste rawurl-base64 Ed25519 public key material only. The service keeps its private key." />
      </label>
    </div>
  );
}

function KeyMutationFields({
  keys,
  principals,
}: {
  keys: PrincipalKeyReadModel[];
  principals: PrincipalReadModel[];
}) {
  return (
    <div className="authority-form__grid">
      <label>
        Mode
        <select name="key_command" required defaultValue="principal_key.register">
          <option value="principal_key.register">register</option>
          <option value="principal_key.rotate">rotate</option>
          <option value="principal_key.revoke">revoke</option>
        </select>
      </label>
      <label>
        Principal ID
        <input name="principal_id" list="key-principal-options" required />
        <datalist id="key-principal-options">
          {principals.map((principal) => (
            <option value={principal.id} key={principal.id}>{principal.principal_type}</option>
          ))}
        </datalist>
      </label>
      <label>
        Key ID
        <input name="key_id" required placeholder="current, laptop-2026-04, agent-main" />
      </label>
      <label>
        Old Key ID (rotation only)
        <input name="old_key_id" list="key-id-options" />
        <datalist id="key-id-options">
          {keys.map((key) => (
            <option value={key.key_id} key={key.id}>{key.status}</option>
          ))}
        </datalist>
      </label>
      <label>
        Algorithm
        <select name="algorithm" defaultValue="ed25519">
          <option value="ed25519">ed25519</option>
        </select>
      </label>
      <label className="authority-form__wide">
        Public Key
        <textarea name="public_key" placeholder="Paste public key material only. Never paste a private key here." />
      </label>
    </div>
  );
}

async function submitAuthorityMutation(
  moduleId: string,
  form: FormData,
  signingOptions?: AuthorityMutationSigningOptions,
) {
  if (moduleId === "accounts") {
    const command: AuthorityMutationCommand = "account.create";
    return createAccount({
      domain_id: textValue(form, "domain_id"),
      email: textValue(form, "email"),
      account_id: optionalTextValue(form, "account_id"),
      provider_id: optionalTextValue(form, "provider_id"),
    }, signingFor(command, signingOptions));
  }
  if (moduleId === "auth-methods") {
    const command = textValue(form, "auth_method_command") as AuthorityMutationCommand;
    const payload = {
      method_id: optionalTextValue(form, "method_id"),
      account_id: optionalTextValue(form, "account_id"),
      domain_id: optionalTextValue(form, "domain_id"),
      method_type: optionalTextValue(form, "method_type"),
      provider: optionalTextValue(form, "provider"),
      subject: optionalTextValue(form, "subject"),
      email: optionalTextValue(form, "email"),
      status: optionalTextValue(form, "status"),
    };
    if (command === "account_auth_method.revoke") {
      return revokeAccountAuthMethod(payload, signingFor(command, signingOptions));
    }
    return command === "account_auth_method.status"
      ? setAccountAuthMethodStatus(payload, signingFor(command, signingOptions))
      : linkAccountAuthMethod(payload, signingFor("account_auth_method.link", signingOptions));
  }
  if (moduleId === "identities") {
    const command = textValue(form, "identity_command") as AuthorityMutationCommand;
    if (command === "subject.create") {
      const subjectType = textValue(form, "subject_type") as "person" | "agent" | "service";
      return createSubject({
        subject_type: subjectType || "person",
        account_id: optionalTextValue(form, "account_id"),
        context_id: textValue(form, "context_id"),
        email: optionalTextValue(form, "email"),
        identity_id: optionalTextValue(form, "identity_id"),
        principal_id: optionalTextValue(form, "principal_id"),
        interactive_login_allowed: booleanValue(form, "interactive_login_allowed", true),
        token_key_required: booleanValue(form, "token_key_required", subjectType !== "person"),
        personal_context_requested: booleanValue(form, "personal_context_requested", false),
        service_key: optionalTextValue(form, "service_key"),
        key_id: optionalTextValue(form, "key_id"),
        public_key: optionalTextValue(form, "public_key"),
      }, signingFor(command, signingOptions));
    }
    return createIdentity({
      account_id: textValue(form, "account_id"),
      context_id: textValue(form, "context_id"),
      identity_id: optionalTextValue(form, "identity_id"),
      principal_id: optionalTextValue(form, "principal_id"),
    }, signingFor(command, signingOptions));
  }
  if (moduleId === "principals") {
    const command: AuthorityMutationCommand = "principal.create_durable";
    return createDurablePrincipal({
      principal_type: textValue(form, "principal_type") as "node" | "app" | "service" | "durable_agent" | "agent" | "managed",
      parent_principal_id: optionalTextValue(form, "parent_principal_id"),
      context_id: optionalTextValue(form, "context_id"),
      principal_id: optionalTextValue(form, "principal_id"),
    }, signingFor(command, signingOptions));
  }
  if (moduleId === "badges") {
    const payload = {
      badge_id: optionalTextValue(form, "badge_id"),
      context_id: optionalTextValue(form, "context_id"),
      name: optionalTextValue(form, "name"),
      description: optionalTextValue(form, "description"),
    };
    const command = textValue(form, "badge_command") as AuthorityMutationCommand;
    if (command === "badge_definition.archive") {
      return archiveBadgeDefinition(payload, signingFor(command, signingOptions));
    }
    return command === "badge_definition.update"
      ? updateBadgeDefinition(payload, signingFor(command, signingOptions))
      : createBadgeDefinition(payload, signingFor("badge_definition.create", signingOptions));
  }
  if (moduleId === "grants") {
    const selectedPrincipalId = textValue(form, "principal_id") || textValue(form, "principal_id_fallback");
    const payload = {
      principal_id: selectedPrincipalId,
      badge_id: textValue(form, "badge_id"),
      context_id: textValue(form, "context_id"),
      permission: textValue(form, "permission"),
      scope_mode: optionalTextValue(form, "scope_mode"),
      reason: optionalTextValue(form, "reason"),
    };
    const command = textValue(form, "grant_command") as AuthorityMutationCommand;
    return command === "principal_badge.revoke"
      ? revokePrincipalBadge(payload, signingFor(command, signingOptions))
      : grantPrincipalBadge(payload, signingFor("principal_badge.grant", signingOptions));
  }
  if (moduleId === "services") {
    const badgeId = optionalTextValue(form, "initial_badge_id");
    const permission = optionalTextValue(form, "initial_permission");
    const servicePrincipalId = optionalTextValue(form, "principal_id") ?? "";
    const contextId = optionalTextValue(form, "context_id") ?? "";
    const initialGrant = badgeId && permission
      ? [{
          principal_id: servicePrincipalId,
          badge_id: badgeId,
          context_id: contextId,
          permission,
          scope_mode: optionalTextValue(form, "initial_scope_mode"),
          reason: optionalTextValue(form, "initial_reason"),
        }]
      : undefined;
    const command: AuthorityMutationCommand = "context_service.provision";
    return provisionContextService({
      service_id: optionalTextValue(form, "service_id"),
      service_key: textValue(form, "service_key"),
      name: optionalTextValue(form, "name"),
      description: optionalTextValue(form, "description"),
      binding_id: optionalTextValue(form, "binding_id"),
      context_id: optionalTextValue(form, "context_id"),
      binding_scope_mode: optionalTextValue(form, "binding_scope_mode"),
      principal_id: optionalTextValue(form, "principal_id"),
      account_id: optionalTextValue(form, "account_id"),
      key_id: textValue(form, "key_id"),
      algorithm: optionalTextValue(form, "algorithm"),
      public_key: textValue(form, "public_key"),
      registration_id: optionalTextValue(form, "registration_id"),
      initial_grants: initialGrant,
    }, signingFor(command, signingOptions));
  }
  if (moduleId === "keys") {
    const payload = {
      principal_id: textValue(form, "principal_id"),
      key_id: textValue(form, "key_id"),
      old_key_id: optionalTextValue(form, "old_key_id"),
      algorithm: optionalTextValue(form, "algorithm"),
      public_key: optionalTextValue(form, "public_key"),
    };
    const command = textValue(form, "key_command") as AuthorityMutationCommand;
    if (command === "principal_key.revoke") {
      return revokePrincipalKey(payload, signingFor(command, signingOptions));
    }
    return command === "principal_key.rotate"
      ? rotatePrincipalKey(payload, signingFor(command, signingOptions))
      : registerPrincipalKey(payload);
  }
  const command: AuthorityMutationCommand = textValue(form, "context_command") === "context.update"
    ? "context.update"
    : "context.create";
  const payload = {
    name: textValue(form, "name"),
    context_id: optionalTextValue(form, "context_id"),
    parent_id: optionalTextValue(form, "parent_id"),
  };
  return command === "context.update"
    ? updateContext(payload, signingFor(command, signingOptions))
    : createContext(payload, signingFor(command, signingOptions));
}

function signingFor(
  command: AuthorityMutationCommand,
  signingOptions?: AuthorityMutationSigningOptions,
) {
  if (!authorityMutationRequiresSignature(command)) {
    return undefined;
  }
  if (!signingOptions?.principalId || !signingOptions.keyId) {
    throw new Error("Level 3 command signing is required. Generate and register a browser Ed25519 key on the Keys surface, or use Lookout Desktop.");
  }
  return signingOptions;
}

function textValue(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function optionalTextValue(form: FormData, name: string) {
  const value = textValue(form, name);
  return value || undefined;
}

function booleanValue(form: FormData, name: string, fallback: boolean) {
  const value = textValue(form, name);
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return fallback;
}

function mutationTitle(moduleId: string) {
  switch (moduleId) {
    case "accounts":
      return "Create Account / Enrollment";
    case "auth-methods":
      return "Link, Disable, Or Revoke Account Auth Method";
    case "identities":
      return "Enroll Identity Or Create Person";
    case "principals":
      return "Create Durable Principal";
    case "contexts":
      return "Create Or Update Context";
    case "badges":
      return "Create, Update, Or Archive Badge";
    case "grants":
      return "Grant Or Revoke Badge Permission";
    case "services":
      return "Provision Context Service";
    case "keys":
      return "Register, Revoke, Or Rotate Principal Key";
    default:
      return "Controlled Mutation";
  }
}

function mutationTone(status: MutationState["status"]) {
  switch (status) {
    case "accepted":
      return "success" as const;
    case "submitting":
    case "idle":
      return "warning" as const;
    default:
      return "danger" as const;
  }
}

function commandSigningTone(
  state: CommandSigningState,
  posture: CommandSigningPosture | undefined,
) {
  if (posture?.status === "ready") {
    return "success" as const;
  }
  if (state.status === "error" || posture?.status === "unsupported") {
    return "danger" as const;
  }
  if (state.status === "loading" || state.status === "working" || posture?.status === "missing" || posture?.status === "unregistered") {
    return "warning" as const;
  }
  return "neutral" as const;
}

function drillTone(status: DelegatedTransportDrillState["status"]) {
  switch (status) {
    case "passed":
      return "success" as const;
    case "running":
    case "idle":
      return "warning" as const;
    default:
      return "danger" as const;
  }
}

interface DelegatedTransportGrantResponse {
  status?: string;
  message?: string;
  error_code?: string;
  nats_native?: boolean;
  transport_ready?: boolean;
  grant_token?: string;
  claims?: Record<string, unknown>;
  native_credential?: {
    creds_file?: string;
  };
}

async function requestDelegatedTransport(
  payload: Record<string, unknown>,
  commandAuth?: string,
  body = JSON.stringify(payload),
  extraHeaders?: Record<string, string>,
) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID(),
    ...extraHeaders,
  };
  if (commandAuth) {
    headers["X-Stronghold-Command-Auth"] = commandAuth;
  }
  const response = await fetch("/_/transport/nats/credential", {
    method: "POST",
    credentials: "same-origin",
    headers,
    body,
  });
  const text = await response.text();
  let parsed: DelegatedTransportGrantResponse | undefined;
  try {
    parsed = text ? (JSON.parse(text) as DelegatedTransportGrantResponse) : undefined;
  } catch {
    parsed = { message: text };
  }
  return { response, body: parsed };
}

function errorCodeOrMessage(body: DelegatedTransportGrantResponse | undefined) {
  return body?.error_code ?? body?.message ?? body?.status;
}

function concreteDrillSubject(pattern: string | undefined, suffix: string) {
  if (!pattern) {
    return `stronghold.rcd5.missing.${suffix}`;
  }
  if (pattern.endsWith(".>")) {
    return `${pattern.slice(0, -2)}.${suffix}`;
  }
  if (pattern.includes("*")) {
    return pattern.replaceAll("*", suffix.replaceAll(".", "-"));
  }
  return pattern;
}

async function expectDrillPublish(connection: NatsConnection, subject: string, shouldAllow: boolean) {
  const result: NatsPermissionProbeResult = {
    step: "publish",
    subject,
    expected: shouldAllow ? "allowed" : "denied",
    observed: "allowed",
  };
  const statusError = waitDrillPermissionStatus(connection);
  try {
    connection.publish(subject, new TextEncoder().encode("stronghold-rcd5-delegated-transport-probe"));
    await connection.flush();
  } catch (error) {
    result.observed = "denied";
    result.error = describeNatsError(error);
    return result;
  }
  const permissionError = await statusError;
  if (permissionError) {
    result.observed = "denied";
    result.error = permissionError;
  }
  return result;
}

async function waitDrillPermissionStatus(connection: NatsConnection) {
  const iterator = connection.status();
  const timeout = new Promise<undefined>((resolve) => {
    window.setTimeout(() => resolve(undefined), 500);
  });
  const status = (async () => {
    for await (const entry of iterator) {
      if (entry.type !== "error") {
        continue;
      }
      const message = describeNatsError(entry.data);
      if (/permission|permissions|authorization|not authorized|denied/i.test(message)) {
        return message;
      }
    }
    return undefined;
  })();
  return Promise.race([status, timeout]);
}

function stringClaim(claims: Record<string, unknown> | undefined, key: string) {
  const value = claims?.[key];
  return typeof value === "string" && value ? value : undefined;
}

function timeClaim(claims: Record<string, unknown> | undefined, key: string) {
  const value = claims?.[key];
  if (typeof value === "string" && value) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }
  return undefined;
}

function stringArrayClaim(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function PrincipalList({
  state,
  principals,
}: {
  state: ResourceInterfaceState;
  principals: PrincipalReadModel[];
}) {
  const records: ResourceRecordSummary[] = principals.map((principal) => {
    const revoked = Boolean(principal.revoked_at);
    const ephemeral = principal.is_ephemeral;
    return {
      id: principal.id,
      title: principal.id,
      subtitle: `type:${principal.principal_type} · context:${principal.context_id}`,
      status: revoked ? "revoked" : ephemeral ? "ephemeral" : "durable",
      statusTone: revoked ? "danger" : ephemeral ? "warning" : "success",
      tags: [
        principal.principal_type,
        principal.account_id ? "account-bound" : "no-account",
        ephemeral ? "ephemeral" : "durable",
      ],
      fields: [
        { label: "Principal Type", value: principal.principal_type },
        { label: "Context", value: principal.context_id ?? "none" },
        { label: "Account", value: principal.account_id ?? "none" },
        { label: "Minted By", value: principal.minted_by_principal_id ?? "authority" },
        { label: "Authority Root", value: principal.authority_root_principal_id ?? "self" },
        { label: "Revoked", value: principal.revoked_at ?? "no" },
      ],
      relationships: [
        {
          label: "Authority root",
          value: principal.authority_root_principal_id ?? "self",
          detail: "Ownership/provenance is displayed separately from granted authority.",
          tone: "neutral",
        },
        {
          label: "Agent/service posture",
          value: principal.principal_type,
          detail: "Durable service and agent principals are managed as distinct execution identities.",
          tone: principal.principal_type === "agent" || principal.principal_type === "service" ? "success" : "neutral",
        },
      ],
      raw: principal,
    };
  });
  const columns: ResourceListColumn[] = [
    {
      id: "principal",
      label: "Principal",
      render: (record) => <span className="resource-list__id">{record.id}</span>,
      sortValue: (record) => record.id,
      searchValue: (record) => record.id,
    },
    {
      id: "type",
      label: "Type",
      render: (record) => record.fields?.find((field) => field.label === "Principal Type")?.value ?? "unknown",
      sortValue: (record) => String(record.fields?.find((field) => field.label === "Principal Type")?.value ?? ""),
      searchValue: (record) => String(record.fields?.find((field) => field.label === "Principal Type")?.value ?? ""),
    },
    {
      id: "context",
      label: "Context",
      render: (record) => <span className="resource-list__id">{record.fields?.find((field) => field.label === "Context")?.value}</span>,
      sortValue: (record) => String(record.fields?.find((field) => field.label === "Context")?.value ?? ""),
      searchValue: (record) => String(record.fields?.find((field) => field.label === "Context")?.value ?? ""),
    },
    {
      id: "status",
      label: "Status",
      render: (record) => (
        <StatusPill tone={record.statusTone ?? "neutral"} label={record.status ?? "unknown"} />
      ),
      sortValue: (record) => record.status ?? "",
      searchValue: (record) => record.status ?? "",
    },
  ];

  return (
    <ResourceInterfaceShell
      eyebrow="Principals"
      title="Principal Resource Interface"
      summary="Human, service, agent, and ephemeral execution principals with provenance separated from permission grants."
      state={state}
      records={records}
      listColumns={columns}
      showHeader={false}
      createSlot={
        <div className="empty-state">
          Durable principal creation remains in the controlled mutation panel until the resource create form is converted.
        </div>
      }
      editSlot={
        <div className="empty-state">
          Principal revoke/rotate posture is handled by Keys and controlled mutation work for this pass.
        </div>
      }
    />
  );
}

function GrantList({
  state,
  grants,
  badges,
  principals,
  identities,
}: {
  state: ResourceInterfaceState;
  grants: PrincipalBadgeGrantReadModel[];
  badges: BadgeDefinitionReadModel[];
  principals: PrincipalReadModel[];
  identities: IdentityReadModel[];
}) {
  const badgesById = new Map(badges.map((badge) => [badge.id, badge]));
  const principalsById = new Map(principals.map((principal) => [principal.id, principal]));
  const identitiesByPrincipalId = new Map(identities.map((identity) => [identity.principal_id, identity]));
  const records: ResourceRecordSummary[] = grants.map((grant) => {
    const badge = badgesById.get(grant.badge_id);
    const principal = principalsById.get(grant.principal_id);
    const identity = identitiesByPrincipalId.get(grant.principal_id);
    const revoked = Boolean(grant.revoked_at);
    return {
      id: grant.id,
      title: badge?.name ?? grant.badge_id,
      subtitle: `principal:${grant.principal_id} · context:${grant.effective_context_id ?? grant.context_id}`,
      status: revoked ? "revoked" : grant.inherited ? "inherited" : "active",
      statusTone: revoked ? "danger" : grant.inherited ? "warning" : "success",
      tags: [
        `scope:${grant.scope_mode ?? "direct"}`,
        `permission:${grant.permission}`,
        grant.inherited ? "inherited" : "direct",
      ],
      fields: [
        { label: "Badge", value: badge?.name ?? grant.badge_id },
        { label: "Badge ID", value: grant.badge_id },
        { label: "Principal", value: grant.principal_id },
        { label: "Identity", value: identity?.id ?? "not resolved" },
        { label: "Principal Type", value: principal?.principal_type ?? "unknown" },
        { label: "Context", value: grant.context_id },
        { label: "Effective Context", value: grant.effective_context_id ?? grant.context_id },
        { label: "Scope", value: grant.scope_mode ?? "direct" },
        { label: "Permission", value: grant.permission },
        { label: "Reason", value: grant.reason ?? "not recorded" },
        { label: "Revoked", value: grant.revoked_at ?? "no" },
      ],
      relationships: [
        {
          label: "Identity-bound target",
          value: identity?.id ?? grant.principal_id,
          detail: "Grants attach to the paired principal for one identity; they do not fan out to account sibling identities.",
          tone: identity ? "success" : "warning",
        },
        {
          label: "Badge definition",
          value: badge?.name ?? grant.badge_id,
          detail: "The badge defines the label being granted inside its context.",
          tone: badge ? "success" : "warning",
        },
        {
          label: "Scope mode",
          value: grant.scope_mode ?? "direct",
          detail: grant.inherited
            ? "This grant is inherited into the effective context during read/evaluation."
            : "This grant applies directly at its recorded context.",
          tone: grant.inherited ? "warning" : "neutral",
        },
      ],
      lifecycleActions: [
        {
          id: "revoke",
          label: revoked ? "Revoked" : "Revoke",
          kind: "revoke",
          disabled: revoked,
          confirmationLabel: "revoke badge grant",
          description: "Grant revocation stays in the controlled mutation panel until this resource action is wired.",
        },
      ],
      raw: grant,
    };
  });
  const columns: ResourceListColumn[] = [
    {
      id: "badge",
      label: "Badge",
      render: (record) => record.fields?.find((field) => field.label === "Badge")?.value ?? record.title,
      sortValue: (record) => String(record.fields?.find((field) => field.label === "Badge")?.value ?? record.title),
      searchValue: (record) => String(record.fields?.find((field) => field.label === "Badge")?.value ?? record.title),
    },
    {
      id: "principal",
      label: "Principal",
      render: (record) => <span className="resource-list__id">{record.fields?.find((field) => field.label === "Principal")?.value}</span>,
      sortValue: (record) => String(record.fields?.find((field) => field.label === "Principal")?.value ?? ""),
      searchValue: (record) => String(record.fields?.find((field) => field.label === "Principal")?.value ?? ""),
    },
    {
      id: "scope",
      label: "Scope",
      render: (record) => record.fields?.find((field) => field.label === "Scope")?.value ?? "direct",
      sortValue: (record) => String(record.fields?.find((field) => field.label === "Scope")?.value ?? ""),
      searchValue: (record) => String(record.fields?.find((field) => field.label === "Scope")?.value ?? ""),
    },
    {
      id: "status",
      label: "Status",
      render: (record) => (
        <StatusPill tone={record.statusTone ?? "neutral"} label={record.status ?? "unknown"} />
      ),
      sortValue: (record) => record.status ?? "",
      searchValue: (record) => record.status ?? "",
    },
    {
      id: "id",
      label: "Grant ID",
      render: (record) => <span className="resource-list__id">{record.id}</span>,
      sortValue: (record) => record.id,
      searchValue: (record) => record.id,
    },
  ];

  return (
    <ResourceInterfaceShell
      eyebrow="Grants"
      title="Grant Resource Interface"
      summary="Identity-facing badge grants with direct/subtree scope posture and inherited evaluation visibility."
      state={state}
      records={records}
      listColumns={columns}
      showHeader={false}
      createSlot={
        <div className="empty-state">
          Grant creation remains in the controlled mutation panel until the resource create form is converted.
        </div>
      }
      editSlot={
        <div className="empty-state">
          Grant revoke submissions remain in the controlled mutation panel for this pass.
        </div>
      }
    />
  );
}

function ServiceBindingList({
  state,
  definitions,
  bindings,
}: {
  state: ResourceInterfaceState;
  definitions: ServiceDefinitionReadModel[];
  bindings: ContextServiceBindingReadModel[];
}) {
  const definitionsByID = new Map(definitions.map((definition) => [definition.id, definition]));
  const boundServiceIds = new Set(bindings.map((binding) => binding.service_id));
  const bindingRecords: ResourceRecordSummary[] = bindings.map((binding) => {
    const definition = definitionsByID.get(binding.service_id);
    const lane = `permissions.${binding.context_id}.${binding.service_id}.<badge_id>.>`;
    const inactive = Boolean(binding.revoked_at) || binding.status !== "active";
    return {
      id: binding.id,
      title: definition?.name ?? binding.service_key ?? binding.service_id,
      subtitle: `context:${binding.context_id} · service:${binding.service_id}`,
      status: binding.status || "unknown",
      statusTone: inactive ? "warning" : "success",
      tags: ["binding", `scope:${binding.scope_mode}`, `status:${binding.status}`],
      fields: [
        { label: "Service", value: definition?.name ?? binding.service_id },
        { label: "Service ID", value: binding.service_id },
        { label: "Service Key", value: definition?.service_key ?? binding.service_key ?? "unknown" },
        { label: "Context", value: binding.context_id },
        { label: "Scope", value: binding.scope_mode },
        { label: "Status", value: binding.status },
        { label: "Permission Lane", value: lane },
        { label: "Revoked", value: binding.revoked_at ?? "no" },
      ],
      relationships: [
        {
          label: "Permission lane",
          value: lane,
          detail: "Services should read only their badge-scoped permission lane, not the whole authority bucket.",
          tone: "success",
        },
        {
          label: "Service definition",
          value: definition?.name ?? binding.service_id,
          detail: "A shared service definition can bind into many contexts without one process per context.",
          tone: definition ? "success" : "warning",
        },
      ],
      raw: binding,
    };
  });
  const definitionRecords: ResourceRecordSummary[] = definitions
    .filter((definition) => !boundServiceIds.has(definition.id))
    .map((definition) => ({
      id: definition.id,
      title: definition.name || definition.service_key,
      subtitle: "service definition without visible context binding",
      status: "definition",
      statusTone: "neutral",
      tags: ["definition", definition.service_key],
      fields: [
        { label: "Service ID", value: definition.id },
        { label: "Service Key", value: definition.service_key },
        { label: "Description", value: definition.description ?? "No description" },
      ],
      relationships: [
        {
          label: "Context binding",
          value: "not visible",
          detail: "This service definition has no active context binding in the loaded result set.",
          tone: "neutral",
        },
      ],
      raw: definition,
    }));
  const records = [...bindingRecords, ...definitionRecords];
  const columns: ResourceListColumn[] = [
    {
      id: "service",
      label: "Service",
      render: (record) => record.title,
      sortValue: (record) => record.title,
      searchValue: (record) => record.title,
    },
    {
      id: "context",
      label: "Context",
      render: (record) => record.fields?.find((field) => field.label === "Context")?.value ?? "not bound",
      sortValue: (record) => String(record.fields?.find((field) => field.label === "Context")?.value ?? ""),
      searchValue: (record) => String(record.fields?.find((field) => field.label === "Context")?.value ?? ""),
    },
    {
      id: "status",
      label: "Status",
      render: (record) => (
        <StatusPill tone={record.statusTone ?? "neutral"} label={record.status ?? "unknown"} />
      ),
      sortValue: (record) => record.status ?? "",
      searchValue: (record) => record.status ?? "",
    },
    {
      id: "id",
      label: "ID",
      render: (record) => <span className="resource-list__id">{record.id}</span>,
      sortValue: (record) => record.id,
      searchValue: (record) => record.id,
    },
  ];

  return (
    <ResourceInterfaceShell
      eyebrow="Services"
      title="Service Resource Interface"
      summary="Shared service definitions and context service bindings with badge-scoped permission lane posture."
      state={state}
      records={records}
      listColumns={columns}
      showHeader={false}
      createSlot={
        <div className="empty-state">
          Service provisioning remains in the controlled mutation panel until the resource create form is converted.
        </div>
      }
      editSlot={
        <div className="empty-state">
          Service binding lifecycle controls remain in controlled mutation work for this pass.
        </div>
      }
    />
  );
}

function KeyList({
  state,
  keys,
  principals,
}: {
  state: ResourceInterfaceState;
  keys: PrincipalKeyReadModel[];
  principals: PrincipalReadModel[];
}) {
  const principalsById = new Map(principals.map((principal) => [principal.id, principal]));
  const records: ResourceRecordSummary[] = keys.map((key) => {
    const principal = principalsById.get(key.principal_id);
    const inactive = Boolean(key.revoked_at) || key.status !== "active";
    return {
      id: key.id,
      title: key.key_id,
      subtitle: `principal:${key.principal_id} · algorithm:${key.algorithm}`,
      status: key.status || "unknown",
      statusTone: inactive ? "warning" : "success",
      tags: [
        key.algorithm,
        key.issuer_signature_present ? "sentry-bound" : "binding-missing",
        key.revoked_at ? "revoked" : "not-revoked",
      ],
      fields: [
        { label: "Key ID", value: key.key_id },
        { label: "Principal", value: key.principal_id },
        { label: "Principal Type", value: principal?.principal_type ?? "unknown" },
        { label: "Algorithm", value: key.algorithm },
        { label: "Status", value: key.status },
        { label: "Created", value: key.created_at ?? "unknown" },
        { label: "Expires", value: key.expires_at ?? "not set" },
        { label: "Revoked", value: key.revoked_at ?? "no" },
        { label: "Sentry Binding", value: key.issuer_signature_present ? "present" : "missing" },
      ],
      relationships: [
        {
          label: "Principal",
          value: key.principal_id,
          detail: "Keys bind cryptographic authorship to a principal; they are not transport credentials by themselves.",
          tone: principal ? "success" : "warning",
        },
        {
          label: "Sentry key binding",
          value: key.issuer_signature_present ? "present" : "missing",
          detail: "Issuer binding tells verifiers that Sentry recognizes this public key for the principal.",
          tone: key.issuer_signature_present ? "success" : "warning",
        },
      ],
      lifecycleActions: [
        {
          id: "revoke",
          label: key.revoked_at ? "Revoked" : "Revoke",
          kind: "revoke",
          disabled: Boolean(key.revoked_at),
          confirmationLabel: "revoke principal key",
          description: "Key revoke/rotate submissions remain in the controlled mutation panel until this resource action is wired.",
        },
      ],
      raw: key,
    };
  });
  const columns: ResourceListColumn[] = [
    {
      id: "key",
      label: "Key",
      render: (record) => record.title,
      sortValue: (record) => record.title,
      searchValue: (record) => record.title,
    },
    {
      id: "principal",
      label: "Principal",
      render: (record) => <span className="resource-list__id">{record.fields?.find((field) => field.label === "Principal")?.value}</span>,
      sortValue: (record) => String(record.fields?.find((field) => field.label === "Principal")?.value ?? ""),
      searchValue: (record) => String(record.fields?.find((field) => field.label === "Principal")?.value ?? ""),
    },
    {
      id: "algorithm",
      label: "Algorithm",
      render: (record) => record.fields?.find((field) => field.label === "Algorithm")?.value ?? "unknown",
      sortValue: (record) => String(record.fields?.find((field) => field.label === "Algorithm")?.value ?? ""),
      searchValue: (record) => String(record.fields?.find((field) => field.label === "Algorithm")?.value ?? ""),
    },
    {
      id: "status",
      label: "Status",
      render: (record) => (
        <StatusPill tone={record.statusTone ?? "neutral"} label={record.status ?? "unknown"} />
      ),
      sortValue: (record) => record.status ?? "",
      searchValue: (record) => record.status ?? "",
    },
  ];

  return (
    <ResourceInterfaceShell
      eyebrow="Keys"
      title="Key Resource Interface"
      summary="Principal key records, issuer binding posture, expiry, and revocation state without exposing private material."
      state={state}
      records={records}
      listColumns={columns}
      showHeader={false}
      createSlot={
        <div className="empty-state">
          Browser key registration remains in the Level 3 command-signing panel.
        </div>
      }
      editSlot={
        <div className="empty-state">
          Key revoke and rotate submissions remain in the controlled mutation panel for this pass.
        </div>
      }
    />
  );
}

function AuditList({ events }: { events: AuthorityAuditEventReadModel[] }) {
  if (!events.length) {
    return <div className="empty-state">No authority audit events are visible yet.</div>;
  }

  return (
    <div className="list">
      {events.map((event) => (
        <div className="list-item" key={event.id}>
          <div>
            <div className="list-item__title">{event.event_type}</div>
            <div className="list-item__body">
              resource:{event.resource_type}/{event.resource_id} · status:{event.status}
            </div>
            <div className="list-item__body">
              actor:{event.actor_principal_id ?? "unknown"} · target:
              {event.target_principal_id ?? "not recorded"} · context:{event.context_id ?? "not recorded"}
            </div>
            <div className="list-item__body">
              reason:{event.reason ?? "not recorded"} · correlation:
              {event.correlation_id ?? "not recorded"} · created:{event.created_at ?? "unknown"}
            </div>
            {event.error_code ? (
              <div className="list-item__body">error:{event.error_code}</div>
            ) : null}
          </div>
          <StatusPill
            tone={event.status === "accepted" ? "success" : event.status === "invalid" ? "warning" : "danger"}
            label={event.status || "unknown"}
          />
        </div>
      ))}
    </div>
  );
}

function ContextManagerReadSurface({
  state,
  contexts,
  identities,
  badges,
  grants,
}: {
  state: ResourceInterfaceState;
  contexts: ContextReadModel[];
  identities: IdentityReadModel[];
  badges: BadgeDefinitionReadModel[];
  grants: PrincipalBadgeGrantReadModel[];
}) {
  const sortedContexts = [...contexts].sort((left, right) => {
    const depthDelta = (left.depth ?? 0) - (right.depth ?? 0);
    if (depthDelta !== 0) {
      return depthDelta;
    }
    return (left.name || left.id).localeCompare(right.name || right.id);
  });
  const identitiesByContext = countBy(identities, (identity) => identity.context_id);
  const badgesByContext = countBy(badges, (badge) => badge.context_id);
  const directGrantsByContext = countBy(
    grants.filter((grant) => !grant.inherited && !grant.revoked_at),
    (grant) => grant.context_id,
  );
  const inheritedGrantsByContext = countBy(
    grants.filter((grant) => grant.inherited && !grant.revoked_at),
    (grant) => grant.effective_context_id ?? grant.context_id,
  );
  const records: ResourceRecordSummary[] = sortedContexts.map((context) => {
    const identityCount = identitiesByContext.get(context.id) ?? 0;
    const badgeCount = badgesByContext.get(context.id) ?? 0;
    const directGrantCount = directGrantsByContext.get(context.id) ?? 0;
    const inheritedGrantCount = inheritedGrantsByContext.get(context.id) ?? 0;
    const isRoot = !context.parent_id;
    return {
      id: context.id,
      title: context.name || context.id,
      subtitle: `parent:${context.parent_name ?? context.parent_id ?? "root"} · depth:${context.depth ?? 0}`,
      status: isRoot ? "root" : "child",
      statusTone: isRoot ? "success" : "neutral",
      tags: [
        `depth:${context.depth ?? 0}`,
        `children:${context.child_count ?? 0}`,
        `identities:${identityCount}`,
        `badges:${badgeCount}`,
      ],
      fields: [
        { label: "Parent", value: context.parent_name ?? context.parent_id ?? "root" },
        { label: "Depth", value: context.depth ?? 0 },
        { label: "Children", value: context.child_count ?? 0 },
        { label: "Identities", value: identityCount },
        { label: "Badges", value: badgeCount },
        { label: "Direct Grants", value: directGrantCount },
        { label: "Inherited Grants", value: inheritedGrantCount },
      ],
      relationships: [
        {
          label: "Parent context",
          value: context.parent_name ?? context.parent_id ?? "root",
          detail: context.parent_id
            ? "This context inherits downward-scoped posture from ancestors during evaluation."
            : "Root contexts are top-level authority boundaries for their tree.",
          tone: isRoot ? "success" : "neutral",
        },
        {
          label: "Grant evaluation",
          value: `${directGrantCount} direct / ${inheritedGrantCount} inherited`,
          detail: "Inherited grants are read/evaluation-time posture, not copied authority records.",
          tone: inheritedGrantCount ? "warning" : "neutral",
        },
      ],
      raw: context,
    };
  });
  const columns: ResourceListColumn[] = [
    {
      id: "name",
      label: "Name",
      render: (record) => record.title,
      sortValue: (record) => record.title,
      searchValue: (record) => `${record.title} ${record.subtitle ?? ""}`,
    },
    {
      id: "depth",
      label: "Depth",
      render: (record) => record.fields?.find((field) => field.label === "Depth")?.value ?? 0,
      sortValue: (record) => Number(record.fields?.find((field) => field.label === "Depth")?.value ?? 0),
      searchValue: (record) => String(record.fields?.find((field) => field.label === "Depth")?.value ?? 0),
    },
    {
      id: "parent",
      label: "Parent",
      render: (record) => record.fields?.find((field) => field.label === "Parent")?.value ?? "root",
      sortValue: (record) => String(record.fields?.find((field) => field.label === "Parent")?.value ?? "root"),
      searchValue: (record) => String(record.fields?.find((field) => field.label === "Parent")?.value ?? "root"),
    },
    {
      id: "counts",
      label: "Counts",
      render: (record) => record.tags?.join(" · ") ?? "none",
      sortValue: (record) => record.tags?.join(" ") ?? "",
      searchValue: (record) => record.tags?.join(" ") ?? "",
    },
    {
      id: "id",
      label: "ID",
      render: (record) => <span className="resource-list__id">{record.id}</span>,
      sortValue: (record) => record.id,
      searchValue: (record) => record.id,
    },
  ];

  return (
    <ResourceInterfaceShell
      eyebrow="Contexts"
      title="Context Resource Interface"
      summary="Context hierarchy, scoped authority boundaries, and read/evaluation-time inherited grant posture."
      state={state}
      records={records}
      listColumns={columns}
      showHeader={false}
      createSlot={
        <div className="empty-state">
          Context create controls remain in the controlled mutation panel until the resource create form is converted.
        </div>
      }
      editSlot={
        <div className="empty-state">
          Context edit controls remain in the controlled mutation panel for this pass.
        </div>
      }
    />
  );
}

function countBy<T>(values: T[], keyFor: (value: T) => string | undefined) {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    const key = keyFor(value);
    if (!key) {
      return;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
}

function BadgeManagerSurface({
  state,
  badges,
  contexts,
}: {
  state: ResourceInterfaceState;
  badges: BadgeDefinitionReadModel[];
  contexts: ContextReadModel[];
}) {
  const contextsById = new Map(contexts.map((context) => [context.id, context]));
  const sortedBadges = [...badges].sort((left, right) => {
    const leftContext = contextsById.get(left.context_id)?.name ?? left.context_id;
    const rightContext = contextsById.get(right.context_id)?.name ?? right.context_id;
    const contextDelta = leftContext.localeCompare(rightContext);
    if (contextDelta !== 0) {
      return contextDelta;
    }
    return (left.name || left.id).localeCompare(right.name || right.id);
  });
  const records: ResourceRecordSummary[] = sortedBadges.map((badge) => {
    const context = contextsById.get(badge.context_id);
    const archived = Boolean(badge.archived_at);
    return {
      id: badge.id,
      title: badge.name || badge.id,
      subtitle: `context:${context?.name ?? badge.context_id}`,
      status: archived ? "archived" : "definition",
      statusTone: archived ? "warning" : "neutral",
      tags: [
        "badge",
        archived ? "archived" : "active",
        `context:${context?.name ?? "unknown"}`,
      ],
      fields: [
        { label: "Context", value: context?.name ?? "unknown" },
        { label: "Context ID", value: badge.context_id },
        { label: "Description", value: badge.description ?? "No description" },
        { label: "Archived", value: badge.archived_at ?? "no" },
      ],
      relationships: [
        {
          label: "Bound context",
          value: context?.name ?? badge.context_id,
          detail: "Badge definitions are owned by the context they are created under.",
          tone: context ? "success" : "warning",
        },
        {
          label: "Grant posture",
          value: "identity-facing grants",
          detail: "Grant screens assign badge authority to identities through their paired principals.",
          tone: "neutral",
        },
      ],
      lifecycleActions: [
        {
          id: "archive",
          label: archived ? "Archived" : "Archive",
          kind: "archive",
          disabled: archived,
          confirmationLabel: "archive badge definition",
          description: "Badge archive is handled by the controlled mutation panel until this resource action is wired.",
        },
      ],
      raw: badge,
    };
  });
  const columns: ResourceListColumn[] = [
    {
      id: "name",
      label: "Name",
      render: (record) => record.title,
      sortValue: (record) => record.title,
      searchValue: (record) => record.title,
    },
    {
      id: "context",
      label: "Context",
      render: (record) => record.fields?.find((field) => field.label === "Context")?.value ?? "unknown",
      sortValue: (record) => String(record.fields?.find((field) => field.label === "Context")?.value ?? ""),
      searchValue: (record) => String(record.fields?.find((field) => field.label === "Context")?.value ?? ""),
    },
    {
      id: "status",
      label: "Status",
      render: (record) => (
        <StatusPill tone={record.statusTone ?? "neutral"} label={record.status ?? "unknown"} />
      ),
      sortValue: (record) => record.status ?? "",
      searchValue: (record) => record.status ?? "",
    },
    {
      id: "id",
      label: "ID",
      render: (record) => <span className="resource-list__id">{record.id}</span>,
      sortValue: (record) => record.id,
      searchValue: (record) => record.id,
    },
  ];

  return (
    <ResourceInterfaceShell
      eyebrow="Badges"
      title="Badge Resource Interface"
      summary="Context-scoped badge definitions with archive posture and grant-bound relationship hints."
      state={state}
      records={records}
      listColumns={columns}
      showHeader={false}
      createSlot={
        <div className="empty-state">
          Badge create/update controls remain in the controlled mutation panel until the resource create form is converted.
        </div>
      }
      editSlot={
        <div className="empty-state">
          Badge edits and archive submissions remain in the controlled mutation panel for this pass.
        </div>
      }
    />
  );
}

function AccountList({ accounts }: { accounts: AccountReadModel[] }) {
  if (!accounts.length) {
    return <div className="empty-state">No account records are visible yet.</div>;
  }

  return (
    <div className="list">
      {accounts.map((account) => (
        <div className="list-item" key={account.id}>
          <div>
            <div className="list-item__title">{account.email || account.id}</div>
            <div className="list-item__body">
              account:{account.id} · domain:{account.domain_id || "unknown"}
            </div>
            <div className="list-item__body">
              auth methods:{account.auth_method_count ?? 0} · providers:
              {account.auth_providers?.length ? account.auth_providers.join(", ") : "none reported"}
            </div>
          </div>
          <StatusPill tone={(account.auth_method_count ?? 0) > 0 || account.provider_id ? "success" : "neutral"} label={(account.auth_method_count ?? 0) > 0 ? "bound" : account.provider_id ? "legacy" : "unbound"} />
        </div>
      ))}
    </div>
  );
}

function AuthMethodList({
  methods,
  accounts,
}: {
  methods: AccountAuthMethodReadModel[];
  accounts: AccountReadModel[];
}) {
  if (!methods.length) {
    return <div className="empty-state">No account authentication methods are visible yet.</div>;
  }

  const accountById = new Map(accounts.map((account) => [account.id, account]));
  return (
    <div className="list">
      {methods.map((method) => {
        const account = accountById.get(method.account_id);
        return (
          <div className="list-item" key={method.id}>
            <div>
              <div className="list-item__title">{method.provider || method.method_type || method.id}</div>
              <div className="list-item__body">
                method:{method.id} · type:{method.method_type} · status:{method.status || "unknown"}
              </div>
              <div className="list-item__body">
                account:{account?.email ?? method.account_id} · domain:{method.domain_id}
              </div>
              <div className="list-item__body">
                subject:{method.subject_present ? "present and redacted" : "not present"} · email:
                {method.email ?? "not recorded"}
              </div>
              <div className="list-item__body">
                created:{method.created_at ?? "unknown"} · updated:{method.updated_at ?? "unknown"}
              </div>
            </div>
            <StatusPill tone={method.status === "active" ? "success" : method.status === "disabled" ? "warning" : "danger"} label={method.status || "unknown"} />
          </div>
        );
      })}
    </div>
  );
}

function IdentityList({
  state,
  identities,
  accounts,
  contexts,
}: {
  state: ResourceInterfaceState;
  identities: IdentityReadModel[];
  accounts: AccountReadModel[];
  contexts: ContextReadModel[];
}) {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const contextsById = new Map(contexts.map((context) => [context.id, context]));
  const records: ResourceRecordSummary[] = identities.map((identity) => {
    const account = accountsById.get(identity.account_id);
    const context = contextsById.get(identity.context_id);
    const durable = !identity.principal.is_ephemeral;
    return {
      id: identity.id,
      title: account?.email ?? identity.id,
      subtitle: `context:${context?.name ?? identity.context_id} · principal:${identity.principal_id}`,
      status: durable ? "durable" : "ephemeral",
      statusTone: durable ? "success" : "warning",
      tags: [
        identity.principal.principal_type,
        `badges:${identity.badge_ids?.length ?? 0}`,
        `lineage:${identity.lineage?.length ?? 0}`,
      ],
      fields: [
        { label: "Account", value: account?.email ?? identity.account_id },
        { label: "Account ID", value: identity.account_id },
        { label: "Context", value: context?.name ?? identity.context_id },
        { label: "Context ID", value: identity.context_id },
        { label: "Principal", value: identity.principal_id },
        { label: "Principal Type", value: identity.principal.principal_type },
        { label: "Badges", value: identity.badge_ids?.length ?? 0 },
      ],
      relationships: [
        {
          label: "Account",
          value: account?.email ?? identity.account_id,
          detail: "The account owns authentication and may have multiple context-bound identities.",
          tone: account ? "success" : "warning",
        },
        {
          label: "Context",
          value: context?.name ?? identity.context_id,
          detail: "Authority is scoped through this identity in this context, not across account siblings.",
          tone: context ? "success" : "warning",
        },
        {
          label: "Paired principal",
          value: identity.principal_id,
          detail: "The principal is the execution/authorship surface paired with this identity.",
          tone: durable ? "success" : "warning",
        },
      ],
      raw: identity,
    };
  });
  const columns: ResourceListColumn[] = [
    {
      id: "account",
      label: "Account",
      render: (record) => record.fields?.find((field) => field.label === "Account")?.value ?? record.title,
      sortValue: (record) => String(record.fields?.find((field) => field.label === "Account")?.value ?? record.title),
      searchValue: (record) => String(record.fields?.find((field) => field.label === "Account")?.value ?? record.title),
    },
    {
      id: "context",
      label: "Context",
      render: (record) => record.fields?.find((field) => field.label === "Context")?.value ?? "unknown",
      sortValue: (record) => String(record.fields?.find((field) => field.label === "Context")?.value ?? ""),
      searchValue: (record) => String(record.fields?.find((field) => field.label === "Context")?.value ?? ""),
    },
    {
      id: "principal_type",
      label: "Type",
      render: (record) => record.fields?.find((field) => field.label === "Principal Type")?.value ?? "unknown",
      sortValue: (record) => String(record.fields?.find((field) => field.label === "Principal Type")?.value ?? ""),
      searchValue: (record) => String(record.fields?.find((field) => field.label === "Principal Type")?.value ?? ""),
    },
    {
      id: "status",
      label: "Status",
      render: (record) => (
        <StatusPill tone={record.statusTone ?? "neutral"} label={record.status ?? "unknown"} />
      ),
      sortValue: (record) => record.status ?? "",
      searchValue: (record) => record.status ?? "",
    },
    {
      id: "id",
      label: "Identity ID",
      render: (record) => <span className="resource-list__id">{record.id}</span>,
      sortValue: (record) => record.id,
      searchValue: (record) => record.id,
    },
  ];

  return (
    <ResourceInterfaceShell
      eyebrow="Identities"
      title="Identity Resource Interface"
      summary="Account-owned, context-bound identities with paired principal posture."
      state={state}
      records={records}
      listColumns={columns}
      showHeader={false}
      createSlot={
        <div className="empty-state">
          Identity, person subject, agent, and service creation remain in the controlled mutation panel until the resource create form is converted.
        </div>
      }
      editSlot={
        <div className="empty-state">
          Identity edits and lifecycle controls are intentionally not mounted in this pass.
        </div>
      }
    />
  );
}
