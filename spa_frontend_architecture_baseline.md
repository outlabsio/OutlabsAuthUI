# SPA Frontend Architecture Baseline

## Scope

This frontend is always a **SPA**.

- No SSR
- No RSC
- No Next.js assumptions
- No frontend-owned backend logic
- Backend is always separate (Python / Ktor / other API)

Frontend responsibilities:

- routing
- auth/session handling on the client
- server data fetching/caching
- client UI state
- forms, validation, presentation
- API integration

This document is the baseline overview. When a focused rule document exists for a concern, that focused document is the source of truth for the detailed rules.

This is the locked baseline stack:

- Vite
- React
- TypeScript
- Tailwind
- shadcn/ui
- TanStack Router
- TanStack Query
- Zustand
- Bun

Bun is the only approved package manager for installs and scripts. Do not mix `npm`, `pnpm`, or `yarn` usage into the repo.

---

## Core Principles

1. **Server state is not app state.**
2. **Feature code must be boring and predictable.**
3. **shadcn is a primitive layer, not the app design system.**
4. **Zustand is for client state only.**
5. **Every common problem has one approved pattern.**
6. **Agents should extend patterns, not invent them.**
7. **The easiest path in the repo must also be the correct path.**

---

## Architecture Rules

### 1) State lanes are hard boundaries

#### Server state

Use **TanStack Query** only for:

- API reads
- API writes / mutations
- cache invalidation
- refetching
- optimistic updates
- background refresh
- pagination / infinite queries

Do not copy server responses into Zustand unless there is a very specific and documented reason.

#### Client app state

Use **Zustand** only for:

- sidebar open state
- current workspace / selected IDs
- active filters that should survive route changes
- client-only wizard progress
- persisted UI preferences
- draft state that is purely client-side
- feature flags already loaded from the backend

Do not use Zustand for:

- fetched entity lists
- fetched entity details
- mutation responses
- generic form field state
- local modal state unless shared broadly

#### Local screen state

Use **React local state** for:

- modal open/close
- tabs
- inline edit mode
- ephemeral input state
- temporary page-only UI state

Use `useReducer` when one screen has non-trivial client-only state transitions.

---

## Folder Structure

```txt
src/
  app/
    providers/
      query-provider.tsx
      theme-provider.tsx
      router-provider.tsx
    router/
      index.tsx
      route-tree.gen.ts
      routes/
        __root.tsx
        index.tsx
        auth/
          login.tsx
        app/
          dashboard.tsx
          projects.index.tsx
          projects.$projectId.tsx
          settings.tsx
    layouts/
      app-shell.tsx
      auth-shell.tsx
    pages/
      not-found-page.tsx
      forbidden-page.tsx

  components/
    ui/                    # shadcn primitives only
    app/                   # approved app-level wrappers/compositions
      app-page.tsx
      app-section.tsx
      app-card.tsx
      app-toolbar.tsx
      app-empty-state.tsx
      app-error-state.tsx
      app-loading-state.tsx
      app-confirm-dialog.tsx
      app-table.tsx
      app-form-field.tsx
      app-status-badge.tsx

  features/
    auth/
      api/
        login.ts
        logout.ts
        get-session.ts
        auth.keys.ts
        auth.query-options.ts
      components/
        login-form.tsx
        auth-guard.tsx
      hooks/
        use-session.ts
      schemas/
        login.schema.ts
      store/
        auth-ui.store.ts
      types/
        auth.types.ts
      utils/
        map-session.ts

    projects/
      api/
        get-projects.ts
        get-project.ts
        create-project.ts
        update-project.ts
        delete-project.ts
        project.keys.ts
        project.query-options.ts
      components/
        project-list.tsx
        project-table.tsx
        project-form.tsx
      hooks/
        use-project-filters.ts
        use-project-actions.ts
      schemas/
        project.schema.ts
      store/
        project-ui.store.ts
      types/
        project.types.ts
      utils/
        map-project.ts
        project-labels.ts

  lib/
    api/
      client.ts
      config.ts
      errors.ts
      auth-token.ts
    query/
      query-client.ts
      invalidate.ts
    store/
      app-ui.store.ts
      preferences.store.ts
      session.store.ts
    utils/
      cn.ts
      dates.ts
      format.ts
      numbers.ts
      storage.ts
    constants/
      routes.ts
      app-config.ts

  styles/
    app.css
    tokens.css

  types/
    api.types.ts
    common.types.ts

  main.tsx
```

