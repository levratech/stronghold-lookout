# Lookout Web Cockpit: Implementation Notes

## What Was Built

- A new `web/` boundary inside `stronghold-lookout` using React, TypeScript, and Vite.
- A shell-first cockpit with top bar, workspace-focused left navigation, and module mounting.
- The left navigation prioritizes Dashboard, the user's personal Home context, account-linked top-level contexts, compact management entries for Contexts, Identities, Badges, Grants, and Services, a Security section for Keys/Transport/Audit, and a collapsed Debug section for cockpit diagnostics.
- Static module registration for Overview, Sentry, Aegis, and authority cockpit surfaces.
- A session provider centered on same-origin auth behavior under `/_/auth`.
- A shared NATS WebSocket provider centered on `/_/nats`.
- Read-first Overview, Sentry, Aegis, authority graph, badge, key, and audit surfaces with clear state handling.
- Foundation truth panels for transport grant source, credential expiry,
  permission-envelope counts, last observed denied rail action, authority read
  rail, command-signer custody, and memory-only replay posture.
- A browser-side NATS permission probe that uses the live WebSocket rail to
  verify allowed principal inbox/outbox subjects and denied out-of-scope
  subjects without treating expected denials as transport failure.

## What Is Real Now

- Same-origin auth flow shape under `/_/auth` matches the existing Drawbridge behavior.
- `/_/auth/session` exposes operator identity, root/active principal posture, context, badge summary, and transport readiness metadata without exposing the HttpOnly cookie value.
- The shell listens for Drawbridge auth completion via `postMessage`.
- The NATS client is real, but it only attempts a browser connection when session
  bootstrap reports `transport.ready=true` and the Sentry grant response returns
  a native scoped credential.
- The NATS provider keeps the Sentry transport grant token in memory only and
  exposes grant posture metadata for the cockpit without treating transport
  admission as command authorship.
- The Overview transport panel can run an in-tab allow/deny permission probe
  against the active browser NATS connection and keeps expected permission
  denials visible as denied actions rather than broken transport.
- The shell, layout, module boundaries, authority reads, controlled mutations, and shared providers are production-shaped.
- The Authority Keys surface can create a browser-local non-exportable WebCrypto
  Ed25519 command-signing key for the active principal, store it in IndexedDB,
  register only the rawurl-base64 public key with Sentry, select the matching
  active key record, and run a local signing smoke check.
- Controlled authority mutations attach Level 3 command-auth signatures for the
  enforced sensitive set: context create/update/archive, principal badge
  grant/revoke, context service provisioning, and principal key revoke/rotate.
- The Contexts manager uses soft archive semantics rather than hard delete.
  Organization contexts can be archived from detail when they have no visible
  child contexts; personal and system contexts stay protected.

## What Is Placeholder Or Pending Backend Support

- Browser transport can request and use a Sentry-minted delegated-principal NATS
  credential, but deployment still depends on native credential configuration,
  the NATS WebSocket rail accepting that credential, and negative subject-policy
  tests staying green.
- Browser command-signing keys can be generated and registered, and verified
  command-auth enforcement is live for context lifecycle, badge grant/revoke,
  context-service provision, and key revoke/rotate. Broader mutation coverage is
  still deliberate follow-up work.
- No browser-safe Aegis read surface currently exposes interfaces, routes, or live config state.
- The tracked JSON files in this repo are not used as live estate truth.

## Backend Surfaces Needed Next

1. Keep staging and live smoke evidence current for the Sentry-minted delegated-principal NATS credential model; do not reuse the static bootstrap NATS token for browser, CLI, desktop, service, node, or agent actors.
2. Expand Level 3 signed command-envelope coverage beyond badge grant/revoke and key revoke/rotate as each sensitive mutation family gets tests and recovery posture.
3. Add explicit Aegis read adapters for interface listing, route inspection, access requirements, and live config provenance/status.
4. Promote command-envelope replay protection from memory-only verifier state to durable cross-instance replay storage before lower-trust clients depend on it.

## Level 3 Browser Crypto Rule

Level 3 Stronghold Web actions require native WebCrypto Ed25519. Lookout Web
should block Level 3 signing setup when `crypto.subtle` cannot generate/import
Ed25519 keys. Unsupported browsers should be directed to Lookout Desktop; the web
cockpit should not add P-256, polyfill, or legacy-browser fallback signing modes.
