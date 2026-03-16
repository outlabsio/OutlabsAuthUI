# ROUTING\_RULES.md

## Purpose

This document defines the routing rules for the frontend.

The goal is to keep route structure, route files, and URL state predictable. A router should make navigation and location state clearer, not become a second application architecture hidden inside route files.

This repo uses **TanStack Router** for SPA routing.

---

## Core Principles

1. **TanStack Router owns location state.**
2. **TanStack Router does not own server-state caching.**
3. **Route files stay thin.**
4. **Feature code owns domain logic.**
5. **URL state should be intentional and typed.**
6. **One route tree convention must be used across the repo.**
7. **Routing should improve clarity, not add hidden architecture.**

---

## What The Router Owns

TanStack Router owns:

- route tree structure
- path params
- search params
- navigation
- route matching
- route-level layout composition
- route-level guards
- route context when truly route-related
- linkability and browser history behavior

TanStack Router does **not** own:

- backend data as the source of truth
- mutation lifecycle
- Query cache ownership
- generic client UI state
- domain-specific business logic

That boundary is hard.

---

## Router Boundary Rules

### Router vs Query

**Router owns location state.** **Query owns server state.**

Examples:

- `projectId` in the URL → Router
- `page`, `sort`, `status`, `search` in the URL → Router
- fetch projects using those values → Query
- invalidate project data after mutation → Query

Do not let route files become the main backend data layer.

### Router vs Zustand

**Router owns URL-backed state.** **Zustand owns client-only shared state.**

Examples:

- sidebar open state → Zustand
- deep-linkable tab selection → Router
- density preference → Zustand
- shareable filter state → Router

Do not duplicate URL state into Zustand without a real reason.

### Router vs local state

**Router owns linkable/navigation state.** **React local state owns ephemeral screen-local state.**

Examples:

- dialog open state → local state
- popover state → local state
- current page section anchor or tab if shareable/bookmarkable → Router

---

## Route Tree Structure

The canonical route structure lives under:

```txt
src/app/router/
  index.tsx
  route-tree.gen.ts
  routes/
```

### Canonical route tree example

```txt
src/app/router/routes/
  __root.tsx
  index.tsx
  auth/
    login.tsx
  app/
    dashboard.tsx
    projects.index.tsx
    projects.$projectId.tsx
    settings.tsx
```

This structure is the default. Do not invent alternative route-tree layouts without a deliberate architectural decision.

---

## Route File Naming Rules

Route file names must follow the router convention consistently.

Examples:

- `__root.tsx`
- `index.tsx`
- `auth/login.tsx`
- `app/dashboard.tsx`
- `app/projects.index.tsx`
- `app/projects.$projectId.tsx`
- `app/settings.tsx`

### Rules

1. Dynamic path params must be obvious in the file name.
2. Index routes must use the index route convention consistently.
3. Do not invent custom route naming schemes.
4. Route file names are routing artifacts, not general component names.

### Dynamic route rule

If the route depends on a path param, the param must be explicit in the route file naming.

Example:

- `projects.$projectId.tsx`

---

## Route File Responsibilities

Route files exist to connect the router to feature code. They are not feature god-files.

### Route files may

- read path params
- read and write search params
- assemble layout shells
- compose feature components
- wire route guards
- perform lightweight route-level composition
- pre-read route context when clearly needed

### Route files may not

- define raw HTTP calls inline
- own feature query key definitions
- own feature request functions
- own business/domain mapping logic
- become giant controller files
- duplicate logic already available in feature hooks/components

### Thin-route rule

A route file should usually do one or more of these:

- get params/search params
- pass them to feature components/hooks
- apply route shell/layout
- render the correct feature composition

If it is doing much more than that, it is probably too fat.

---

## Route Files vs Page Components

A route file and a page component are not always the same thing.

### Use route files for

- route definition
- route composition
- lightweight route wiring

### Use separate page components when

- the page composition is large enough to deserve its own file
- the route file would otherwise become noisy
- the route should remain minimal and mostly declarative

