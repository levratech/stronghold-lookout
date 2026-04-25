import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Panel } from "../../components/ui/Panel";
import { StatusPill } from "../../components/ui/StatusPill";
import { useNats } from "../../lib/nats/NatsProvider";
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
  grantPrincipalBadge,
  readAccounts,
  readAuthorityAuditEvents,
  readBadgeDefinitions,
  readBadgeGrants,
  readContexts,
  readIdentities,
  readPrincipalKeys,
  readPrincipals,
  registerPrincipalKey,
  revokePrincipalBadge,
  revokePrincipalKey,
  rotatePrincipalKey,
  updateBadgeDefinition,
  updateContext,
  type AuthorityMutationSigningOptions,
} from "../../lib/authority/authority-client";
import type {
  AccountReadModel,
  AuthorityAuditEventReadModel,
  AuthorityMutationCommand,
  AuthorityMutationResult,
  AuthorityLoadStatus,
  BadgeDefinitionReadModel,
  ContextReadModel,
  IdentityReadModel,
  PrincipalBadgeGrantReadModel,
  PrincipalKeyReadModel,
  PrincipalReadModel,
} from "../../lib/authority/authority-types";
import {
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
    "Level 3 browser command signing requires native WebCrypto Ed25519 or Lookout Desktop.",
  ],
  providers: [
    "Show Drawbridge provider posture and missing-header state.",
    "Confirm OAuth secrets and client IDs remain redacted.",
    "Defer provider mutation to controlled authority-management work.",
  ],
  transport: [
    "Show browser transport readiness separately from login state.",
    "Request only short-lived scoped credentials through the session-backed grant route.",
    "Never expose reusable NATS credentials to browser JavaScript.",
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
      contexts: ContextReadModel[];
      identities: IdentityReadModel[];
      badges: BadgeDefinitionReadModel[];
      principals: PrincipalReadModel[];
      grants: PrincipalBadgeGrantReadModel[];
      keys: PrincipalKeyReadModel[];
      auditEvents: AuthorityAuditEventReadModel[];
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
    case "audit":
      return "Authority Audit";
    default:
      return "";
  }
}

function isLiveReadSurface(moduleId: string) {
  return ["accounts", "identities", "contexts", "badges", "principals", "grants", "keys", "audit"].includes(moduleId);
}

