import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { lookoutEnvironment } from "../env";
import { lookoutModules, type LookoutModuleDefinition, type LookoutModuleId } from "./module-registry";
import { useSession } from "../lib/session/SessionProvider";
import { useNats } from "../lib/nats/NatsProvider";
import { StatusPill } from "../components/ui/StatusPill";
import { readContexts, readIdentities } from "../lib/authority/authority-client";
import type { ContextReadModel } from "../lib/authority/authority-types";

const manageModuleIds: LookoutModuleId[] = ["contexts", "identities", "badges", "grants", "services"];

interface WorkspaceContextState {
  status: "idle" | "loading" | "ready" | "error";
  detail: string;
  personalContext?: ContextReadModel;
  topLevelContexts: ContextReadModel[];
}

function isLookoutModule(module: LookoutModuleDefinition | undefined): module is LookoutModuleDefinition {
  return Boolean(module);
}

function sessionTone(status: string) {
  switch (status) {
    case "authenticated":
      return "success" as const;
    case "authenticating":
    case "degraded":
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

export function ShellLayout() {
  const { snapshot, login, logout, refresh } = useSession();
  const nats = useNats();
  const location = useLocation();
  const activePrincipal = snapshot.activePrincipal;
  const root = snapshot.root;
  const currentModule =
    lookoutModules
      .filter((module) => module.route !== "/" && location.pathname.startsWith(module.route))
      .sort((a, b) => b.route.length - a.route.length)[0] ??
    lookoutModules.find((module) => module.route === "/");
  const moduleById = new Map(lookoutModules.map((module) => [module.id, module]));
  const manageModules = manageModuleIds.map((moduleId) => moduleById.get(moduleId)).filter(isLookoutModule);
  const activeAccountId = activePrincipal?.accountId ?? snapshot.account?.accountId ?? root?.accountId ?? "";
  const [workspaceContexts, setWorkspaceContexts] = useState<WorkspaceContextState>({
    status: "idle",
    detail: "Context rail has not loaded yet.",
    topLevelContexts: [],
  });

  useEffect(() => {
    if (snapshot.status !== "authenticated" || !activeAccountId) {
      setWorkspaceContexts({
        status: "idle",
        detail: "Login to see your home context and accessible spaces.",
        topLevelContexts: [],
      });
      return;
    }

    const controller = new AbortController();
    setWorkspaceContexts({
      status: "loading",
      detail: "Loading your contexts.",
      topLevelContexts: [],
    });

    async function loadWorkspaceContexts() {
      try {
        const identities = await readIdentities(controller.signal, {
          account_id: activeAccountId,
          limit: 100,
        });
        const identityIds = new Set(identities.items.map((identity) => identity.id));
        const contextIds = [...new Set(identities.items.map((identity) => identity.context_id).filter(Boolean))];
        const contextResponses = await Promise.all(
          contextIds.map((contextId) =>
            readContexts(controller.signal, {
              context_id: contextId,
              limit: 100,
            }),
          ),
        );
        if (controller.signal.aborted) {
          return;
        }
        const contextsById = new Map<string, ContextReadModel>();
        contextResponses.flatMap((response) => response.items).forEach((context) => {
          contextsById.set(context.id, context);
        });
        const contexts = [...contextsById.values()].sort(compareContexts);
        const personalContext =
          contexts.find(
            (context) =>
              context.kind === "personal" &&
              (!context.owner_identity_id || identityIds.has(context.owner_identity_id)),
          ) ?? contexts.find((context) => context.kind === "personal");
        const topLevelContexts = contexts.filter(
          (context) => !context.parent_id && context.id !== personalContext?.id && context.kind !== "personal",
        );
        setWorkspaceContexts({
          status: "ready",
          detail: contextIds.length
            ? "Loaded contexts tied to your account identities."
            : "No context identities are visible for this account yet.",
          personalContext,
          topLevelContexts,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setWorkspaceContexts({
          status: "error",
          detail: error instanceof Error ? error.message : "Unable to load workspace contexts.",
          topLevelContexts: [],
        });
      }
    }

    void loadWorkspaceContexts();
    return () => controller.abort();
  }, [activeAccountId, snapshot.status]);

  const operatorSummary =
    activePrincipal?.email ??
    activePrincipal?.principalId ??
    root?.email ??
    root?.principalId ??
    (snapshot.status === "authenticated" ? "Authenticated session" : "No resolved session");
  const badgeSummary = activePrincipal?.badgeIds.length
    ? `${activePrincipal.badgeIds.length} badge(s)`
    : "No badge payload";
  const operatorInitials = operatorSummary
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "LO";

  return (
    <div className="lookout-shell">
      <header className="topbar">
        <div className="topbar__identity">
          <div className="topbar__crest">LO</div>
          <div className="topbar__title">
            <div className="topbar__eyebrow">{lookoutEnvironment.estateName}</div>
            <div className="topbar__name">{lookoutEnvironment.cockpitName}</div>
            <div className="topbar__subtitle">
              Same-origin operator cockpit for Sentry authority and Aegis edge visibility.
            </div>
          </div>
        </div>

        <div className="topbar__actions">
          <div className="topbar__current">
            <span className="topbar__current-label">{currentModule?.surfaceLabel ?? "Surface"}</span>
            <span className="topbar__current-name">{currentModule?.name ?? "Lookout"}</span>
          </div>

          <details className="operator-menu">
            <summary className="operator-menu__trigger" aria-label="Session and connection menu">
              <span className="operator-menu__avatar">{operatorInitials}</span>
              <span className={`operator-menu__rail operator-menu__rail--${natsTone(nats.state)}`} />
            </summary>
            <div className="operator-menu__panel">
              <div className="operator-menu__section">
                <div className="operator-menu__row">
                  <span>Session</span>
                  <StatusPill tone={sessionTone(snapshot.status)} label={snapshot.status} />
                </div>
                <div className="operator-menu__primary">{operatorSummary}</div>
                <div className="operator-menu__muted">
                  {root?.principalId && activePrincipal?.principalId && root.principalId !== activePrincipal.principalId
                    ? `Root ${root.principalId} -> active ${activePrincipal.principalId}`
                    : badgeSummary}
                </div>
              </div>

              <div className="operator-menu__section">
                <div className="operator-menu__row">
                  <span>NATS rail</span>
                  <StatusPill tone={natsTone(nats.state)} label={nats.state} />
                </div>
                <div className="operator-menu__primary">{nats.connectedServer ?? lookoutEnvironment.natsPath}</div>
                <div className="operator-menu__muted">{nats.detail}</div>
              </div>

              <div className="operator-menu__actions">
                <button className="button" onClick={refresh}>
                  Refresh
                </button>
                <button className="button button--secondary" onClick={login}>
                  Login
                </button>
                <button className="button button--danger" onClick={logout}>
                  Logout
                </button>
              </div>
            </div>
          </details>
        </div>
      </header>

      <aside className="sidebar">
        <div className="sidebar__inner">
          <section className="sidebar__section">
            <h2 className="sidebar__heading">Lookout</h2>
            <nav className="sidebar__nav" aria-label="Primary">
              <NavLink
                to="/"
                end
                className={({ isActive }) => `nav-link nav-link--dashboard${isActive ? " nav-link--active" : ""}`}
              >
                <div className="nav-link__icon">DB</div>
                <div className="nav-link__text">
                  <div className="nav-link__title">Dashboard</div>
                </div>
              </NavLink>

              <div className="workspace-nav">
                <div className="workspace-nav__label">Personal</div>
                {workspaceContexts.personalContext ? (
                  <NavLink
                    to={contextRoute(workspaceContexts.personalContext.id)}
                    className={({ isActive }) => `nav-link nav-link--home${isActive ? " nav-link--active" : ""}`}
                  >
                    <div className="nav-link__icon nav-link__icon--home">
                      <HomeIcon />
                    </div>
                    <div className="nav-link__text">
                      <div className="nav-link__title">Home</div>
                      <div className="nav-link__description">{workspaceContexts.personalContext.name}</div>
                    </div>
                  </NavLink>
                ) : (
                  <div className={`workspace-nav__empty workspace-nav__empty--${workspaceContexts.status}`}>
                    {workspaceContexts.status === "loading" ? "Loading Home..." : "Home context not visible yet."}
                  </div>
                )}
              </div>

              <div className="workspace-nav">
                <div className="workspace-nav__label">Contexts</div>
                {workspaceContexts.topLevelContexts.length ? (
                  <div className="workspace-nav__contexts">
                    {workspaceContexts.topLevelContexts.map((context) => (
                      <NavLink
                        key={context.id}
                        to={contextRoute(context.id)}
                        className={({ isActive }) => `nav-link nav-link--context${isActive ? " nav-link--active" : ""}`}
                      >
                        <div className="nav-link__icon">{contextInitials(context)}</div>
                        <div className="nav-link__text">
                          <div className="nav-link__title">{context.name || "Untitled context"}</div>
                          <div className="nav-link__description">
                            {context.child_count ? `${context.child_count} sub-contexts` : "Top-level context"}
                          </div>
                        </div>
                      </NavLink>
                    ))}
                  </div>
                ) : (
                  <div className={`workspace-nav__empty workspace-nav__empty--${workspaceContexts.status}`}>
                    {workspaceContexts.status === "loading"
                      ? "Loading contexts..."
                      : workspaceContexts.status === "error"
                        ? "Unable to load contexts."
                        : "No top-level contexts visible."}
                  </div>
                )}
              </div>

              <div className="workspace-nav workspace-nav--manage">
                <div className="workspace-nav__label">Manage</div>
                <div className="workspace-nav__manage">
                  {manageModules.map((module) => (
                    <NavLink
                      key={module.id}
                      to={module.route}
                      className={({ isActive }) => `nav-link nav-link--compact${isActive ? " nav-link--active" : ""}`}
                    >
                      <div className="nav-link__icon">{module.icon}</div>
                      <div className="nav-link__text">
                        <div className="nav-link__title">{module.navLabel}</div>
                      </div>
                    </NavLink>
                  ))}
                </div>
              </div>
            </nav>
          </section>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

function contextRoute(contextId: string) {
  return `/authority/contexts?context_id=${encodeURIComponent(contextId)}`;
}

function contextInitials(context: ContextReadModel) {
  const label = context.name || context.id;
  const initials = label
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "CX";
}

function compareContexts(left: ContextReadModel, right: ContextReadModel) {
  const depthDelta = (left.depth ?? 0) - (right.depth ?? 0);
  if (depthDelta !== 0) {
    return depthDelta;
  }
  return (left.name || left.id).localeCompare(right.name || right.id);
}

function HomeIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path
        d="M4.75 10.75 12 4.5l7.25 6.25v7.75a1 1 0 0 1-1 1h-4.1v-5.6h-4.3v5.6h-4.1a1 1 0 0 1-1-1v-7.75Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
