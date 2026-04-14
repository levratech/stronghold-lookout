import { Panel } from "../../components/ui/Panel";
import { StatusPill } from "../../components/ui/StatusPill";
import { buildSentrySections } from "../../lib/domain/sentry";
import { useSession } from "../../lib/session/SessionProvider";

export function SentryPage() {
  const { snapshot } = useSession();
  const sections = buildSentrySections(snapshot);

  return (
    <div className="page">
      <header className="page__header">
        <div className="page__title-block">
          <div className="panel__eyebrow">Sentry</div>
          <h1 className="page__title">Authority Surface</h1>
          <p className="page__summary">
            This is the first browser-facing authority module for users, badges,
            assignments, and session identity detail. It is intentionally shaped for the
            real work that comes next without faking mature badge administration now.
          </p>
        </div>
      </header>

      <section className="grid grid--panels">
        <Panel
          eyebrow="Session Context"
          title="Current Operator"
          description="Authority details already visible to the shell."
          actions={
            <StatusPill
              tone={snapshot.operator ? "success" : "warning"}
              label={snapshot.operator ? "resolved" : "pending"}
            />
          }
        >
          <div className="kv-grid">
            <div className="kv">
              <div className="kv__label">Principal</div>
              <div className="kv__value">{snapshot.operator?.principalId ?? "Unavailable"}</div>
            </div>
            <div className="kv">
              <div className="kv__label">Domain</div>
              <div className="kv__value">{snapshot.operator?.domainId ?? "Unavailable"}</div>
            </div>
            <div className="kv">
              <div className="kv__label">Context</div>
              <div className="kv__value">{snapshot.operator?.contextId ?? "Unavailable"}</div>
            </div>
            <div className="kv">
              <div className="kv__label">Badges</div>
              <div className="kv__value">
                {snapshot.operator?.badgeIds.length
                  ? snapshot.operator.badgeIds.join(", ")
                  : "No badge payload"}
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          eyebrow="Adapter Boundary"
          title="Authority Work Queue"
          description="The module is prepared for user, badge, and assignment reads once Sentry exposes them intentionally to the browser."
        >
          <div className="list">
            <div className="list-item">
              <div>
                <div className="list-item__title">Next read surfaces</div>
                <div className="list-item__body">
                  User listing, badge listing, user detail, and assignment inspection should
                  arrive as explicit authority adapters rather than ad hoc REST fragments.
                </div>
              </div>
            </div>
            <div className="list-item">
              <div>
                <div className="list-item__title">Future write surfaces</div>
                <div className="list-item__body">
                  Badge assignment and removal should follow only after read models and
                  operator capability checks are in place.
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
                <div className="section-card__eyebrow">Authority Slice</div>
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