---

## Directory Ownership Rules

### `app/`

App composition only.

Use for:

- providers
- router setup
- layouts
- root pages like not found

Do not put domain logic here.

### `components/ui/`

shadcn-generated primitives only.

Use for:

- button
- dialog
- input
- select
- dropdown-menu
- table primitives
- sheet
- tooltip

Rules:

- Prefer not to edit these unless necessary
- Do not put product logic here
- Do not import API hooks here
- Do not add app-specific styling hacks here

### `components/app/`

Approved, reusable app-level building blocks.

Use for:

- page shells
- consistent cards
- standard empty/error/loading states
- app-level table wrapper
- app form field wrapper
- confirm dialog pattern
- toolbar pattern

Feature code should import from `components/app` first.

### `features/*`

All domain logic lives here.

Each feature may contain:

- `api/`
- `components/`
- `hooks/`
- `schemas/`
- `store/`
- `types/`
- `utils/`

If a feature is tiny, do not force empty folders. Keep structure lean but consistent.

### `lib/`

Cross-feature infrastructure only.

Use for:

- API client
- query client
- shared app stores
- low-level utilities
- app constants

Do not put business/domain-specific logic here.

---

## Naming Conventions

### General

- File names: **kebab-case**
- React component names: **PascalCase**
- Hooks: **useXxx**
- Types/interfaces: **PascalCase**
- Zod schemas: **XxxSchema**
- Query keys: **featureKeys**
- Store hooks: **useXxxStore**

### Components

Files:

- `project-table.tsx`
- `app-confirm-dialog.tsx`
- `login-form.tsx`

Exports:

- named export preferred
- component name in PascalCase

Example:

```ts
export function ProjectTable() {}
```

Avoid default exports in normal feature code.

### Hooks

Files:

- `use-project-filters.ts`
- `use-session.ts`
- `use-project-actions.ts`

Rules:

- hook file names always start with `use-`
- one main hook per file
- do not hide API calls in random utility hooks

### Stores

Use `.store.ts` suffix.

Examples:

- `app-ui.store.ts`
- `preferences.store.ts`
- `project-ui.store.ts`

Store hook names:

- `useAppUiStore`
- `usePreferencesStore`
- `useProjectUiStore`

Rules:

- app-wide stores go in `src/lib/store`
- feature-limited stores go in `src/features/<feature>/store`
- never create `global.store.ts`
- never create unnamed generic files like `state.ts`

### Reducers

Use `.reducer.ts` suffix when needed.

Examples:

- `project-editor.reducer.ts`
- `report-builder.reducer.ts`

Use reducers only for complex screen-local state, not global state.

### Schemas

Use `.schema.ts` suffix.

Examples:

- `project.schema.ts`
- `login.schema.ts`

### Types

Use `.types.ts` suffix.

Examples:

- `project.types.ts`
- `auth.types.ts`
- `api.types.ts`

### API files

Use verb-based names.

Examples:

- `get-project.ts`
- `get-projects.ts`
- `create-project.ts`
- `update-project.ts`
- `delete-project.ts`

Do not create vague names like:

- `api.ts`
- `service.ts`
- `project-api.ts`

Each file should do one thing.

### Query files

Use:

- `<feature>.keys.ts`
- `<feature>.query-options.ts`

Examples:

- `project.keys.ts`
- `project.query-options.ts`

### Utils

Use clear intent-based names.

Examples:

- `map-project.ts`
- `format-project-name.ts`
- `project-labels.ts`

Do not create generic garbage names like:

- `helpers.ts`
- `misc.ts`
- `common.ts`

---

## shadcn/ui Rules

### What shadcn is in this repo

shadcn is the **primitive UI layer**. It is not the final app design system.

### Hard rules

