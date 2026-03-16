# ARCHITECTURE.md

## Purpose

This document defines the frontend architecture for this repository.

The goal is not flexibility. The goal is predictability, consistency, and low-friction maintenance for both humans and AI agents.

This architecture is intentionally opinionated.

---

## Locked Scope

This frontend is always a **SPA**.

Hard constraints:

- no SSR
- no RSC
- no server functions
- no frontend-owned backend logic
- no Next.js assumptions
- backend is always a separate system

Backend responsibilities stay on the backend. Frontend responsibilities are limited to:

- routing
- auth/session handling on the client
- data fetching and caching
- UI rendering
- client-side interaction state
- forms and validation
- API integration

---

## Locked Stack

- Vite
- React
- TypeScript
- Tailwind
- shadcn/ui
- TanStack Router
- TanStack Query
- Zustand
- Bun

This stack is the default. New libraries should not be introduced unless the existing stack clearly cannot solve the problem.
Bun is the only approved package manager for installs and scripts. Do not mix `npm`, `pnpm`, or `yarn` usage into the repo.

---

## Architecture Principles

1. **Server state is not client state.**
2. **Routing is not data ownership.**
3. **shadcn/ui is the primitive layer, not the product design system.**
4. **Feature code must be boring and easy to place.**
5. **Every common problem has one approved pattern.**
6. **Agents should extend patterns, not invent new ones.**
7. **Cross-feature abstractions must be earned, not guessed.**

---

## High-Level Architecture

The repo is organized into four main layers:

- `app/` → app composition
- `components/` → reusable UI building blocks
- `features/` → domain logic
- `lib/` → shared infrastructure

### Layer summary

#### `app/`

Owns:

- app bootstrap
- providers
- router setup
- layouts
- root pages

Does not own:

- feature/domain logic
- API definitions
- reusable domain components

#### `components/`

Owns:

- primitive UI (`components/ui`)
- app-level reusable UI compositions (`components/app`)

Does not own:

- API logic
- backend data ownership
- feature business logic

#### `features/`

Owns:

- domain-specific API wrappers
- domain components
- domain hooks
- domain schemas
- domain types
- feature-local client state
- mapping between backend data and UI needs

This is the main layer where product logic lives.

#### `lib/`

Owns:

- API client
- query client
- app-wide stores
- low-level utility functions
- shared constants

Does not own:

- feature-specific business rules
- page-specific logic

---

## Routing Architecture

The router is **TanStack Router**.

TanStack Router is used for:

- route structure
- route tree organization
- route params
- search params / URL state
- navigation
- route guards and route-level composition
- route context when required

### Router boundary rules

TanStack Router is **not** the server-state layer.

That means:

- route loaders must not become the main backend data pattern
- route files must not replace feature query hooks
- route files must stay thin
- route-level concerns stay route-level

Use TanStack Router for:

- reading route params
- reading/writing validated search params
- route guards
- route layout composition
- navigation and linking
- keeping filter/sort/pagination state in the URL when appropriate

Do not use TanStack Router as the primary place for:

- long-lived server data caching
- mutation ownership
- query invalidation
- application-wide backend state management

### Router vs Query boundary

**TanStack Router owns location.** **TanStack Query owns backend data.**

That boundary is hard.

Examples:

- URL page number, sort, filters → TanStack Router search params
- actual list data for that page/filter → TanStack Query
- route param `projectId` → TanStack Router
- fetch project by `projectId` → TanStack Query

This separation prevents route files from turning into an ad hoc data layer.

---

## Data Architecture

### TanStack Query is the server-state layer

Use TanStack Query for:

- fetching backend data
- caching backend data
- mutation state
- invalidation
- optimistic updates
- pagination/infinite queries
- background refresh/refetch

Do not move backend responses into Zustand as the main source of truth.

Feature code should own its own query keys and query options.

Canonical path:

`route/page -> feature hook/component -> feature api/query files -> lib/api/client`

Never:

`route/component -> fetch`

### API access pattern

All HTTP goes through `src/lib/api/client.ts`.

Feature API files live in `src/features/<feature>/api/`.

Use verb-based file names:

- `get-project.ts`
- `get-projects.ts`
- `create-project.ts`
- `update-project.ts`
- `delete-project.ts`

Each feature owns:

