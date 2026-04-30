# Stronghold Lookout — The Vantage Point of the Estate

> *"One does not stumble into a well-run estate. One engineers it."*

---

## What Is This?

**Stronghold Lookout** is the unified client repository for the [Stronghold](https://github.com/levratech) management suite. It serves as the single, authoritative vantage point from which operators observe, direct, and interrogate the Stronghold core — with composure.

This repository will eventually house three distinct client surfaces, each disciplined in its own manner:

| Client | Description | Status |
|---|---|---|
| **Interactive CLI** | A command-driven runtime and agent-facing operational window for Stronghold operator workflows. Built on [Cobra](https://github.com/spf13/cobra). | Active |
| **Web Lookout** | A browser-based operator cockpit for same-origin auth, NATS transport, authority/resource management, and estate visibility. Assets live in `web/`. | Active |
| **Electron Shell** | A desktop application for those who require their dashboards delivered natively. | Forthcoming |

The CLI and web cockpit are active, while the Electron shell remains future work. The scaffolding is still the **Industrial Rail**: future features should land cleanly, with evidence, and without drama.

---

## Repository Layout

```
stronghold-lookout/
├── cmd/          # Entry points for each client binary (one sub-directory per binary)
├── internal/     # Shared logic that is nobody else's business (NATS helpers, common types)
│   └── version/  # Canonical build-time version information
├── pkg/          # Public-facing client libraries, should external consumers ever require them
├── web/          # Web-based Lookout cockpit (React + TypeScript + Vite)
├── ui/           # Legacy reserved frontend boundary
├── go.mod        # Module: github.com/levratech/stronghold-lookout
└── go.sum        # The immutable ledger of what was fetched and when
```

---

## Core Dependencies

These are the load-bearing members of the edifice:

| Package | Purpose |
|---|---|
| [`github.com/nats-io/nats.go`](https://github.com/nats-io/nats.go) | The essential bridge to the Stronghold core. All client–server communication passes through NATS. |
| [`github.com/spf13/cobra`](https://github.com/spf13/cobra) | The backbone of the Interactive Runtime CLI. Structured, composable, and unambiguous. |
| [`github.com/google/uuid`](https://github.com/google/uuid) | Aligns with the hierarchical identity UUIDs employed by the Stronghold DB Service. |

---

## Getting Started

```bash
# Clone the estate
git clone https://github.com/levratech/stronghold-lookout.git
cd stronghold-lookout

# Fetch all dependencies
go mod download

# Confirm the module builds cleanly
go build ./...

# Run the web cockpit
cd web
npm install
npm run dev
```

The Go CLI remains intact. The web cockpit is a separate UI-only app that builds to static assets.

The JSON config files tracked in this repository are now templates/examples only. Do not place live secrets in them. The intended flow is:

```bash
cd /srv/stronghold
./scripts/bootstrap-init.sh --primary-domain ... --google-client-id ... --google-client-secret ...
```

That bootstrap step writes the live edge config to `stronghold/runtime/lookout/edge_routes_v1.json`. Push the generated file, not the tracked template JSON in this repo.

The web cockpit is intentionally same-origin in design:

- UI is expected at `/`
- auth is expected under `/_/auth`
- NATS over WebSocket is expected under `/_/nats`

See [`web/README.md`](web/README.md) and [`web/IMPLEMENTATION_NOTES.md`](web/IMPLEMENTATION_NOTES.md) for the current web-shell details and backend gaps.

The reusable resource interface doctrine is captured in [`web/RESOURCE_INTERFACE_EVIDENCE.md`](web/RESOURCE_INTERFACE_EVIDENCE.md). Agents can inspect the CLI parity contract with:

```bash
lookout resources contract
```

Lookout Web UI changes must follow [`docs/ui-rules.md`](docs/ui-rules.md). Treat the app as a task-focused control panel: list first, inspect one entity, act deliberately, confirm, and return to the list.

---

## Guiding Principles

1. **Clarity before cleverness.** Code in this repository should be readable by a competent engineer at 11 pm without recourse to documentation.
2. **One concern per package.** The `internal/` boundary is respected. Shared logic lives there; client specifics do not.
3. **No premature implementation.** The clients will arrive in their own time, on their own terms. The rail is laid; the trains shall follow.

---

## Licence

[Apache 2.0](LICENSE) — use it wisely.
