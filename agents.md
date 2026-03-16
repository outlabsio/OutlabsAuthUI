# AGENTS.md

This file defines the hard rules for AI agents and contributors working in this frontend repository.

The goal is simple:

- keep the codebase predictable
- avoid duplicate patterns
- stop architecture drift
- make the correct path the easiest path

This frontend is a **SPA only**.

- no SSR
- no RSC
- no Next.js assumptions
- no frontend-owned backend logic
- backend is always a separate system

Locked stack:

- Vite
- React
- TypeScript
- Tailwind
- shadcn/ui
- TanStack Router
- TanStack Query
- Zustand
- Bun

Package manager policy:

- Bun is the only approved package manager for this repo.
- Use Bun for dependency installation and script execution.
- Do not mix `npm`, `pnpm`, or `yarn` commands into the project.

---

## Non-Negotiable Rules

1. Do not invent new architectural patterns when an approved one already exists.
2. Do not fetch data directly inside presentational components.
3. Do not store server data in Zustand by default.
4. Do not place business logic in `components/ui`.
5. Do not add generic files like `helpers.ts`, `misc.ts`, `common.ts`, or `state.ts`.
6. Do not create duplicate UI patterns in different folders.
7. Do not introduce a new library for a problem already covered by the locked stack.
8. Do not move domain logic into `app/` or `lib/` unless it is truly cross-feature infrastructure.
9. Do not create one mega-store for the whole app.
10. Do not freestyle around file naming.

When in doubt, extend an existing pattern instead of inventing a new one.

---

## First Decision Filter

Before creating code, determine which bucket the problem belongs to.

### If the problem is server data
Use **TanStack Query**.

Examples:

- fetching lists
- fetching entity detail
- mutations
- invalidation
- background refresh
- pagination
- optimistic updates

### If the problem is client app state
Use **Zustand**.

Examples:

- sidebar state
- persisted preferences
- cross-route filters
- wizard progress
- selected IDs
- client-only draft state

### If the problem is local screen state
Use **React local state**.

Examples:

- dialog open state
- tabs
- inline edit mode
- temporary input state
- view toggles local to one screen

### If the problem is a reusable UI composition
Use `components/app`.

Examples:

- page shells
- consistent tables
- form field wrappers
- empty/error/loading states
- confirm dialogs

### If the problem is a primitive UI element
Use `components/ui`.

Examples:

- button
- input
- dialog primitive
- select
- tooltip

---

## Allowed Architectural Patterns

### Data access

Approved path:

`component/page -> feature hook/query options -> feature api file -> lib/api/client`

Never:

`component -> fetch`

### UI composition

Approved path:

`feature component -> components/app -> components/ui`

Never:

- business logic inside `components/ui`
- repeated custom composition of the same pattern in multiple features

### State

Approved path:

- backend data = TanStack Query
- client shared state = Zustand
- screen-local state = `useState` / `useReducer`

Never:

- API payloads copied into Zustand as the main source of truth
- all form state in Zustand by default
- ad hoc app-wide React contexts replacing stores

---

## Folder Placement Rules

### `src/app/`
Only app composition belongs here.

Allowed:

- providers
- router setup
- app shells
- top-level pages like not found

Not allowed:

- domain business logic
- feature-specific data mapping
- API calls

### `src/components/ui/`
This is the shadcn primitive layer.

Allowed:

- shadcn-generated primitives
- minimal low-level adaptation when necessary

Not allowed:

- business logic
- feature logic
- query hooks
- app-specific hacks

### `src/components/app/`
This is the app-level reusable UI layer.

Allowed:

- reusable composition patterns
- wrappers around primitives
- consistent shells and states

Examples:

- `app-page.tsx`
- `app-card.tsx`
- `app-table.tsx`
- `app-form-field.tsx`
- `app-confirm-dialog.tsx`

### `src/features/<feature>/`
This is where domain code lives.

Allowed:

- API wrappers
- feature components
- feature hooks
- schemas
- feature-local client stores
- types
- feature utilities

### `src/lib/`
Cross-feature infrastructure only.

Allowed:

- API client
- query client
- shared stores
- low-level utils
- constants

Not allowed:

- feature/domain-specific logic

---

## File and Naming Rules

### General