### Naming convention for page-level components

If extracted, use `-page` suffix.

Examples:

- `projects-page.tsx`
- `project-detail-page.tsx`
- `settings-page.tsx`

The page component should still live in the correct layer, usually the relevant feature or `app/pages` for root-level special pages.

---

## Search Param Rules

Search params are the primary way to express shareable URL-driven state.

### Good uses for search params

- pagination
- sorting
- table/list filters
- search text when it should be shareable
- selected tab when it should be deep-linkable
- view mode when it affects the navigable page state

### Bad uses for search params

- modal open state for normal ephemeral dialogs
- every transient UI control state
- ordinary create/edit form field values
- temporary hover/open/focus interactions

### Search param rule

Use search params when the state should be:

- bookmarkable
- shareable
- reload-stable
- back-button aware

If not, it probably should not be in the URL.

### Search param ownership rule

If search params control which dataset is shown, then:

- Router owns the params
- Query uses those params to fetch/cache the correct data

Example:

- `page`, `sort`, `status` in search params → Router
- `getProjects({ page, sort, status })` → Query request function

### Validation rule

Search params should be typed and validated consistently. Do not treat them as unstructured strings throughout the app.

---

## Path Param Rules

Path params identify route-level resources.

### Good uses for path params

- entity detail identity
- nested resource identity
- workspace/org/project IDs when part of the route structure

Examples:

- `/projects/$projectId`
- `/workspaces/$workspaceId/projects/$projectId`

### Rules

1. Path params should represent navigational identity, not arbitrary UI state.
2. Path params should be passed into feature Query flows explicitly.
3. Do not duplicate path params into client stores without reason.

---

## Route Context Rules

Route context is allowed, but it must stay narrow.

### Good route context uses

- auth/access context needed by route guards
- navigation-level context
- workspace/org context that is truly route-scoped
- injected app/router dependencies if the routing system requires them cleanly

### Bad route context uses

- storing fetched backend entity data as long-lived context
- replacing Query with route context
- using route context as a hidden global store

### Rule

Route context should remain about routing/composition concerns, not generic app state ownership.

---

## Guard Rules

Guards are allowed for routing/access control.

### Guards may do

- prevent access to authenticated routes
- redirect unauthenticated users
- redirect users away from routes they should not see
- enforce route-level access requirements

### Guards may not do

- become a generic business rules engine
- perform broad backend data orchestration that belongs in Query/feature code
- become the main auth/session state owner

### Auth split

- Router owns protected-route behavior
- Query owns fetched session/current-user data
- API layer owns token/credential handling
- UI reacts through approved flows

That split must remain clear.

---

## Layout Route Rules

Route-level layouts should be used to structure the route tree clearly.

### Good uses

- app-auth split
- public vs authenticated shells
- nested route layout groupings
- persistent route shell elements tied to navigation structure

### Rules

- layouts should focus on structure
- layouts should not become feature data owners
- layouts should not hide domain-specific orchestration

### Example

- `app-shell.tsx` for authenticated app shell
- `auth-shell.tsx` for auth area

---

## Navigation Rules

Navigation should use the router as the single navigation system.

### Rules

1. Use router-aware navigation APIs consistently.
2. Links should express route intent clearly.
3. Do not construct app URLs by hand all over the codebase if route helpers or typed route usage are available.
4. Navigation side effects after mutations should remain explicit.

### Good navigation uses

- route-aware links in navigation menus
- explicit redirects after successful create/update flows when needed
- route param-driven detail navigation

### Bad navigation uses

- ad hoc string concatenation for many route URLs
- route assumptions buried in feature utilities with no central route understanding

---

## Route Constants vs Route Ownership

The app may keep route constants/helpers in `lib/constants/routes.ts` when useful.

### Rules

- route constants must support router clarity, not fight the route tree
- do not create a second route naming system that drifts from the actual router structure
- file-based route ownership still wins over generic route string dumping

---

## Prefetch and Loader Rules