1. `components/ui` contains shadcn primitives only.
2. App-specific reuse belongs in `components/app`.
3. Feature code should prefer `components/app` before using raw `components/ui`.
4. Do not build duplicate variants of the same primitive in feature folders.
5. Do not put API hooks, stores, or business logic inside shadcn components.
6. Do not style ad hoc with random spacing, radius, shadows, or colors.
7. Use tokens only.

### Import order rule

Preferred order:

1. existing feature component
2. `components/app`
3. `components/ui`
4. create a new reusable wrapper if needed

Do not repeatedly compose raw `Card + Button + Badge + Dialog` in different ways across the app when that pattern already exists.

### Base wrappers that should exist early

- `AppPage`
- `AppSection`
- `AppCard`
- `AppToolbar`
- `AppEmptyState`
- `AppErrorState`
- `AppLoadingState`
- `AppConfirmDialog`
- `AppTable`
- `AppFormField`
- `AppStatusBadge`

If agents need one of these patterns, they should reuse them, not rebuild them.

---

## Zustand Rules

### What Zustand is for in this repo

Zustand is the **client app state layer**.

### Allowed use cases

- navigation shell state
- persisted preferences
- cross-route UI state
- client-side filters that outlive a single component
- wizard progress
- selected IDs / active items when purely client-side
- feature-local UI state shared across many children

### Forbidden use cases

- storing API response lists as the main source of truth
- storing entity detail payloads from the backend
- replacing TanStack Query
- storing all form fields by default
- creating one mega-store for the whole app

### Store structure rule

Use small stores or slice-based stores.

Good:

- `app-ui.store.ts`
- `preferences.store.ts`
- `project-ui.store.ts`

Bad:

- `store.ts`
- `app.store.ts` containing everything
- `global-state.ts`

### Action rule

All store mutations must be represented by named actions inside the store.

Good:

- `setSidebarOpen`
- `setActiveWorkspaceId`
- `resetFilters`
- `setViewMode`

Bad:

- exporting raw setters everywhere
- mutation logic spread across feature files

### Selector rule

Components should select only what they need. Do not subscribe whole components to an entire store if only one field is needed.

### Persistence rule

Persist only minimal UI state that should survive reload.

Good candidates:

- theme
- preferred density
- sidebar collapse
- preferred view mode

Bad candidates:

- entire feature working sets
- loaded server payloads
- giant draft objects unless clearly needed

### Feature store rule

A feature-level Zustand store is allowed only when all are true:

- state is client-only
- state is shared by many components in the feature
- local React state is no longer clean
- TanStack Query is not the right abstraction

If those are not true, do not create a store.

---

## Data Access Rules

### API client

All HTTP goes through `src/lib/api/client.ts`.

No direct `fetch`/`axios` in components.

### Query hooks

Keep TanStack Query wiring near the feature.

Example structure:

```txt
features/projects/api/
  get-projects.ts
  get-project.ts
  create-project.ts
  project.keys.ts
  project.query-options.ts
```

### Query key convention

Each feature owns its own keys.

Example:

```ts
export const projectKeys = {
  all: ['projects'] as const,
  list: (filters: ProjectFilters) => ['projects', 'list', filters] as const,
  detail: (id: string) => ['projects', 'detail', id] as const,
}
```

### Mapping rule

Map API models to UI/view models in feature utils when necessary. Do not push raw backend shape assumptions deep into UI components.

---

## Styling Rules

### Tokens

All design values come from shared tokens.

Use `styles/tokens.css` for:

- colors
- radii
- shadows
- spacing decisions that need custom tokens
- typography tokens if needed

### Hard rules

- no raw hex colors in feature code
- no arbitrary random shadows
- no arbitrary border radius unless approved
- no one-off spacing explosions unless clearly justified
- no inline style objects for routine layout/styling

### Layout rules

Prefer repeatable layout patterns:

- page shell
- section shell
- toolbar
- content card
- list/table wrapper
- empty state

Do not invent a new page spacing system per route.

---

## Routing Rules

