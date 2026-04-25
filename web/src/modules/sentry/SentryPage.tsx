import { useEffect, useState } from "react";
import { Panel } from "../../components/ui/Panel";
import { StatusPill } from "../../components/ui/StatusPill";
import { lookoutEnvironment } from "../../env";
import { buildSentrySections } from "../../lib/domain/sentry";
import { useSession } from "../../lib/session/SessionProvider";

interface AuthProviderPosture {
  provider_id: string;
  provider: string;
  context_id?: string;
  interface?: string;
  configured: boolean;
  redacted: boolean;
  status: string;
  missing_headers?: string[];
}

type ProviderLoadState =
  | { status: "loading"; providers: AuthProviderPosture[]; detail: string }
  | { status: "ready"; providers: AuthProviderPosture[]; detail: string }
  | { status: "error"; providers: AuthProviderPosture[]; detail: string };

export function SentryPage() {
  const { snapshot } = useSession();
  const sections = buildSentrySections(snapshot);
  const [providerState, setProviderState] = useState<ProviderLoadState>({
    status: "loading",
    providers: [],
    detail: "Checking same-origin auth provider posture.",
  });

  useEffect(() => {
    const controller = new AbortController();

    async function loadProviders() {
      try {
        const response = await fetch(lookoutEnvironment.authProvidersPath, {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Provider posture returned ${response.status}.`);
        }
        const payload = (await response.json()) as { auth_providers?: unknown };
        const providers = Array.isArray(payload.auth_providers)
          ? payload.auth_providers.filter(
              (provider): provider is AuthProviderPosture =>
                typeof provider === "object" &&
                provider !== null &&
                typeof (provider as AuthProviderPosture).provider_id === "string",
            )
          : [];
        setProviderState({
          status: "ready",
          providers,
          detail: "Provider posture loaded through the same-origin Drawbridge rail.",
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const detail =
          error instanceof Error
            ? error.message
            : "Unknown provider posture failure.";
        setProviderState({
          status: "error",
          providers: [],
          detail,
        });
      }
    }

    void loadProviders();
    return () => controller.abort();
  }, []);

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
              tone={snapshot.activePrincipal ? "success" : "warning"}
              label={snapshot.activePrincipal ? "resolved" : "pending"}
            />
          }
        >
          <div className="kv-grid">
            <div className="kv">
              <div className="kv__label">Root Principal</div>
              <div className="kv__value">{snapshot.root?.principalId ?? "Unavailable"}</div>
            </div>
            <div className="kv">
              <div className="kv__label">Active Principal</div>
              <div className="kv__value">
                {snapshot.activePrincipal?.principalId ?? "Unavailable"}
              </div>
            </div>
            <div className="kv">
              <div className="kv__label">Active Type</div>
              <div className="kv__value">
                {snapshot.activePrincipal?.principalType ?? "Unavailable"}
              </div>
            </div>
            <div className="kv">
              <div className="kv__label">Domain</div>
              <div className="kv__value">
                {snapshot.activePrincipal?.domainId ?? snapshot.root?.domainId ?? "Unavailable"}
              </div>
            </div>
            <div className="kv">
              <div className="kv__label">Context</div>
              <div className="kv__value">
                {snapshot.activePrincipal?.contextId ?? snapshot.root?.contextId ?? "Unavailable"}
              </div>
            </div>
            <div className="kv">
              <div className="kv__label">Badges</div>
              <div className="kv__value">
                {snapshot.activePrincipal?.badgeIds.length
                  ? snapshot.activePrincipal.badgeIds.join(", ")
                  : "No badge payload"}
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          eyebrow="Auth Providers"
          title="Provider Posture"
          description="Read-only provider configuration status from Drawbridge. Secret-bearing values stay redacted."
          actions={
            <StatusPill
              tone={providerState.status === "ready" ? "success" : "warning"}
              label={providerState.status}
            />
          }
        >
          <div className="list">
            {providerState.providers.length ? (
              providerState.providers.map((provider) => (
                <div className="list-item" key={provider.provider_id}>
                  <div>
                    <div className="list-item__title">{provider.provider}</div>
                    <div className="list-item__body">
                      {provider.interface ?? "unknown interface"} ·{" "}
                      {provider.context_id ?? "unknown context"} · {provider.status}
                    </div>
                  </div>
                  <StatusPill
                    tone={provider.configured ? "success" : "warning"}
                    label={provider.redacted ? "redacted" : "check payload"}
                  />
                </div>
              ))
            ) : (
              <div className="empty-state">{providerState.detail}</div>
            )}
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