TanStack Router can help with preloading and route-level data concerns, but this repo keeps a strict boundary.

### Rule

Do not let route loaders become the main data-fetching pattern.

### Allowed uses

- lightweight route-level preparation when truly needed
- router-assisted navigation/perceived performance improvements
- wiring Query prefetch flows if explicitly useful

### Disallowed uses

- replacing feature query option builders with route-defined fetch logic
- duplicating backend access patterns between route files and feature API/query files
- creating a second caching philosophy in routes

### Preferred pattern

If route-level prefetch is needed, it should still reuse feature-owned Query request/query option definitions.

---

## URL State Design Rules

Not all state belongs in the URL.

### Put state in the URL when

- it changes the current navigable view
- it should be shareable
- it should survive refresh/back-forward
- users benefit from deep linking

### Keep state out of the URL when

- it is ephemeral
- it is purely presentation-local
- it would make the URL noisy with no user value
- it does not represent meaningful view identity

### Examples

Good in URL:

- `page=2`
- `sort=updatedAt-desc`
- `status=active`
- `tab=members`

Usually bad in URL:

- `dialogOpen=true`
- `hoverRow=7`
- `draftInput=abc`
- local accordion expansion state

---

## Route-Driven Feature Pattern

The canonical pattern is:

1. route reads params/search params
2. route passes them into feature composition
3. feature query logic uses those values via Query
4. feature renders domain UI

### Example: project detail

- Router owns `projectId`
- route file reads `projectId`
- feature uses `projectId` in Query options
- feature renders the project detail page

### Example: projects list

- Router owns `page`, `sort`, `status`, `search`
- route/search-param hook exposes those values
- Query uses them in `projectListQueryOptions`
- feature renders the list/table

This is the approved shape.

---

## Error Handling in Routes

Routes should not become a custom error handling layer for all backend flows.

### Rules

- route-level not-found/forbidden handling is allowed
- feature-level data errors should usually stay with the feature/query layer
- do not invent per-route bespoke transport parsing logic

### Root/special pages

Root-level special pages may live in `app/pages/`.

Examples:

- `not-found-page.tsx`
- `forbidden-page.tsx`

---

## Route File Size Rule

If a route file starts accumulating:

- many local helper functions
- data transformation logic
- submit/mutation logic
- large JSX layout trees
- multiple unrelated concerns

then extract the page composition or feature logic out.

The route file should return to being a thin connector.

---

## Anti-Patterns

These are routing architecture violations:

- route files doing raw HTTP
- route loaders replacing Query as the server-state system
- search params duplicated into Zustand by default
- path params copied into stores with no reason
- route context used as a hidden global store
- feature business logic moved into routes
- giant route/controller files
- URLs manually assembled everywhere with inconsistent patterns
- ephemeral UI state shoved into the URL with no real value

---

## Review Checklist

Before adding or changing routing code, check:

- is this state truly route/location state?
- should this live in the URL or remain local/client-only?
- is the route file still thin?
- am I delegating backend data ownership to Query?
- am I delegating domain logic to the feature layer?
- am I duplicating search/path params into stores without need?
- is route naming consistent with the route tree convention?
- is route context staying narrow and routing-related?

---

## Default Decision Summary

### Use TanStack Router when

- you need route tree structure
- you need typed path params
- you need typed search params
- state should be bookmarkable/shareable/back-button aware
- route guards or nested layouts are needed

### Use TanStack Query with Router when

- URL state determines what backend data should be fetched
- route params identify the resource to load
- filtered/sorted/paginated views are URL-driven

### Use Zustand instead when

- state is shared client-only UI state
- state should not be in the URL
- no routing identity is involved

### Use local state instead when

- state is ephemeral and local to one screen/component tree
- it should not survive reload/share/back-forward navigation

---

## Final Rule

The router should make the app easier to reason about.

That means:

- one route tree convention
- thin route files
- typed URL state
- clear route/query boundary
- no hidden second data layer

If routing starts feeling like a second framework inside the app, the boundaries have already slipped.