- route files live under `app/router`
- route-level pages should be thin composition files
- domain logic belongs to features, not route files
- pages should assemble feature components, not implement business logic directly

Naming examples:

- `projects-page.tsx`
- `project-detail-page.tsx`
- `settings-page.tsx`

---

## Forms Rules

Pick one form strategy and do not mix patterns.

Recommended:

- form schema lives in `schemas/`
- feature form UI lives in `components/`
- reusable field composition goes in `components/app`

Do not put entire form state in Zustand unless the form is a real multi-step cross-route client-side workflow.

---

## Agent Guardrails

### Agents must not

- fetch inside presentational components
- invent new global state patterns
- add generic `helpers.ts`
- add generic `state.ts`
- duplicate the same UI composition pattern in multiple places
- store server data in Zustand by default
- add app logic into `components/ui`
- create business logic in `app/`

### Agents should

- start from existing patterns
- create new reusable wrappers only when repetition is real
- keep files small and named by purpose
- keep route files thin
- keep feature boundaries intact
- use one approved pattern per problem

---

## Recommended Starter Base Components

Create these early:

- `components/app/app-page.tsx`
- `components/app/app-section.tsx`
- `components/app/app-card.tsx`
- `components/app/app-toolbar.tsx`
- `components/app/app-empty-state.tsx`
- `components/app/app-error-state.tsx`
- `components/app/app-loading-state.tsx`
- `components/app/app-confirm-dialog.tsx`
- `components/app/app-table.tsx`
- `components/app/app-form-field.tsx`
- `components/app/app-status-badge.tsx`

These are the first layer that stops raw shadcn sprawl.

---

## Recommended Starter Stores

Create only a few app-level stores initially:

- `lib/store/app-ui.store.ts`

  - sidebar open
  - mobile nav open
  - command palette open

- `lib/store/preferences.store.ts`

  - density
  - theme
  - preferred list/grid mode

- `lib/store/session.store.ts`

  - client auth/session shell state only if needed
  - avoid duplicating session query payloads

Anything else should be justified by actual need.

---

## Feature Template

```txt
features/<feature>/
  api/
    get-<items>.ts
    get-<item>.ts
    create-<item>.ts
    update-<item>.ts
    delete-<item>.ts
    <feature>.keys.ts
    <feature>.query-options.ts
  components/
    <feature>-list.tsx
    <feature>-table.tsx
    <feature>-form.tsx
  hooks/
    use-<feature>-filters.ts
    use-<feature>-actions.ts
  schemas/
    <feature>.schema.ts
  store/
    <feature>-ui.store.ts
  types/
    <feature>.types.ts
  utils/
    map-<feature>.ts
```

Only create subfolders that the feature actually needs.

---

## Default Decision Summary

### Use shadcn when

- you need a base primitive
- the pattern is common and app-wide
- the component belongs in `components/ui`

### Use `components/app` when

- the composition is reused
- the pattern defines your product UI
- you want agents to stop rebuilding the same thing differently

### Use Zustand when

- state is client-only
- shared beyond one component
- not server-backed
- not better handled by local reducer state

### Use TanStack Query when

- data comes from the backend
- cache matters
- invalidation matters
- async state lifecycle matters

### Use local React state when

- the state is local to a page or component
- no cross-route sharing is needed
- persistence is not needed

---

## Documentation Set To Create

### Tier 1: Mandatory foundation docs

These should exist immediately.

1. `agents.md`

   - hard rules for AI/code agents
   - what agents may and may not create
   - import order rules
   - file naming rules
   - when to use local state vs Zustand vs TanStack Query
   - when to create reusable components vs feature-local components

2. `architecture.md`

   - high-level frontend architecture
   - SPA-only constraint
   - boundaries between `app`, `components`, `features`, `lib`
   - decision summary for state, UI, data, and routing

3. `frontend_structure.md`

   - canonical folder structure
   - directory ownership rules
   - examples of good feature layout
   - examples of bad placement

4. `state_rules.md`

   - exact rules for TanStack Query, Zustand, local state, reducers
   - store naming
   - selector guidance
   - persistence guidance
   - anti-pattern examples

