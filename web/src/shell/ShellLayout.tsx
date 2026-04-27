import { NavLink, Outlet, useLocation } from "react-router-dom";
import { lookoutEnvironment } from "../env";
import { lookoutModules, type LookoutModuleDefinition, type LookoutModuleId } from "./module-registry";
import { useSession } from "../lib/session/SessionProvider";
import { useNats } from "../lib/nats/NatsProvider";
import { StatusPill } from "../components/ui/StatusPill";

interface NavigationSection {
  label: string;
  moduleIds: LookoutModuleId[];
  defaultOpen?: boolean;
}

const navigationSections: NavigationSection[] = [
  {
    label: "Home",
    moduleIds: ["dashboard"],
    defaultOpen: true,
  },
  {
    label: "Manage",
    moduleIds: ["contexts", "identities", "badges", "grants", "services"],
    defaultOpen: true,
  },
  {
    label: "Security",
    moduleIds: ["accounts", "auth-methods", "principals", "keys"],
  },
  {
    label: "Operations",
    moduleIds: ["transport", "audit"],
  },
  {
    label: "Debug",
    moduleIds: ["overview", "aegis", "resource-interface"],
  },
];

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
              {navigationSections.map((section) => {
                const modules = section.moduleIds
                  .map((moduleId) => moduleById.get(moduleId))
                  .filter(isLookoutModule);
                const isActiveSection = modules.some((module) => module?.id === currentModule?.id);
                return (
                  <details
                    className="nav-section"
                    open={section.defaultOpen || isActiveSection}
                    key={section.label}
                  >
                    <summary className="nav-section__summary">
                      <span>{section.label}</span>
                      <span className="nav-section__count">{modules.length}</span>
                    </summary>
                    <div className="nav-section__links">
                      {modules.map((module) => (
                        <NavLink
                          key={module.id}
                          to={module.route}
                          end={module.route === "/"}
                          className={({ isActive }) =>
                            `nav-link${isActive ? " nav-link--active" : ""}`
                          }
                        >
                          <div className="nav-link__icon">{module.icon}</div>
                          <div className="nav-link__text">
                            <div className="nav-link__title">{module.navLabel}</div>
                          </div>
                        </NavLink>
                      ))}
                    </div>
                  </details>
                );
              })}
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