- request functions
- query keys
- query options
- mapping from backend models to UI models when needed

---

## Client State Architecture

### Zustand is the client shared-state layer

Use Zustand only for client-only shared state.

Good uses:

- nav shell state
- sidebar / drawer state
- persisted preferences
- cross-route UI mode
- selected client-side entities/IDs
- wizard progress
- feature-local client state shared across many children

Bad uses:

- entity list payloads from the backend
- entity detail payloads from the backend
- replacing TanStack Query
- storing all form fields by default
- one catch-all app store for everything

### Local React state

Use local React state for:

- dialog open/close
- tabs
- inline editing
- temporary inputs
- page-local toggles

Use `useReducer` when local state transitions become complex.

If state does not need to survive navigation and does not need cross-component sharing beyond a small subtree, keep it local.

---

## UI Architecture

### shadcn/ui role

shadcn/ui is the primitive layer. It is not the final app design system.

That means:

- `components/ui` contains low-level primitives
- `components/app` contains approved reusable product UI compositions
- `features/*/components` contains domain-specific components

### UI composition hierarchy

Preferred order:

1. existing feature component
2. `components/app`
3. `components/ui`
4. create a new wrapper only if reuse is real

Do not repeatedly recompose raw primitives in different ways across the app when a reusable app pattern should exist.

### Base app-level wrappers

These should exist early and be reused heavily:

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

This layer is what stops shadcn sprawl.

---

## Styling Architecture

### Styling stack

- Tailwind for utility styling
- design tokens in shared styles
- shadcn/ui primitives styled through the shared token system

### Rules

- no raw hex colors in feature code
- no random spacing systems per page
- no arbitrary shadows or radii unless explicitly approved
- no inline style objects for normal UI work
- no visual one-offs when an existing layout pattern should be reused

The visual system must be driven by shared tokens and reusable wrappers.

---

## Feature Architecture

Every feature is the default home for its own domain code.

Canonical feature structure:

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

Not every feature needs every folder, but placement must remain consistent.

### Feature ownership rules

A feature owns:

- how its backend data is fetched
- how its domain entities are mapped for the UI
- its domain components
- its domain hooks
- its schemas and types
- feature-local client state if needed

A feature does not own:

- app shell concerns
- global styling tokens
- low-level shared infra

---

## Naming Philosophy

The naming rule is simple:

**files are named by exact purpose, not vague category.**

Good:

- `get-projects.ts`
- `project-table.tsx`
- `project-ui.store.ts`
- `project.schema.ts`

Bad:

- `helpers.ts`
- `common.ts`
- `state.ts`
- `service.ts`
- `utils.ts`

Vague names are where architecture quality starts to rot.

---

## Reuse and Promotion Rules

Do not promote code to a shared layer too early.

### Keep code inside a feature when

- it is only used by that feature
- reuse is still speculative
- the abstraction would be vague

### Promote code to `components/app` when

- the same UI composition is repeated across features
- the pattern is part of the product’s design language
- the abstraction is concrete and stable

### Promote code to `lib/` when

- it is truly cross-feature infrastructure
- it is not domain-specific
- it has a clear and narrow purpose

---

## Anti-Patterns

The following are architecture violations:

- route files becoming data/controller god-files
- route loaders becoming a second server-state system
- storing server data in Zustand by default
- putting business logic into `components/ui`
- putting domain logic into `app/`
- generic catch-all files like `helpers.ts` or `state.ts`
- multiple competing patterns for tables/forms/dialogs
- introducing a new library before exhausting the locked stack

---

## Decision Summary

### TanStack Router

Use for:

- route structure
- params
- search params
- route guards
- URL state
- navigation

Do not use as the primary server-state/data layer.

### TanStack Query

Use for:

- all backend data fetching
- caching
- mutations
- invalidation
- async backend state lifecycle

### Zustand

Use for:

- client-only shared state
- persisted UI preferences
- cross-route UI state

Do not use for backend data ownership.

### shadcn/ui

Use for:

- primitive reusable UI building blocks

Do not mistake it for the final app design system.

### `components/app`

Use for:

- approved app-level UI compositions
- the reusable product-facing design layer

---

## Final Rule

This codebase prefers:

- explicit over clever
- boring over magical
- local over global
- feature ownership over random shared abstractions
- one approved pattern over many almost-equivalent ones

That is intentional.
