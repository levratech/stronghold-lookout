# Lookout Resource Interface Evidence

This file records the first `Lookout Resource Interface v0` conversion pass and the DSI terminology cleanup that followed it.

## Contract

The reusable resource interface uses this shape:

- `List`: loaded records with quick filter, sort, visible columns, selected row, and raw ID visibility.
- `Create`: a dedicated create region per resource; backend mutations remain resource-specific.
- `Detail/View`: selected record fields, relationships, tags, lifecycle state, and raw payload inspection.
- `Edit`: a dedicated edit region per resource; no hidden authority mutation shortcuts.
- `Lifecycle`: confirmation-backed archive, disable, revoke, restore, and inspect actions with evidence feedback.

## Converted Web Surfaces

- `Scopes`: hierarchy, parent/child posture, direct/inherited grants, identities, access labels, raw compatibility records.
- `Access Labels`: scope-bound definitions, archive posture, assignment relationship hints, raw badge records.
- `Identities`: account ownership, scope binding, paired principal posture, raw identity records.
- `Grants`: identity-bound badge grants, direct/subtree `scope_mode`, inherited/effective scope posture.
- `Services`: shared definitions, scope service bindings, permission lane posture.
- `Principals`: human, service, agent, system, and ephemeral execution principal posture.
- `Keys`: principal key metadata, issuer binding posture, expiry, and revocation state.

## DSI Terminology Pass

Visible product UI should now say Home, Scopes, Access, Portals, and System Diagnostics. The retired `Space` noun should not appear in product-facing labels. `context_id` remains in code, commands, and raw diagnostics as a compatibility bridge until backend command and wire contracts complete the scope rename.

System diagnostics are gated by session `interface_mode=system`; the normal user interface should not show raw principal/grant/service/debug diagnostics by default.

## CLI Parity

Lookout CLI is the agent-facing operational window. The first parity slice is intentionally declarative and does not require a live NATS connection:

```bash
lookout resources contract
```

That command prints the resource interface doctrine as JSON so agents can align on verbs and boundaries before live authority resource commands exist.

Future CLI resource commands should follow these verbs:

- `list`
- `get`
- `create`
- `update`
- `archive`
- `disable`
- `revoke`
- `smoke`

CLI parity must not bypass Sentry authority checks, db-service persistence rules, command-signing requirements, audit, or scoped NATS credentials.

## Validation

Required evidence for this pass:

- `go test ./...`
- `npm run build`
- `python3 -m json.tool REPO_MAP.json`

Known warning:

- Vite reports the existing single bundle is larger than 500 kB after minification. This is not introduced by the doctrine itself, but it remains a future code-splitting cleanup candidate.
