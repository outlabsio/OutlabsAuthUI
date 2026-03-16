# FRONTEND_STRUCTURE.md

## Purpose

This document defines the canonical folder structure for the frontend.

The goal is not to create the most flexible structure.
The goal is to make file placement obvious, reduce architecture drift, and stop agents from inventing a new layout every time a feature is added.

This repo is a **SPA only** frontend.
The backend is always separate.

---

## Top-Level Structure

```txt
src/
  app/
  components/
  features/
  lib/
  styles/
  types/
  main.tsx
```

Each top-level directory has a narrow purpose.
Do not blur those boundaries.

---

## Canonical Structure

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
    ui/
      button.tsx
      card.tsx
      dialog.tsx
      input.tsx
      table.tsx
    app/
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
        project-detail-header.tsx
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
      defaults.ts
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
      guards.ts
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

This is the default structure.
Use it unless there is a strong reason not to.

---

## Directory Rules

## `src/app/`

This directory owns **application composition**.
It wires the app together but does not own domain logic.

Allowed here:

- providers
- router setup
- layout components
- route files
- root pages like `not-found-page.tsx`

Not allowed here:

- feature business logic
- API request functions
- backend model mapping
- reusable domain UI

### `app/providers/`

Put global providers here.

Examples:

- `query-provider.tsx`
- `theme-provider.tsx`
- `router-provider.tsx`

Rules:

- one provider file per concern
- keep composition shallow and obvious
- no feature-specific logic in provider files

### `app/router/`

This directory owns TanStack Router setup.

Allowed here:

- router creation
- route tree wiring
- route files
- route-level wrappers and guards when necessary

Not allowed here:

- direct API request definitions
- long business logic flows
- generic utility dumping

Rules:

- route files stay thin
- route files compose feature code
- route files may read params/search params
- route files do not become page controllers

### `app/router/routes/`

Put route files here.

Examples:

- `index.tsx`
- `auth/login.tsx`
- `app/projects.index.tsx`
- `app/projects.$projectId.tsx`
- `app/settings.tsx`

Route files should:

- read route params
- read/write search params
- compose feature components
- coordinate route-level shell/layout concerns

Route files should not:

- hold domain data transformation
- define API calls inline
- duplicate feature-level query logic

### `app/layouts/`

Put app shells here.

Examples:

- `app-shell.tsx`
- `auth-shell.tsx`

Rules:

- layouts define overall page framing
- layouts do not own feature state
- layouts do not fetch feature data directly unless clearly global

### `app/pages/`

Only root-level standalone pages belong here.

Examples:

- `not-found-page.tsx`
- `forbidden-page.tsx`

Do not treat `app/pages/` as a second route feature layer.

---

## `src/components/`

This directory owns reusable UI.
It is split into two layers:

- `components/ui/` → primitive layer
- `components/app/` → app-level reusable composition layer

### `components/ui/`

This is the **shadcn primitive layer**.

Examples:

- `button.tsx`
- `dialog.tsx`
- `input.tsx`
- `table.tsx`
- `sheet.tsx`

Rules:

- keep this layer low-level
- do not put business logic here
- do not put API hooks here
- do not add random product-specific hacks here
- edits should be minimal and deliberate

Use this directory for primitives, not product features.

### `components/app/`

This is the **approved reusable app UI layer**.

Examples:

- `app-page.tsx`
- `app-card.tsx`
- `app-toolbar.tsx`
- `app-table.tsx`
- `app-form-field.tsx`
- `app-confirm-dialog.tsx`

Rules:

- this is where repeated product patterns go
- feature code should check here before using raw primitives
- new files here must represent real reuse, not speculative abstraction
- these components may compose `components/ui`, but should still remain UI-focused

Use this layer to stop feature folders from rebuilding the same UI structure differently.

---

## `src/features/`

This is the default home for **domain code**.
Most product logic should live here.

Each feature owns its own:

- API wrappers
- query keys and options
- domain components
- domain hooks
- schemas
- types
- feature-local stores
- domain-specific utilities

