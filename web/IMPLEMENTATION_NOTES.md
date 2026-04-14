# Lookout Web Cockpit: Implementation Notes

## What Was Built

- A new `web/` boundary inside `stronghold-lookout` using React, TypeScript, and Vite.
- A shell-first cockpit with top bar, left navigation, and module mounting.
- Static module registration for Overview, Sentry, and Aegis.
- A session provider centered on same-origin auth behavior under `/_/auth`.
- A shared NATS WebSocket provider centered on `/_/nats`.
- Read-first Overview, Sentry, and Aegis surfaces with clear state handling.

## What Is Real Now

- Same-origin auth flow shape under `/_/auth` matches the existing Drawbridge behavior.
- The shell listens for Drawbridge auth completion via `postMessage`.
- The NATS client is real and attempts a browser connection over `/_/nats`.
- The shell, layout, module boundaries, and shared providers are production-shaped.

## What Is Placeholder Or Pending Backend Support

- No same-origin session bootstrap endpoint currently exposes operator identity or session detail to the browser shell.
- No browser-safe Sentry read surface currently lists users, badges, or assignments.
- No browser-safe Aegis read surface currently exposes interfaces, routes, or live config state.
- The tracked JSON files in this repo are not used as live estate truth.

## Backend Surfaces Needed Next

1. Expose a same-origin session bootstrap endpoint such as `/_/auth/session` that returns current operator identity, badge data, context, and validity state without requiring the browser to read the `HttpOnly` token directly.
2. Expose the intended `/_/nats` same-origin rail in the estate ingress so the browser transport can connect consistently in production.
3. Add explicit Sentry read adapters for user list, badge list, user detail, and assignment inspection.
4. Add explicit Aegis read adapters for interface listing, route inspection, access requirements, and live config provenance/status.
