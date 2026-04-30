# Stronghold Lookout UI Rules

Stronghold Lookout is an operational control panel, not a marketing dashboard
or component gallery.

Before changing Lookout Web UI, read this file. UI work should convert the app
from dashboard-thinking to resource-management-thinking.

## Product Posture

The primary interaction model is:

```text
List -> inspect -> act -> confirm -> back to list
```

Every resource page must support one primary job:

- Find an entity.
- Inspect its current state.
- Create or edit it.
- Archive, disable, or delete it with confirmation.
- Return to the list.

Dashboards observe. Control panels act. Stronghold Lookout should behave like a
control panel.

## Required Page Structure

Every LCRUD page uses the same shape:

1. PageHeader
   - Title.
   - One-sentence purpose.
   - One primary action button.

2. EntityToolbar
   - Search.
   - Filters.
   - Optional refresh.
   - No decorative controls.

3. EntityTable or EntityList
   - Compact rows.
   - Status shown as badges.
   - Row click opens a detail drawer or focused detail view.
   - Row actions are right-aligned.

4. DetailDrawer or DetailView
   - Read mode first.
   - Edit action inside the drawer or detail view.
   - Dangerous actions at the bottom.

5. EmptyState
   - Explains what is missing.
   - Gives exactly one action.

## Component Vocabulary

Do not keep inventing page-specific UI directly. Prefer a small internal
vocabulary:

- `AppShell`
- `PageHeader`
- `Section`
- `EntityToolbar`
- `EntityTable`
- `DetailDrawer`
- `EntityForm`
- `DeleteConfirmDialog`
- `EmptyState`
- `StatusBadge`
- `FieldRow`

Existing components may keep their current names while being migrated, but new
resource surfaces should move toward this vocabulary instead of adding one-off
cards, panels, and forms.

## Page Composition Pattern

Resource pages should look like boring composition:

```tsx
<PageHeader
  title="Identities"
  description="Manage users, agents, and service identities."
  action={<CreateIdentityButton />}
/>

<EntityToolbar
  searchPlaceholder="Search identities..."
  filters={filters}
/>

<EntityTable
  rows={identities}
  columns={identityColumns}
  onRowClick={openDrawer}
/>

<DetailDrawer
  entity={selectedIdentity}
  mode={mode}
/>
```

## Forbidden Patterns

- No dashboard cards unless they represent an actionable queue.
- No duplicate actions in multiple places.
- No more than one primary button per screen.
- No raw buttons, inputs, selects, cards, modals, or tables when a shared component exists.
- No decorative icons unless they improve scanning.
- No multi-column forms unless the fields are naturally grouped.
- No recent-activity panels unless the user can act from them.
- No huge hero sections.
- No decorative metrics unless they trigger or clarify an action.
- No debug/status/security-model narration on primary product screens.
- No visual novelty for its own sake.

## Visual Density

Lookout should feel closer to:

- GitHub settings.
- Stripe dashboard.
- Linear admin screens.
- Cloudflare control panel.

It should not feel like:

- A SaaS landing page.
- An analytics toy.
- A component gallery.

## Canonical Refactor Strategy

Do not ask for or perform vague UI improvement. Instead:

1. Pick one resource page as the canonical LCRUD reference.
2. Make it boring, fast, obvious, and task-focused.
3. Use that page as the local precedent for the other resource pages.
4. Do not introduce a new layout pattern unless the task requires it.

The preferred first canonical page is `Identities`, because it sits close to the
core user/account/identity model and can establish the pattern for agents,
services, badges, and spaces.

## Review Checklist

Before completing UI work, answer:

- What is the one primary job of this page?
- What is the one primary action?
- Can the user search or filter before acting?
- Does row selection open one clear detail surface?
- Are create/edit/archive flows hidden until requested?
- Are dangerous actions confirmed?
- Did we remove clutter instead of adding more?
- Did we keep diagnostics out of the average-user path?

## Completion Report

After a UI refactor, provide a short report:

1. Pages changed.
2. Components added or reused.
3. Clutter removed.
4. Remaining UX issues.