Examples:

- `features/auth/`
- `features/projects/`
- `features/users/`
- `features/settings/`

### Feature folder template

```txt
features/<feature>/
  api/
  components/
  hooks/
  schemas/
  store/
  types/
  utils/
```

Do not force all subfolders if the feature is small.
But when a concern exists, put it in the correct place.

### `features/<feature>/api/`

Owns feature-specific backend access.

Examples:

- `get-projects.ts`
- `get-project.ts`
- `create-project.ts`
- `project.keys.ts`
- `project.query-options.ts`

Rules:

- one API file per action or query purpose
- use verb-based names
- keep query keys in `<feature>.keys.ts`
- keep query option builders in `<feature>.query-options.ts`
- all actual HTTP still goes through `lib/api/client.ts`

### `features/<feature>/components/`

Owns domain-specific UI for that feature.

Examples:

- `project-table.tsx`
- `project-form.tsx`
- `project-detail-header.tsx`

Rules:

- feature UI belongs here by default
- only promote to `components/app` when reuse across features is real
- do not dump shared UI patterns here if they belong at app level

### `features/<feature>/hooks/`

Owns feature-specific hooks.

Examples:

- `use-project-filters.ts`
- `use-project-actions.ts`
- `use-session.ts`

Rules:

- file name must start with `use-`
- one main hook per file
- keep hooks honest and narrowly named
- do not hide generic API logic in vague hooks

### `features/<feature>/schemas/`

Owns schemas used by the feature.

Examples:

- `project.schema.ts`
- `login.schema.ts`

Rules:

- use `.schema.ts` suffix
- keep validation close to the feature unless truly global

### `features/<feature>/store/`

Owns feature-local client-only Zustand stores.

Examples:

- `project-ui.store.ts`
- `auth-ui.store.ts`

Rules:

- only create a feature store if local state is no longer clean
- store must remain client-only
- store file names must be specific
- do not use this for backend payload ownership

### `features/<feature>/types/`

Owns feature-specific types.

Examples:

- `project.types.ts`
- `auth.types.ts`

Rules:

- use `.types.ts` suffix
- do not dump common shared types here

### `features/<feature>/utils/`

Owns feature-specific utility functions.

Examples:

- `map-project.ts`
- `project-labels.ts`
- `map-session.ts`

Rules:

- utilities must be named by purpose
- no `helpers.ts`
- no dumping unrelated functions together

---

## `src/lib/`

This directory owns **shared infrastructure**.
Not product/domain logic.

Allowed here:

- API client
- query client
- app-wide stores
- low-level utilities
- shared constants

Not allowed here:

- feature-specific mapping logic
- feature-specific business rules
- route-local hacks

### `lib/api/`

Owns the shared API client layer.

Examples:

- `client.ts`
- `config.ts`
- `errors.ts`
- `auth-token.ts`

Rules:

- components do not fetch directly
- feature API files call into this layer
- keep transport concerns here, not business semantics

### `lib/query/`

Owns query infrastructure.

Examples:

- `query-client.ts`
- `invalidate.ts`
- `defaults.ts`

Rules:

- global QueryClient config lives here
- feature query keys do not live here
- feature query options do not live here

### `lib/store/`

Owns app-wide Zustand stores.

Examples:

- `app-ui.store.ts`
- `preferences.store.ts`
- `session.store.ts`

Rules:

- only app-wide client state belongs here
- do not create a single giant store
- do not duplicate feature-local store concerns here

### `lib/utils/`

Owns cross-feature utilities.

Examples:

- `cn.ts`
- `dates.ts`
- `format.ts`
- `numbers.ts`
- `storage.ts`
- `guards.ts`

Rules:

- only truly cross-feature helpers belong here
- name by purpose
- do not create generic utility dumping grounds

### `lib/constants/`

Owns shared constants.

Examples:

- `routes.ts`
- `app-config.ts`

Rules:

- use for stable shared constants
- do not hide runtime logic in constant files

---

## `src/styles/`

This directory owns global styling entry points and tokens.

