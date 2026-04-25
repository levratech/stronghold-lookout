# Lookout Web Cockpit: Implementation Notes

## What Was Built

- A new `web/` boundary inside `stronghold-lookout` using React, TypeScript, and Vite.
- A shell-first cockpit with top bar, left navigation, and module mounting.
- Static module registration for Overview, Sentry, Aegis, and authority cockpit surfaces.
- A session provider centered on same-origin auth behavior under `/_/auth`.
- A shared NATS WebSocket provider centered on `/_/nats`.
- Read-first Overview, Sentry, Aegis, authority graph, badge, key, and audit surfaces with clear state handling.

## What Is Real Now

- Same-origin auth flow shape under `/_/auth` matches the existing Drawbridge behavior.
- `/_/auth/session` exposes operator identity, root/active principal posture, context, badge summary, and transport readiness metadata without exposing the HttpOnly cookie value.
- The shell listens for Drawbridge auth completion via `postMessage`.
- The NATS client is real, but it only attempts a browser connection when session bootstrap reports `transport.ready=true`.
- The shell, layout, module boundaries, authority reads, controlled mutations, and shared providers are production-shaped.
- The Authority Keys surface can create a browser-local non-exportable WebCrypto
  Ed25519 command-signing key for the active principal, store it in IndexedDB,
  register only the rawurl-base64 public key with Sentry, select the matching
  active key record, and run a local signing smoke check.

## What Is Placeholder Or Pending Backend Support

- Browser transport can request a Sentry-minted delegated-principal NATS credential, but live connection still depends on native credential configuration and the NATS WebSocket rail accepting that credential.
- Browser command-signing keys can be generated and registered, but verified
  envelope enforcement for sensitive mutations remains a Stronghold BTR-04
  backend follow-up.
- No browser-safe Aegis read surface currently exposes interfaces, routes, or live config state.
- The tracked JSON files in this repo are not used as live estate truth.

## Backend Surfaces Needed Next

1. Prove the Sentry-minted delegated-principal NATS credential model end to end against the live `/_/nats` rail; do not reuse the static bootstrap NATS token for browser, CLI, desktop, service, node, or agent actors.
2. Flip session bootstrap `transport.ready=true` only after the browser can connect over `/_/nats` with a principal-scoped credential and negative subject-policy tests pass.
3. Require and verify Level 3 signed command envelopes for sensitive cockpit mutations now that Lookout Web has a browser/principal Ed25519 signer lifecycle.
4. Add explicit Aegis read adapters for interface listing, route inspection, access requirements, and live config provenance/status.
5. Expand verified command envelope coverage before sensitive browser-originated commands move onto the transport rail.

## Level 3 Browser Crypto Rule

Level 3 Stronghold Web actions require native WebCrypto Ed25519. Lookout Web
should block Level 3 signing setup when `crypto.subtle` cannot generate/import
Ed25519 keys. Unsupported browsers should be directed to Lookout Desktop; the web
cockpit should not add P-256, polyfill, or legacy-browser fallback signing modes.
