import { MetricCard } from "../../components/ui/MetricCard";
import { Panel } from "../../components/ui/Panel";
import { StatusPill } from "../../components/ui/StatusPill";
import { lookoutModules } from "../../shell/module-registry";
import { useSession } from "../../lib/session/SessionProvider";
import { useNats } from "../../lib/nats/NatsProvider";

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

export function OverviewPage() {
  const { snapshot } = useSession();
  const nats = useNats();

  const operator = snapshot.operator;

  return (
    <div className="page">
      <header className="page__header">
        <div className="page__title-block">
          <div className="panel__eyebrow">Overview</div>
          <h1 className="page__title">Estate Control Surface</h1>
          <p className="page__summary">
            Read-first shell state for authentication, operator identity, transport health,
            and the visible module deck. This page stays honest about what the current
            backend actually exposes.
          </p>
        </div>
      </header>

      <section className="grid grid--metrics">
        <MetricCard
          eyebrow="Authentication"
          value={snapshot.status}
          detail={snapshot.detail}
          status={<StatusPill tone={sessionTone(snapshot.status)} label={snapshot.source} />}
        />
        <MetricCard
          eyebrow="Operator"
          value={operator?.email ?? operator?.principalId ?? "Not resolved"}
          detail="Current operator identity, when exposed by the auth bootstrap."
        />
        <MetricCard
          eyebrow="NATS WebSocket"
          value={nats.state}
          detail={nats.detail}
          status={<StatusPill tone={natsTone(nats.state)} label={nats.connectedServer ?? "same-origin"} />}
        />
        <MetricCard
          eyebrow="Modules"
          value={`${lookoutModules.length} surfaces`}
          detail="Overview, Sentry, and Aegis are mounted through a static module registry."
        />
      </section>

      <section className="grid grid--panels">
        <Panel
          eyebrow="Session Snapshot"
          title="Operator Identity"
          description="The shell treats session state as a first-class concern and reports only what is truly available."
          actions={<StatusPill tone={sessionTone(snapshot.status)} label={snapshot.status} />}
        >
          <div className="kv-grid">
            <div className="kv">
              <div className="kv__label">Principal</div>
              <div className="kv__value">{operator?.principalId ?? "Unavailable"}</div>
            </div>
            <div className="kv">
              <div className="kv__label">Email</div>
              <div className="kv__value">{operator?.email ?? "Unavailable"}</div>
            </div>
            <div className="kv">
              <div className="kv__label">Domain</div>
              <div className="kv__value">{operator?.domainId ?? "Unavailable"}</div>
            </div>
            <div className="kv">
              <div className="kv__label">Context</div>
              <div className="kv__value">{operator?.contextId ?? "Unavailable"}</div>
            </div>
            <div className="kv">
              <div className="kv__label">Realm</div>
              <div className="kv__value">{operator?.realmId ?? "Unavailable"}</div>
            </div>
            <div className="kv">
              <div className="kv__label">Session Validity</div>
              <div className="kv__value">{snapshot.validUntil ?? "No validity payload exposed"}</div>
            </div>
          </div>

          <div>
            <div className="kv__label">Badges / Roles</div>
            {operator?.badgeIds.length || operator?.roles.length ? (
              <div className="tag-row">
                {operator.badgeIds.map((badge) => (
                  <span className="tag" key={badge}>
                    badge:{badge}
                  </span>
                ))}
                {operator.roles.map((role) => (
                  <span className="tag" key={role}>
                    role:{role}
                  </span>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                No badge or role payload is currently exposed to the browser shell.
              </div>
            )}
          </div>
        </Panel>

        <Panel
          eyebrow="Control Rails"
          title="Browser Transport State"
          description="The shell centers the browser on same-origin auth and NATS rather than ad hoc page-specific endpoints."
          actions={<StatusPill tone={natsTone(nats.state)} label={nats.state} />}
        >
          <div className="kv-grid">
            <div className="kv">
              <div className="kv__label">NATS Endpoint</div>
              <div className="kv__value">
                <code>{nats.serverURL}</code>
              </div>
            </div>
            <div className="kv">
              <div className="kv__label">Connected Server</div>
              <div className="kv__value">{nats.connectedServer ?? "Not connected"}</div>
            </div>
            <div className="kv">
              <div className="kv__label">Reconnect Count</div>
              <div className="kv__value">{String(nats.reconnects)}</div>
            </div>
            <div className="kv">
              <div className="kv__label">Last Error</div>
              <div className="kv__value">{nats.lastError ?? "None reported"}</div>
            </div>
          </div>
        </Panel>
      </section>

      <section className="grid grid--panels">
        <Panel
          eyebrow="Modules"
          title="Mounted Surfaces"
          description="Static module registration keeps the shell Electron-friendly later without inventing runtime plugin machinery now."
        >
          <div className="list">
            {lookoutModules.map((module) => (
              <div className="list-item" key={module.id}>
                <div>
                  <div className="list-item__title">{module.name}</div>
                  <div className="list-item__body">{module.summary}</div>
                </div>
                <StatusPill
                  tone={module.status === "available" ? "success" : "warning"}
                  label={module.status}
                />
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          eyebrow="Core Surfaces"
          title="What Is Real Right Now"
          description="The first cockpit favors structural correctness over pretending the backend is further along than it is."
        >
          <div className="list">
            <div className="list-item">
              <div>
                <div className="list-item__title">Real</div>
                <div className="list-item__body">
                  Same-origin auth handoff under <code>/_/auth</code>, browser shell layout,
                  module registry, and NATS WebSocket client boundary for <code>/_/nats</code>.
                </div>
              </div>
            </div>
            <div className="list-item">
              <div>
                <div className="list-item__title">Missing Backend Surface</div>
                <div className="list-item__body">
                  No session bootstrap endpoint currently exposes operator identity to the web
                  shell, and no browser-safe Aegis or Sentry read subjects are surfaced yet.
                </div>
              </div>
            </div>
          </div>
        </Panel>
      </section>
    </div>
  );
}
