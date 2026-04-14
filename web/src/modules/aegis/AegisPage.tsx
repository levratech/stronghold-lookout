import { Panel } from "../../components/ui/Panel";
import { StatusPill } from "../../components/ui/StatusPill";
import { buildAegisSections, getAvailableSurfaceCount } from "../../lib/domain/aegis";
import { useNats } from "../../lib/nats/NatsProvider";

export function AegisPage() {
  const nats = useNats();
  const sections = buildAegisSections(nats);

  return (
    <div className="page">
      <header className="page__header">
        <div className="page__title-block">
          <div className="panel__eyebrow">Aegis</div>
          <h1 className="page__title">Edge Visibility Surface</h1>
          <p className="page__summary">
            This module is shaped for interface, route, access-requirement, and config
            visibility work. It treats tracked Lookout JSON as templates only and reserves
            live truth for the estate runtime.
          </p>
        </div>
      </header>

      <section className="grid grid--panels">
        <Panel
          eyebrow="Edge Posture"
          title="Control Rail Status"
          description="The web shell is ready to inspect edge state through same-origin transport as soon as the estate exports it."
          actions={
            <StatusPill
              tone={nats.state === "connected" ? "success" : "warning"}
              label={nats.state}
            />
          }
        >
          <div className="kv-grid">
            <div className="kv">
              <div className="kv__label">Transport</div>
              <div className="kv__value">{nats.detail}</div>
            </div>
            <div className="kv">
              <div className="kv__label">Connected Server</div>
              <div className="kv__value">{nats.connectedServer ?? "Unavailable"}</div>
            </div>
            <div className="kv">
              <div className="kv__label">Surface Count</div>
              <div className="kv__value">{String(getAvailableSurfaceCount())}</div>
            </div>
            <div className="kv">
              <div className="kv__label">Last Error</div>
              <div className="kv__value">{nats.lastError ?? "None reported"}</div>
            </div>
          </div>
        </Panel>

        <Panel
          eyebrow="Truth Boundary"
          title="Config Provenance"
          description="The cockpit keeps estate truth separate from repository templates."
        >
          <div className="list">
            <div className="list-item">
              <div>
                <div className="list-item__title">Live estate truth</div>
                <div className="list-item__body">
                  Should arrive from Aegis and Sentry runtime surfaces over NATS or bootstrap
                  glue, not from tracked JSON committed to this repository.
                </div>
              </div>
            </div>
            <div className="list-item">
              <div>
                <div className="list-item__title">Tracked Lookout JSON</div>
                <div className="list-item__body">
                  Templates and examples only. The module says so directly instead of
                  presenting them as current route or key state.
                </div>
              </div>
            </div>
          </div>
        </Panel>
      </section>

      <section className="grid grid--panels">
        {sections.map((section) => (
          <section className="section-card" key={section.key}>
            <div className="section-card__header">
              <div>
                <div className="section-card__eyebrow">Edge Slice</div>
                <h2 className="section-card__title">{section.title}</h2>
                <div className="section-card__description">{section.summary}</div>
              </div>
              <StatusPill
                tone={section.status === "live" ? "success" : "warning"}
                label={section.status}
              />
            </div>
            <div className="section-card__body">
              <div className="muted">{section.detail}</div>
            </div>
          </section>
        ))}
      </section>
    </div>
  );
}
