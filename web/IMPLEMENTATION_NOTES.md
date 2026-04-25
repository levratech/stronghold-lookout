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

## What Is Placeholder Or Pending Backend Support

- Browser transport remains intentionally pending until the Phase 7 principal NATS credential model is implemented by Sentry/NATS and exposed through the browser WebSocket rail.
- No browser-safe Aegis read surface currently exposes interfaces, routes, or live config state.
- The tracked JSON files in this repo are not used as live estate truth.

## Backend Surfaces Needed Next

1. Implement the Sentry-minted principal NATS credential model described in `stronghold/docs/browser-nats-authorization-model.md`; do not pass internal platform NATS credentials to browser, CLI, or desktop clients.
2. Flip session bootstrap `transport.ready=true` only after the browser can connect over `/_/nats` with a principal-scoped credential and negative subject-policy tests pass.
3. Add explicit Aegis read adapters for interface listing, route inspection, access requirements, and live config provenance/status.
4. Expand verified command envelope coverage before sensitive browser-originated commands move onto the transport rail.
