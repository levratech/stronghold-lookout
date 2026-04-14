import { NavLink, Outlet } from "react-router-dom";
import { lookoutEnvironment } from "../env";
import { lookoutModules } from "./module-registry";
import { useSession } from "../lib/session/SessionProvider";
import { useNats } from "../lib/nats/NatsProvider";
import { StatusPill } from "../components/ui/StatusPill";

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
    case "reconnecting":
      return "warning" as const;
    case "error":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

export function ShellLayout() {
  const { snapshot, login, logout, refresh } = useSession();
  const nats = useNats();

  const operatorSummary =
    snapshot.operator?.email ??
    snapshot.operator?.principalId ??
    (snapshot.status === "authenticated" ? "Authenticated operator" : "No resolved operator");
  const badgeSummary = snapshot.operator?.badgeIds.length
    ? `${snapshot.operator.badgeIds.length} badge(s)`
    : "No badge payload";

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

        <div className="topbar__meta">
          <div className="meta-card">
            <div className="meta-card__row">
              <span className="meta-card__label">Session</span>
              <StatusPill tone={sessionTone(snapshot.status)} label={snapshot.status} />
            </div>
            <div className="meta-card__value">{operatorSummary}</div>
            <div className="meta-card__label">{badgeSummary}</div>
          </div>

          <div className="meta-card">
            <div className="meta-card__row">
              <span className="meta-card__label">NATS Rail</span>
              <StatusPill tone={natsTone(nats.state)} label={nats.state} />
            </div>
            <div className="meta-card__value">{nats.connectedServer ?? lookoutEnvironment.natsPath}</div>
            <div className="meta-card__label">{nats.detail}</div>
          </div>

          <div className="meta-card">
            <div className="meta-card__row">
              <span className="meta-card__label">Controls</span>
              <span className="meta-card__label">Same origin</span>
            </div>
            <div className="button-row">
              <button className="button" onClick={refresh}>
                Refresh
              </button>
              <button className="button button--secondary" onClick={login}>
                Login
              </button>
              <button className="button button--danger" onClick={logout}>
                Clear Hint
              </button>
            </div>
          </div>
        </div>
      </header>

      <aside className="sidebar">
        <div className="sidebar__inner">
          <section className="sidebar__section">
            <h2 className="sidebar__heading">Shell Modules</h2>
            <nav className="sidebar__nav" aria-label="Primary">
              {lookoutModules.map((module) => (
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
                    <div className="nav-link__description">{module.description}</div>
                  </div>
                  <div className="nav-link__state">{module.status}</div>
                </NavLink>
              ))}
            </nav>
          </section>

          <section className="sidebar__section">
            <h2 className="sidebar__heading">Estate Rails</h2>
            <div className="stack">
              <div className="rail-card">
                <div className="rail-card__title">Auth</div>
                <div className="rail-card__note">
                  Same-origin flow under <code>{lookoutEnvironment.authBasePath}</code>
                </div>
              </div>
              <div className="rail-card">
                <div className="rail-card__title">Transport</div>
                <div className="rail-card__note">
                  Browser NATS over <code>{lookoutEnvironment.natsPath}</code>
                </div>
              </div>
            </div>
          </section>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