- file names are **kebab-case**
- component names are **PascalCase**
- hooks start with `use`
- prefer named exports
- avoid default exports in normal feature code

### Approved suffixes

- stores: `.store.ts`
- reducers: `.reducer.ts`
- schemas: `.schema.ts`
- types: `.types.ts`
- query keys: `.keys.ts`
- query options: `.query-options.ts`

### Approved API file style

Use verb-based file names:

- `get-project.ts`
- `get-projects.ts`
- `create-project.ts`
- `update-project.ts`
- `delete-project.ts`

Never use vague names like:

- `api.ts`
- `service.ts`
- `helpers.ts`
- `state.ts`
- `common.ts`

---

## Import Preference Order

When writing feature code, import in this preference order:

1. existing feature-local component or hook
2. `components/app`
3. `components/ui`
4. create a new reusable wrapper only if repetition is real

Do not jump straight to raw primitives if a wrapper already exists.

---

## Rules for shadcn/ui

shadcn is the primitive UI layer, not the final design system.

### Agents must

- prefer existing wrappers before raw primitives
- keep `components/ui` low-level
- use design tokens and approved layout patterns

### Agents must not

- place API logic in shadcn components
- add feature-specific state in shadcn components
- create duplicate versions of the same app pattern
- use arbitrary raw colors, spacing, shadows, or radii without approval

### Patterns that should be reused, not reinvented

- page shell
- section shell
- card layout
- toolbar
- table shell
- form field shell
- empty state
- loading state
- error state
- confirm dialog
- status badge

---

## Rules for Zustand

Zustand is for client-side shared app state only.

### Good uses

- nav shell state
- theme or density preference
- client-side feature filters that persist across navigation
- wizard steps
- selected IDs
- draft state that never came from the API

### Bad uses

- entity lists from API
- entity detail payloads from API
- mutation results as the source of truth
- giant catch-all global store
- default storage for all form fields

### Store placement

App-wide store:

- `src/lib/store/<name>.store.ts`

Feature-limited store:

- `src/features/<feature>/store/<feature>-ui.store.ts`

### Store rules

- stores must expose named actions
- components must select only what they need
- persistence must be minimal
- do not create a store unless local state is no longer clean

---

## Rules for TanStack Query

Use TanStack Query for anything sourced from the backend.

### Agents must

- keep query files near the feature
- use feature-specific key files
- use query option builders where appropriate
- invalidate precisely

### Agents must not

- duplicate query keys ad hoc across the codebase
- fetch directly in components
- reimplement caching in Zustand

---

## Rules for Forms

Use one approved form strategy only.

Default structure:

- schema in `schemas/`
- form component in `components/`
- reusable field composition in `components/app`

Do not put whole form state in Zustand unless the form is multi-step, cross-route, and clearly client-driven.

---

## Rules for Route Files

Route files must stay thin.

They may:

- compose feature components
- read route params/search params
- connect route-level guards/loaders if approved by the router choice

They may not:

- implement feature business logic
- own API code
- become giant page controllers

---

## Rules for Creating New Reusable Code

Before creating a new reusable component, hook, utility, or store, check:

1. Does something equivalent already exist?
2. Is repetition real, or am I abstracting too early?
3. Does the new item belong in a feature or at app level?
4. Is the name specific and honest?
5. Does this follow the approved pattern for the problem type?

If the answer is unclear, keep the code local to the feature until reuse is proven.

---

## Anti-Patterns

Do not do these:

- put domain logic in `app/`
- put app logic in `components/ui`
- create `global-state.ts`
- create `helpers.ts`
- mix server-state and client-state responsibilities
- wrap everything in Context because it feels simple
- create multiple table/form/dialog patterns for the same product need
- bypass tokens with random style values
- create a second API access pattern

---

## What To Do Before Opening a PR

Check all of the following:

- no direct fetch in components
- no new state pattern introduced
- no new generic file names introduced
- no duplicate UI pattern created
- no server data stored in Zustand by default
- no business logic added to `components/ui`
- file placement matches the architecture rules
- names match conventions

---

## Default Behavior When Unsure

When unsure:

- keep logic inside the feature
- prefer a smaller change
- prefer local state over new global state
- prefer existing app wrappers over raw primitives
- prefer explicit boring code over clever abstractions

This repository values predictability over cleverness.