function isMutationSurface(moduleId: string) {
  return ["accounts", "identities", "contexts", "principals", "badges", "grants", "keys"].includes(moduleId);
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

export function AuthorityPlaceholderPage() {
  const { surface } = useParams();
  const module = findModule(surface);
  const { snapshot } = useSession();
  const nats = useNats();
  const activePrincipal = snapshot.activePrincipal ?? snapshot.root;
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
    contexts: [],
    identities: [],
    badges: [],
    principals: [],
    grants: [],
    keys: [],
    auditEvents: [],
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
      contexts: [],
      identities: [],
      badges: [],
      principals: [],
      grants: [],
      keys: [],
      auditEvents: [],
    });

    async function load() {
      try {
        if (module?.id === "accounts") {
          const response = await readAccounts(controller.signal, { limit: 100 }, authorityReadTransport);
          setReadState({
            status: response.items.length ? "ready" : "empty",
            detail: response.items.length
              ? `Accounts loaded through ${authorityReadTransport ? "browser NATS" : "Sentry authority reads"}.`
              : "No accounts were returned for this session scope.",
            accounts: response.items,
            contexts: [],
            identities: [],
            badges: [],
            principals: [],
            grants: [],
            keys: [],
            auditEvents: [],
          });
          return;
        }

        if (module?.id === "identities") {
          const response = await readIdentities(controller.signal, { limit: 100 }, authorityReadTransport);
          setReadState({
            status: response.items.length ? "ready" : "empty",
            detail: response.items.length
              ? `Identities and paired principals loaded through ${authorityReadTransport ? "browser NATS" : "Sentry authority reads"}.`
              : "No identities were returned for this session scope.",
            accounts: [],
            contexts: [],
            identities: response.items,
            badges: [],
            principals: [],
            grants: [],
            keys: [],
            auditEvents: [],
          });
          return;
        }

        if (module?.id === "contexts") {
          const response = await readContexts(controller.signal, { limit: 100 }, authorityReadTransport);
          setReadState({
            status: response.items.length ? "ready" : "empty",
            detail: response.items.length
              ? `Contexts loaded through ${authorityReadTransport ? "browser NATS" : "Sentry authority reads"}.`
              : "No contexts were returned for this session scope.",
            accounts: [],
            contexts: response.items,
            identities: [],
            badges: [],
            principals: [],
            grants: [],
            keys: [],
            auditEvents: [],
          });
          return;
        }

        if (module?.id === "badges") {
          const response = await readBadgeDefinitions(controller.signal, { limit: 100 }, authorityReadTransport);
          setReadState({
            status: response.items.length ? "ready" : "empty",
            detail: response.items.length
              ? `Badge definitions loaded through ${authorityReadTransport ? "browser NATS" : "Sentry authority reads"}.`
              : "No badge definitions were returned for this session scope.",
            accounts: [],
            contexts: [],
            identities: [],
            badges: response.items,
            principals: [],
            grants: [],
            keys: [],
            auditEvents: [],
          });
          return;
        }

        if (module?.id === "principals") {
          const response = await readPrincipals(controller.signal, { limit: 100 }, authorityReadTransport);
          setReadState({
            status: response.items.length ? "ready" : "empty",
            detail: response.items.length
              ? `Principals loaded through ${authorityReadTransport ? "browser NATS" : "Sentry authority reads"}.`
              : "No principals were returned for this session scope.",
            accounts: [],
            contexts: [],
            identities: [],
            badges: [],
            principals: response.items,
            grants: [],
            keys: [],
            auditEvents: [],
          });
          return;
        }

        if (module?.id === "grants") {
          const [response, badges, principals] = await Promise.all([
            readBadgeGrants(controller.signal, { limit: 100 }, authorityReadTransport),
            readBadgeDefinitions(controller.signal, { limit: 100 }, authorityReadTransport),
            readPrincipals(controller.signal, { limit: 100 }, authorityReadTransport),
          ]);
          setReadState({
            status: response.items.length ? "ready" : "empty",
            detail: response.items.length
              ? `Badge grants loaded through ${authorityReadTransport ? "browser NATS" : "Sentry authority reads"}.`
              : "No badge grants were returned for this session scope.",
            accounts: [],
            contexts: [],
            identities: [],
            badges: badges.items,
            principals: principals.items,
            grants: response.items,
            keys: [],
            auditEvents: [],
          });
          return;
        }

        if (module?.id === "audit") {
          const response = await readAuthorityAuditEvents(controller.signal, { limit: 100 }, authorityReadTransport);
          setReadState({
            status: response.items.length ? "ready" : "empty",
            detail: response.items.length
              ? `Authority audit events loaded through ${authorityReadTransport ? "browser NATS" : "Sentry authority reads"}.`
              : "No authority audit events were returned for this session scope.",
            accounts: [],
            contexts: [],
            identities: [],
            badges: [],
            principals: [],
            grants: [],
            keys: [],
            auditEvents: response.items,
          });
          return;
        }

        const [response, principals] = await Promise.all([
          readPrincipalKeys(controller.signal, { limit: 100 }, authorityReadTransport),
          readPrincipals(controller.signal, { limit: 100 }, authorityReadTransport),
        ]);
        setReadState({
          status: response.items.length ? "ready" : "empty",
          detail: response.items.length
            ? `Principal key posture loaded through ${authorityReadTransport ? "browser NATS" : "Sentry authority reads"}.`
            : "No principal keys were returned for this session scope.",
          accounts: [],
          contexts: [],
          identities: [],
          badges: [],
          principals: principals.items,
          grants: [],
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
          contexts: [],
          identities: [],
          badges: [],
          principals: [],
          grants: [],
          keys: [],
          auditEvents: [],
        });
      }
    }

    void load();
    return () => controller.abort();
  }, [module, refreshNonce, authorityReadTransport]);

  useEffect(() => {
    if (!module || !isMutationSurface(module.id)) {
      setCommandSigningState({
        status: "idle",
        detail: "Command-signing posture is checked on authority mutation surfaces.",
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

  const notes = surfaceNotes[module.id] ?? [];
  const isLiveSurface = isLiveReadSurface(module.id);
  const signingOptions =
    commandSigningState.posture?.status === "ready" && activePrincipal?.principalId
      ? {
          principalId: activePrincipal.principalId,
          identityId: activePrincipal.identityId,
          keyId: commandSigningState.posture.keyId,
        }
      : undefined;

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
            ) : module.id === "audit" ? (
              <AuditList events={readState.auditEvents} />
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
              <div className="kv__label">Grant Discovery</div>
              <div className="kv__value">{snapshot.transport.grantReady ? "available" : "unavailable"}</div>
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

        <Panel
          eyebrow="Non-Goals"
          title="Authority Boundary"
          description="Controls stay limited to the Sentry-backed read and mutation surfaces that already exist."
        >
          <div className="empty-state">
            Lookout can inspect audit evidence and submit controlled account, identity, context,
            badge, grant, and key mutations. Browser transport activation, key recovery, and broader
            mutation auditing still need their own work orders.
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
    const form = new FormData(event.currentTarget);
    onState({ status: "submitting", detail: "Submitting controlled authority mutation through Sentry." });
    try {
      const result = await submitAuthorityMutation(moduleId, form, signingOptions);
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
        ) : moduleId === "keys" ? (
          <KeyMutationFields keys={readState.keys} principals={readState.principals} />
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
  if (moduleId === "identities") {
    const command: AuthorityMutationCommand = "identity.create";
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
    const payload = {
      principal_id: textValue(form, "principal_id"),
      badge_id: textValue(form, "badge_id"),
      context_id: textValue(form, "context_id"),
      permission: textValue(form, "permission"),
      reason: optionalTextValue(form, "reason"),
    };
    const command = textValue(form, "grant_command") as AuthorityMutationCommand;
    return command === "principal_badge.revoke"
      ? revokePrincipalBadge(payload, signingFor(command, signingOptions))
      : grantPrincipalBadge(payload, signingFor("principal_badge.grant", signingOptions));
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
            <div className="list-item__body">
              sentry binding:{key.issuer_signature_present ? "present" : "missing"}
            </div>
          </div>
          <StatusPill tone={key.revoked_at || key.status !== "active" ? "warning" : "success"} label={key.status || "unknown"} />
        </div>
      ))}
    </div>
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
