import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Panel } from "../../components/ui/Panel";
import { StatusPill } from "../../components/ui/StatusPill";
import {
  AuthorityReadError,
  readAccounts,
  readBadgeDefinitions,
  readContexts,
  readIdentities,
} from "../../lib/authority/authority-client";
import type {
  AccountReadModel,
  AuthorityLoadStatus,
  BadgeDefinitionReadModel,
  ContextReadModel,
  IdentityReadModel,
} from "../../lib/authority/authority-types";
import { lookoutModules, type LookoutModuleDefinition } from "../../shell/module-registry";

const authorityModules = lookoutModules.filter((module) =>
  module.route.startsWith("/authority/"),
);

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
    }
  | {
      status: AuthorityLoadStatus;
      detail: string;
      accounts: AccountReadModel[];
      contexts: ContextReadModel[];
      identities: IdentityReadModel[];
      badges: BadgeDefinitionReadModel[];
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
    default:
      return "";
  }
}

function isLiveReadSurface(moduleId: string) {
  return ["accounts", "identities", "contexts", "badges"].includes(moduleId);
}

export function AuthorityPlaceholderPage() {
  const { surface } = useParams();
  const module = findModule(surface);
  const [readState, setReadState] = useState<LiveReadState>({
    status: "idle",
    detail: "This authority surface has not requested data yet.",
    accounts: [],
    contexts: [],
    identities: [],
    badges: [],
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
          });
          return;
        }

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
        });
      }
    }

    void load();
    return () => controller.abort();
  }, [module]);

  if (!module) {
    return <Navigate to="/authority/accounts" replace />;
  }

  const notes = surfaceNotes[module.id] ?? [];
  const isLiveSurface = isLiveReadSurface(module.id);

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
            {module.id === "accounts" ? (
              <AccountList accounts={readState.accounts} />
            ) : module.id === "identities" ? (
              <IdentityList identities={readState.identities} />
            ) : module.id === "contexts" ? (
              <ContextList contexts={readState.contexts} />
            ) : (
              <BadgeList badges={readState.badges} />
            )}
          </Panel>
        ) : null}

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

        <Panel
          eyebrow="Non-Goals"
          title="Read-First Boundary"
          description="This page is intentionally a stable home before it becomes a live read view."
        >
          <div className="empty-state">
            No mutation controls belong here yet. Phase 3 only makes authority state visible; later
            phases add controlled commands, key lifecycle, audit, and browser transport.
          </div>
        </Panel>
      </section>
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
          </div>
          <StatusPill tone="neutral" label="definition" />
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
