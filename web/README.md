# Stronghold Lookout Web Cockpit

The first web-based Lookout shell lives here.

## What It Is

This is a UI-only browser cockpit for the Stronghold estate. It is built around:

- same-origin auth under `/_/auth`
- same-origin NATS WebSocket transport under `/_/nats`
- a shell-first layout with static module registration
- first module surfaces for Overview, Sentry, and Aegis
- a resource-interface contract route at `/debug/resource-interface` for future List/Create/Detail/Edit/Lifecycle manager screens

The app does not use SSR. It builds to static assets and expects the serving layer to mount them at `/`.

## Run

```bash
cd /srv/stronghold-lookout/web
npm install
npm run dev
```

The Vite dev server listens on `http://127.0.0.1:5173` by default.

Development proxies:

- `/_/auth` -> `http://127.0.0.1:3000`
- `/_/nats` -> `http://127.0.0.1:8443`

Override those targets with:

```bash
LOOKOUT_AUTH_PROXY_TARGET=http://host:port
LOOKOUT_NATS_PROXY_TARGET=http://host:port
```

## Build

```bash
cd /srv/stronghold-lookout/web
npm run build
```

The output is written to `web/dist/`.