Examples:

- `app.css`
- `tokens.css`

Rules:

- shared tokens live here
- global style composition lives here
- do not scatter design tokens through feature folders

---

## `src/types/`

This directory owns truly shared types.

Examples:

- `api.types.ts`
- `common.types.ts`

Rules:

- only shared cross-feature types go here
- do not move feature types here too early
- if a type belongs to one feature, keep it in that feature

---

## Placement Decision Rules

When creating a new file, ask these in order:

### 1. Is it domain-specific?
If yes, it belongs in `features/<feature>/`.

### 2. Is it reusable UI but not primitive?
If yes, it belongs in `components/app/`.

### 3. Is it a primitive UI element?
If yes, it belongs in `components/ui/`.

### 4. Is it app composition only?
If yes, it belongs in `app/`.

### 5. Is it shared infrastructure with no domain ownership?
If yes, it belongs in `lib/`.

### 6. Is it a shared design token or global style entry?
If yes, it belongs in `styles/`.

If the answer is unclear, keep it inside the feature until reuse is proven.

---

## Good Placement Examples

### Example: project table data view

Files:

- `features/projects/api/get-projects.ts`
- `features/projects/api/project.keys.ts`
- `features/projects/components/project-table.tsx`
- `features/projects/hooks/use-project-filters.ts`

Reason:

This is project-domain UI and data access.
It belongs to the `projects` feature.

### Example: reusable confirm dialog used across the app

File:

- `components/app/app-confirm-dialog.tsx`

Reason:

This is not project-specific.
It is an app-level reusable composition.

### Example: sidebar open state

File:

- `lib/store/app-ui.store.ts`

Reason:

This is app-wide client-only shared state.

### Example: route file for project detail page

File:

- `app/router/routes/app/projects.$projectId.tsx`

Reason:

This file defines routing and composition.
It is not where project query definitions should live.

---

## Bad Placement Examples

### Bad: fetching in a route file

Bad:

- `app/router/routes/app/projects.$projectId.tsx` contains raw HTTP logic

Why bad:

Route files own routing, not backend access.
Use feature API/query files instead.

### Bad: storing fetched project detail in `lib/store/session.store.ts`

Why bad:

That mixes app-wide client shell state with feature backend data.
Use TanStack Query under the feature.

### Bad: `components/ui/project-card.tsx`

Why bad:

`components/ui` is for primitives, not domain UI.
This belongs in `features/projects/components/` or `components/app/` depending on reuse.

### Bad: `lib/utils/helpers.ts`

Why bad:

This is a dumping ground name and will rot immediately.
Name utilities by purpose.

### Bad: `features/projects/state.ts`

Why bad:

The name is vague and hides the actual pattern.
Use `store/project-ui.store.ts` or a reducer file if that is what it really is.

---

## Promotion Rules

### Promote a feature component to `components/app/` when:

- it is reused across multiple features
- it represents a stable product pattern
- the abstraction is concrete and clearly named

### Promote a utility to `lib/utils/` when:

- it is used across multiple features
- it is not domain-specific
- it has a clear narrow purpose

### Promote a store to `lib/store/` when:

- the state is app-wide
- it is client-only
- multiple features or app shells depend on it

Do not promote code just because it might be reused later.

---

## Structure Rules for Agents

Agents must:

- place files in the narrowest correct directory
- prefer feature ownership by default
- keep route files thin
- keep primitives in `components/ui`
- keep reusable app compositions in `components/app`
- keep infra in `lib`

Agents must not:

- create new top-level source folders without approval
- invent alternate layout systems per feature
- dump unrelated utilities into one file
- create vague files like `helpers.ts`, `state.ts`, or `common.ts`
- move feature logic to shared layers too early

---

## Final Rule

The structure is designed so that most new work should start in a feature folder.

Only move outward from the feature when the code is clearly:

- app composition
- reusable app UI
- primitive UI
- shared infrastructure
- shared styling
- shared types

Default to the narrowest correct placement.
That is how the repo stays clean.

