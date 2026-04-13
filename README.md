# Stronghold Lookout — The Vantage Point of the Estate

> *"One does not stumble into a well-run estate. One engineers it."*

---

## What Is This?

**Stronghold Lookout** is the unified client repository for the [Stronghold](https://github.com/levratech) management suite. It serves as the single, authoritative vantage point from which operators observe, direct, and interrogate the Stronghold core — with composure.

This repository will eventually house three distinct client surfaces, each disciplined in its own manner:

| Client | Description | Status |
|---|---|---|
| **Interactive CLI** | A command-driven runtime for operators who prefer precision over pantomime. Built on [Cobra](https://github.com/spf13/cobra). | Forthcoming |
| **Web Lookout** | A browser-based dashboard for situational awareness. Assets will reside in `ui/`. | Forthcoming |
| **Electron Shell** | A desktop application for those who require their dashboards delivered natively. | Forthcoming |

None of the above are implemented yet. The scaffolding you see here is the **Industrial Rail** — everything necessary to receive future features cleanly and without drama.

---

## Repository Layout

```
stronghold-lookout/
├── cmd/          # Entry points for each client binary (one sub-directory per binary)
├── internal/     # Shared logic that is nobody else's business (NATS helpers, common types)
│   └── version/  # Canonical build-time version information
├── pkg/          # Public-facing client libraries, should external consumers ever require them
├── ui/           # Reserved for web-based frontend assets
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
```

No binaries are produced yet. That is entirely by design.

The JSON config files tracked in this repository are now templates/examples only. Do not place live secrets in them. The intended flow is:

```bash
cd /srv/stronghold
./scripts/bootstrap-init.sh --primary-domain ... --google-client-id ... --google-client-secret ...
```

That bootstrap step writes the live edge config to `stronghold/runtime/lookout/edge_routes_v1.json`. Push the generated file, not the tracked template JSON in this repo.

---

## Guiding Principles

1. **Clarity before cleverness.** Code in this repository should be readable by a competent engineer at 11 pm without recourse to documentation.
2. **One concern per package.** The `internal/` boundary is respected. Shared logic lives there; client specifics do not.
3. **No premature implementation.** The clients will arrive in their own time, on their own terms. The rail is laid; the trains shall follow.

---

## Licence

[Apache 2.0](LICENSE) — use it wisely.