5. `component_rules.md`

   - `components/ui` vs `components/app` vs `features/*/components`
   - composition rules
   - wrapper rules
   - duplication prevention rules
   - when to promote a feature component into app-level reusable UI

### Tier 2: Strongly recommended implementation docs

These round out the actual working system.

6. `routing_rules.md`

   - router choice and route file conventions
   - page naming conventions
   - thin-route rule
   - route-level composition rules
   - auth guard placement
   - route param/query param conventions

7. `api_integration_rules.md`

   - how HTTP clients are used
   - request/response typing rules
   - error handling rules
   - auth token/header handling
   - where API files live
   - mapping API models to UI models
   - no direct `fetch` in components rule

8. `query_rules.md`

   - query key conventions
   - query option builder conventions
   - mutation patterns
   - invalidation rules
   - stale time/retry defaults
   - pagination/infinite query rules
   - optimistic update rules

9. `form_rules.md`

   - chosen form library and why
   - schema validation rules
   - file placement for forms and schemas
   - field wrapper rules
   - submit/mutation/error patterns
   - when form state may enter Zustand

10. `styling_rules.md`

    - token usage
    - spacing/radius/shadow rules
    - typography rules
    - layout primitives
    - dark mode rules if used
    - explicit ban on arbitrary visual drift

11. `naming_conventions.md`

    - file naming patterns
    - component naming patterns
    - store/reducer/schema/type naming
    - API action naming
    - route/page naming
    - examples of approved vs banned names

### Tier 3: Quality and enforcement docs

These stop the repo from degrading over time.

12. `CODE_QUALITY_RULES.md`

    - TypeScript strictness expectations
    - lint rules
    - import rules
    - dead code / unused export rules
    - formatting rules
    - PR expectations

13. `TESTING_RULES.md`

    - what must be tested
    - what should not be over-tested
    - component vs hook vs integration test guidance
    - API mocking strategy
    - naming/location conventions for tests

14. `DECISIONS.md`

    - ADR-style running record
    - every major architectural decision gets logged here
    - useful for preventing agents and humans from reopening settled debates

15. `CHECKLISTS.md`

    - new feature checklist
    - new component checklist
    - new store checklist
    - new API integration checklist
    - PR architecture checklist

### Tier 4: Optional but very useful docs

These help once the codebase starts growing.

16. `AUTH_RULES.md`

    - session handling model
    - token storage rules
    - refresh flow rules
    - route protection rules
    - logout/session-expiry behavior

17. `ERROR_HANDLING_RULES.md`

    - transport vs auth vs validation vs domain errors
    - toast vs inline error rules
    - error boundary guidance
    - retry guidance

18. `TABLE_AND_LIST_PATTERNS.md`

    - standard table/list shell
    - filtering/sorting/pagination conventions
    - empty/loading/error states
    - bulk action rules

19. `MIGRATION_PROMOTION_RULES.md`

    - when a feature-local component becomes `components/app`
    - when local state becomes Zustand
    - when inline page logic must be extracted
    - when a utility becomes shared infra

20. `REGISTRY_PLAN.md`

    - if using a private shadcn registry
    - what patterns belong in it
    - how components are versioned and updated

---

## Recommended Creation Order

Create these first, in order:

1. `agents.md`
2. `architecture.md`
3. `frontend_structure.md`
4. `naming_conventions.md`
5. `state_rules.md`
6. `component_rules.md`
7. `api_integration_rules.md`
8. `query_rules.md`
9. `form_rules.md`
10. `styling_rules.md`
11. `routing_rules.md`
12. `DECISIONS.md`
13. `CHECKLISTS.md`

That is enough to make the repo genuinely hard to mess up.

---

## Minimum Viable Documentation Set

If keeping it lean, the minimum set is:

- `agents.md`
- `architecture.md`
- `frontend_structure.md`
- `naming_conventions.md`
- `state_rules.md`
- `component_rules.md`
- `api_integration_rules.md`
- `query_rules.md`
- `form_rules.md`
- `styling_rules.md`
- `DECISIONS.md`
- `CHECKLISTS.md`

That is the smallest serious set.
