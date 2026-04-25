import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Panel } from "../../components/ui/Panel";
import { StatusPill } from "../../components/ui/StatusPill";
import { useNats } from "../../lib/nats/NatsProvider";
import { useSession } from "../../lib/session/SessionProvider";
import {
  AuthorityReadError,
  AuthorityMutationError,
  archiveBadgeDefinition,
  createAccount,
  createBadgeDefinition,
  createContext,
  createDurablePrincipal,
  createIdentity,
  grantPrincipalBadge,
  readAccounts,
  readBadgeDefinitions,
  readBadgeGrants,
  readContexts,
  readIdentities,
  readPrincipalKeys,
  readPrincipals,
  revokePrincipalBadge,
  updateBadgeDefinition,
  updateContext,
} from "../../lib/authority/authority-client";
import type {
  AccountReadModel,
  AuthorityMutationResult,
  AuthorityLoadStatus,
  BadgeDefinitionReadModel,
  ContextReadModel,
  IdentityReadModel,
  PrincipalBadgeGrantReadModel,
  PrincipalKeyReadModel,
  PrincipalReadModel,
} from "../../lib/authority/authority-types";
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
    "Include permission and revoked state when the read model is available.",
    "Keep grant/revoke controls out of scope for this phase.",
  ],
  principals: [
    "Show principal types: human, node/service/app/agent, system, and ephemeral.",
    "Separate ownership/provenance from permission grants.",
    "Keep durable and ephemeral posture visible without merging them.",
  ],
  keys: [
    "Show key IDs, algorithm, status, created, expiry, and revoked state.",
    "Never show public key material, private key material, or metadata blobs that may leak secrets.",
    "Defer rotation and revocation controls to the key lifecycle phase.",
  ],
  providers: [
    "Show Drawbridge provider posture and missing-header state.",
    "Confirm OAuth secrets and client IDs remain redacted.",
    "Defer provider mutation to controlled authority-management work.",
  ],
  transport: [
    "Show browser transport readiness separately from login state.",
    "Keep transport ready=false until the session-backed NATS rail is designed.",
    "Never expose reusable NATS credentials to browser JavaScript.",
  ],
  audit: [
    "Reserve a stable cockpit home for authority audit evidence.",
    "Show empty/planned states until audit storage exists.",
    "Use this surface later for denied attempts, mutations, key lifecycle, and session events.",
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
      contexts: ContextReadModel[];
      identities: IdentityReadModel[];
      badges: BadgeDefinitionReadModel[];
      principals: PrincipalReadModel[];
      grants: PrincipalBadgeGrantReadModel[];
      keys: PrincipalKeyReadModel[];
    }
  | {
      status: AuthorityLoadStatus;
      detail: string;
      accounts: AccountReadModel[];
      contexts: ContextReadModel[];
      identities: IdentityReadModel[];
      badges: BadgeDefinitionReadModel[];
      principals: PrincipalReadModel[];
      grants: PrincipalBadgeGrantReadModel[];
      keys: PrincipalKeyReadModel[];
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
    case "reconnecting":
      return "warning" as const;
    case "error":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

function liveSurfaceLabel(moduleId: string) {
  switch (moduleId) {
    case "accounts":
      return "Account Inventory";
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
    case "keys":
      return "Key Posture";
    default:
      return "";
  }
}

function isLiveReadSurface(moduleId: string) {
  return ["accounts", "identities", "contexts", "badges", "principals", "grants", "keys"].includes(moduleId);
}

function isMutationSurface(moduleId: string) {
  return ["accounts", "identities", "contexts", "principals", "badges", "grants"].includes(moduleId);
}

type MutationState =
  | { status: "idle"; detail: string; result?: undefined }
  | { status: "submitting"; detail: string; result?: undefined }
  | { status: "accepted"; detail: string; result: AuthorityMutationResult }
  | { status: "denied" | "invalid" | "error"; detail: string; result?: AuthorityMutationResult };

export function AuthorityPlaceholderPage() {
  const { surface } = useParams();
  const module = findModule(surface);
  const { snapshot } = useSession();
  const nats = useNats();
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [mutationState, setMutationState] = useState<MutationState>({
    status: "idle",
    detail: "Mutation controls are idle.",
  });
  const [readState, setReadState] = useState<LiveReadState>({
    status: "idle",
    detail: "This authority surface has not requested data yet.",
    accounts: [],
    contexts: [],
    identities: [],
    badges: [],
    principals: [],
    grants: [],
    keys: [],
  });

  useEffect(() => {
    if (!module || !isLiveReadSurface(module.id)) {
      setReadState({
        status: "idle",
        detail: "This surface remains a read-first placeholder until its work order lands.",
        accounts: [],
        contexts: [],
        identities: [],
        badges: [],
        principals: [],
        grants: [],
        keys: [],
      });
      return;
    }

    const controller = new AbortController();
    setReadState({
      status: "loading",
      detail: `Loading ${module.name.toLowerCase()} through the Sentry authority read adapter.`,
      accounts: [],
      contexts: [],
      identities: [],
      badges: [],
      principals: [],
      grants: [],
      keys: [],
    });

    async function load() {
      try {
        if (module?.id === "accounts") {
          const response = await readAccounts(controller.signal, { limit: 100 });
          setReadState({
            status: response.items.length ? "ready" : "empty",
            detail: response.items.length
            ? "Accounts loaded through Sentry authority reads."
            : "No accounts were returned for this session scope.",
            accounts: response.items,
            contexts: [],
            identities: [],
            badges: [],
            principals: [],
            grants: [],
            keys: [],
          });
          return;
        }

        if (module?.id === "identities") {
          const response = await readIdentities(controller.signal, { limit: 100 });
          setReadState({
            status: response.items.length ? "ready" : "empty",
            detail: response.items.length
              ? "Identities and paired principals loaded through Sentry authority reads."
              : "No identities were returned for this session scope.",
            accounts: [],
            contexts: [],
            identities: response.items,
            badges: [],
            principals: [],
            grants: [],
            keys: [],
          });
          return;
        }

        if (module?.id === "contexts") {
          const response = await readContexts(controller.signal, { limit: 100 });
          setReadState({
            status: response.items.length ? "ready" : "empty",
            detail: response.items.length
              ? "Contexts loaded through Sentry authority reads."
              : "No contexts were returned for this session scope.",
            accounts: [],
            contexts: response.items,
            identities: [],
            badges: [],
            principals: [],
            grants: [],
            keys: [],
          });
          return;
        }

        if (module?.id === "badges") {
          const response = await readBadgeDefinitions(controller.signal, { limit: 100 });
          setReadState({
            status: response.items.length ? "ready" : "empty",
            detail: response.items.length
              ? "Badge definitions loaded through Sentry authority reads."
              : "No badge definitions were returned for this session scope.",
            accounts: [],
            contexts: [],
            identities: [],
            badges: response.items,
            principals: [],
            grants: [],
            keys: [],
          });
          return;
        }

        if (module?.id === "principals") {
          const response = await readPrincipals(controller.signal, { limit: 100 });
          setReadState({
            status: response.items.length ? "ready" : "empty",
            detail: response.items.length
              ? "Principals loaded through Sentry authority reads."
              : "No principals were returned for this session scope.",
            accounts: [],
            contexts: [],
            identities: [],
            badges: [],
            principals: response.items,
            grants: [],
            keys: [],
          });
          return;
        }

        if (module?.id === "grants") {
          const [response, badges, principals] = await Promise.all([
            readBadgeGrants(controller.signal, { limit: 100 }),
            readBadgeDefinitions(controller.signal, { limit: 100 }),
            readPrincipals(controller.signal, { limit: 100 }),
          ]);
          setReadState({
            status: response.items.length ? "ready" : "empty",
            detail: response.items.length
              ? "Badge grants loaded through Sentry authority reads."
              : "No badge grants were returned for this session scope.",
            accounts: [],
            contexts: [],
            identities: [],
            badges: badges.items,
            principals: principals.items,
            grants: response.items,
            keys: [],
          });
          return;
        }

        const response = await readPrincipalKeys(controller.signal, { limit: 100 });
        setReadState({
          status: response.items.length ? "ready" : "empty",
          detail: response.items.length
            ? "Principal key posture loaded through Sentry authority reads."
            : "No principal keys were returned for this session scope.",
          accounts: [],
          contexts: [],
          identities: [],
          badges: [],
          principals: [],
          grants: [],
          keys: response.items,
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
          contexts: [],
          identities: [],
          badges: [],
          principals: [],
          grants: [],
          keys: [],
        });
      }
    }

    void load();
    return () => controller.abort();
  }, [module, refreshNonce]);

  if (!module) {
    return <Navigate to="/authority/accounts" replace />;
  }

  const notes = surfaceNotes[module.id] ?? [];
  const isLiveSurface = isLiveReadSurface(module.id);
  const activePrincipal = snapshot.activePrincipal ?? snapshot.root;

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
        {isLiveSurface ? (
          <Panel
            eyebrow="Live Read"
            title={liveSurfaceLabel(module.id)}
            description={readState.detail}
            actions={<StatusPill tone={statusTone(readState.status)} label={readState.status} />}
          >
            {readState.status === "loading" || readState.status === "denied" || readState.status === "error" ? (
              <AuthorityReadNotice status={readState.status} detail={readState.detail} sessionStatus={snapshot.status} />
            ) : module.id === "accounts" ? (
              <AccountList accounts={readState.accounts} />
            ) : module.id === "identities" ? (
              <IdentityList identities={readState.identities} />
            ) : module.id === "contexts" ? (
              <ContextList contexts={readState.contexts} />
            ) : module.id === "badges" ? (
              <BadgeList badges={readState.badges} />
            ) : module.id === "principals" ? (
              <PrincipalList principals={readState.principals} />
            ) : module.id === "grants" ? (
              <GrantList grants={readState.grants} />
            ) : (
              <KeyList keys={readState.keys} />
            )}
          </Panel>
        ) : null}

        <Panel
          eyebrow="Access State"
          title="Session and Transport Posture"
          description="Authority reads use same-origin Sentry HTTP. Browser NATS readiness is tracked separately so transport gaps are not mistaken for auth denial."
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
              <div className="kv__label">NATS State</div>
              <div className="kv__value">
                <StatusPill tone={natsTone(nats.state)} label={nats.state} />
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

        <Panel
          eyebrow="Cockpit Surface"
          title={module.description}
          description={module.entryHint}
          actions={<StatusPill tone="warning" label={module.status} />}
        >
          <div className="list">
            {notes.map((note) => (
              <div className="list-item" key={note}>
                <div>
                  <div className="list-item__title">Design Note</div>
                  <div className="list-item__body">{note}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {isMutationSurface(module.id) ? (
          <AuthorityMutationPanel
            moduleId={module.id}
            readState={readState}
            snapshotContextId={activePrincipal?.contextId ?? ""}
            mutationState={mutationState}
            onState={setMutationState}
            onAccepted={() => setRefreshNonce((value) => value + 1)}
          />
        ) : null}

        <Panel
          eyebrow="Non-Goals"
          title="Read-First Boundary"
          description="Mutation controls are limited to the Phase 4 backend commands that already exist."
        >
          <div className="empty-state">
            Badge grant/revoke, key lifecycle, audit, and browser transport controls are still out
            of scope here. Phase 4 only creates accounts, identities, durable principals, and
            contexts through Sentry-controlled mutations.
          </div>
        </Panel>
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
  onState,
  onAccepted,
}: {
  moduleId: string;
  readState: LiveReadState;
  snapshotContextId: string;
  mutationState: MutationState;
  onState: (state: MutationState) => void;
  onAccepted: () => void;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onState({ status: "submitting", detail: "Submitting controlled authority mutation through Sentry." });
    try {
      const result = await submitAuthorityMutation(moduleId, form);
      onState({
        status: "accepted",
        detail: `${result.resource_type ?? "resource"} ${result.resource_id ?? ""} accepted by Sentry.`,
        result,
      });
      onAccepted();
      event.currentTarget.reset();
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
      eyebrow="Controlled Mutation"
      title={mutationTitle(moduleId)}
      description="These controls call Sentry authority mutations with same-origin credentials. They do not bypass Aegis, Sentry, or db-service."
      actions={<StatusPill tone={mutationTone(mutationState.status)} label={mutationState.status} />}
    >
      <form className="authority-form" onSubmit={submit}>
        {moduleId === "accounts" ? (
          <AccountMutationFields defaultDomainId={snapshotContextId} />
        ) : moduleId === "identities" ? (
          <IdentityMutationFields accounts={readState.accounts} contexts={readState.contexts} defaultContextId={snapshotContextId} />
        ) : moduleId === "principals" ? (
          <PrincipalMutationFields principals={readState.principals} defaultContextId={snapshotContextId} />
        ) : moduleId === "badges" ? (
          <BadgeMutationFields badges={readState.badges} defaultContextId={snapshotContextId} />
        ) : moduleId === "grants" ? (
          <GrantMutationFields badges={readState.badges} principals={readState.principals} defaultContextId={snapshotContextId} />
        ) : (
          <ContextMutationFields contexts={readState.contexts} />
        )}
        <div className="button-row">
          <button className="button" type="submit" disabled={mutationState.status === "submitting"}>
            Submit Controlled Mutation
          </button>
        </div>
      </form>
      <div className={`state-notice ${mutationState.status === "accepted" ? "state-notice--success" : mutationState.status === "idle" ? "" : mutationState.status === "submitting" ? "state-notice--loading" : "state-notice--error"}`}>
        <div className="state-notice__title">Mutation Result</div>
        <div className="state-notice__body">
          {mutationState.detail}
          {mutationState.result?.error_code ? ` (${mutationState.result.error_code})` : ""}
        </div>
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
        Account
        <select name="account_id" required defaultValue="">
          <option value="" disabled>Select account</option>
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
        Identity ID (optional)
        <input name="identity_id" />
      </label>
      <label>
        Principal ID (optional)
        <input name="principal_id" />
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
  defaultContextId,
}: {
  badges: BadgeDefinitionReadModel[];
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
        <input name="context_id" defaultValue={defaultContextId} />
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
  principals,
  defaultContextId,
}: {
  badges: BadgeDefinitionReadModel[];
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
        Principal ID
        <input name="principal_id" list="principal-options" required />
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
        Reason
        <input name="reason" placeholder="Why is this authority being changed?" />
      </label>
    </div>
  );
}

async function submitAuthorityMutation(moduleId: string, form: FormData) {
  if (moduleId === "accounts") {
    return createAccount({
      domain_id: textValue(form, "domain_id"),
      email: textValue(form, "email"),
      account_id: optionalTextValue(form, "account_id"),
      provider_id: optionalTextValue(form, "provider_id"),
    });
  }
  if (moduleId === "identities") {
    return createIdentity({
      account_id: textValue(form, "account_id"),
      context_id: textValue(form, "context_id"),
      identity_id: optionalTextValue(form, "identity_id"),
      principal_id: optionalTextValue(form, "principal_id"),
    });
  }
  if (moduleId === "principals") {
    return createDurablePrincipal({
      principal_type: textValue(form, "principal_type") as "node" | "app" | "service" | "durable_agent" | "agent" | "managed",
      parent_principal_id: optionalTextValue(form, "parent_principal_id"),
      context_id: optionalTextValue(form, "context_id"),
      principal_id: optionalTextValue(form, "principal_id"),
    });
  }
  if (moduleId === "badges") {
    const payload = {
      badge_id: optionalTextValue(form, "badge_id"),
      context_id: optionalTextValue(form, "context_id"),
      name: optionalTextValue(form, "name"),
      description: optionalTextValue(form, "description"),
    };
    const command = textValue(form, "badge_command");
    if (command === "badge_definition.archive") {
      return archiveBadgeDefinition(payload);
    }
    return command === "badge_definition.update"
      ? updateBadgeDefinition(payload)
      : createBadgeDefinition(payload);
  }
  if (moduleId === "grants") {
    const payload = {
      principal_id: textValue(form, "principal_id"),
      badge_id: textValue(form, "badge_id"),
      context_id: textValue(form, "context_id"),
      permission: textValue(form, "permission"),
      reason: optionalTextValue(form, "reason"),
    };
    return textValue(form, "grant_command") === "principal_badge.revoke"
      ? revokePrincipalBadge(payload)
      : grantPrincipalBadge(payload);
  }
  const payload = {
    name: textValue(form, "name"),
    context_id: optionalTextValue(form, "context_id"),
    parent_id: optionalTextValue(form, "parent_id"),
  };
  return textValue(form, "context_command") === "context.update"
    ? updateContext(payload)
    : createContext(payload);
}

function textValue(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function optionalTextValue(form: FormData, name: string) {
  const value = textValue(form, name);
  return value || undefined;
}

function mutationTitle(moduleId: string) {
  switch (moduleId) {
    case "accounts":
      return "Create Account / Enrollment";
    case "identities":
      return "Create Identity In Context";
    case "principals":
      return "Create Durable Principal";
    case "contexts":
      return "Create Or Update Context";
    case "badges":
      return "Create, Update, Or Archive Badge";
    case "grants":
      return "Grant Or Revoke Badge Permission";
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

function PrincipalList({ principals }: { principals: PrincipalReadModel[] }) {
  if (!principals.length) {
    return <div className="empty-state">No principal records are visible yet.</div>;
  }

  return (
    <div className="list">
      {principals.map((principal) => (
        <div className="list-item" key={principal.id}>
          <div>
            <div className="list-item__title">{principal.id}</div>
            <div className="list-item__body">
              type:{principal.principal_type} · context:{principal.context_id} · account:
              {principal.account_id ?? "none"}
            </div>
            <div className="list-item__body">
              minted by:{principal.minted_by_principal_id ?? "authority"} · authority root:
              {principal.authority_root_principal_id ?? "self"}
            </div>
          </div>
          <StatusPill
            tone={principal.revoked_at ? "danger" : principal.is_ephemeral ? "warning" : "success"}
            label={principal.revoked_at ? "revoked" : principal.is_ephemeral ? "ephemeral" : "durable"}
          />
        </div>
      ))}
    </div>
  );
}

function GrantList({ grants }: { grants: PrincipalBadgeGrantReadModel[] }) {
  if (!grants.length) {
    return <div className="empty-state">No badge grants are visible yet.</div>;
  }

  return (
    <div className="list">
      {grants.map((grant) => (
        <div className="list-item" key={grant.id}>
          <div>
            <div className="list-item__title">{grant.principal_id}</div>
            <div className="list-item__body">
              badge:{grant.badge_id} · context:{grant.context_id} · permission:{grant.permission}
            </div>
            <div className="list-item__body">
              granted by:{grant.granted_by_principal_id ?? "authority"} · reason:
              {grant.reason ?? "not recorded"}
            </div>
            <div className="list-item__body">
              grant:{grant.id} · created:{grant.created_at ?? "unknown"} · revoked:
              {grant.revoked_at ?? "no"}
            </div>
          </div>
          <StatusPill tone={grant.revoked_at ? "danger" : "success"} label={grant.revoked_at ? "revoked" : "active"} />
        </div>
      ))}
    </div>
  );
}

function KeyList({ keys }: { keys: PrincipalKeyReadModel[] }) {
  if (!keys.length) {
    return <div className="empty-state">No principal keys are visible yet.</div>;
  }

  return (
    <div className="list">
      {keys.map((key) => (
        <div className="list-item" key={key.id}>
          <div>
            <div className="list-item__title">{key.key_id}</div>
            <div className="list-item__body">
              principal:{key.principal_id} · algorithm:{key.algorithm} · status:{key.status}
            </div>
            <div className="list-item__body">
              created:{key.created_at ?? "unknown"} · expires:{key.expires_at ?? "not set"} · revoked:
              {key.revoked_at ?? "no"}
            </div>
          </div>
          <StatusPill tone={key.revoked_at || key.status !== "active" ? "warning" : "success"} label={key.status || "unknown"} />
        </div>
      ))}
    </div>
  );
}

function ContextList({ contexts }: { contexts: ContextReadModel[] }) {
  if (!contexts.length) {
    return <div className="empty-state">No context records are visible yet.</div>;
  }

  return (
    <div className="list">
      {contexts.map((context) => (
        <div className="list-item" key={context.id}>
          <div>
            <div className="list-item__title">{context.name || context.id}</div>
            <div className="list-item__body">
              context:{context.id} · parent:{context.parent_id ?? "root"}
            </div>
          </div>
          <StatusPill tone={context.parent_id ? "neutral" : "success"} label={context.parent_id ? "child" : "root"} />
        </div>
      ))}
    </div>
  );
}

function BadgeList({ badges }: { badges: BadgeDefinitionReadModel[] }) {
  if (!badges.length) {
    return <div className="empty-state">No badge definitions are visible yet.</div>;
  }

  return (
    <div className="list">
      {badges.map((badge) => (
        <div className="list-item" key={badge.id}>
          <div>
            <div className="list-item__title">{badge.name || badge.id}</div>
            <div className="list-item__body">
              badge:{badge.id} · context:{badge.context_id}
            </div>
            <div className="list-item__body">{badge.description ?? "No description"}</div>
            <div className="list-item__body">archived:{badge.archived_at ?? "no"}</div>
          </div>
          <StatusPill tone={badge.archived_at ? "warning" : "neutral"} label={badge.archived_at ? "archived" : "definition"} />
        </div>
      ))}
    </div>
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
          </div>
          <StatusPill tone={account.provider_id ? "success" : "neutral"} label={account.provider_id ? "external" : "local"} />
        </div>
      ))}
    </div>
  );
}

function IdentityList({ identities }: { identities: IdentityReadModel[] }) {
  if (!identities.length) {
    return <div className="empty-state">No identity records are visible yet.</div>;
  }

  return (
    <div className="list">
      {identities.map((identity) => (
        <div className="list-item" key={identity.id}>
          <div>
            <div className="list-item__title">{identity.id}</div>
            <div className="list-item__body">
              account:{identity.account_id} · context:{identity.context_id} · principal:
              {identity.principal_id}
            </div>
            <div className="list-item__body">
              principal type:{identity.principal.principal_type} · lineage:
              {identity.lineage?.length ?? 0} · badges:{identity.badge_ids?.length ?? 0}
            </div>
          </div>
          <StatusPill tone={identity.principal.is_ephemeral ? "warning" : "success"} label={identity.principal.is_ephemeral ? "ephemeral" : "durable"} />
        </div>
      ))}
    </div>
  );
}
