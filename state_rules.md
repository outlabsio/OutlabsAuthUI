# STATE\_RULES.md

## Purpose

This document defines the approved state management rules for the frontend.

The goal is to eliminate ambiguity around state ownership. Most frontend spaghetti starts when different state types are mixed together or the same problem is solved with multiple patterns.

This repo uses four distinct state lanes:

1. **TanStack Router** for location state
2. **TanStack Query** for server state
3. **Zustand** for client-only shared state
4. **React local state** for screen-local state

These lanes are deliberately separate. Do not blur them.

---

## Locked State Model

### Lane 1: Location state

Owned by **TanStack Router**.

Examples:

- route params
- search params
- current route
- URL-driven page number
- URL-driven sorting
- URL-driven filters
- active tab when the tab should be shareable/bookmarkable

### Lane 2: Server state

Owned by **TanStack Query**.

Examples:

- fetched entity lists
- fetched entity detail
- async loading/error/success lifecycle
- mutation state
- background refresh
- cache invalidation
- paginated and infinite data

### Lane 3: Client shared state

Owned by **Zustand**.

Examples:

- sidebar open state
- command palette open state
- density/theme preferences
- selected items when purely client-side
- multi-step wizard progress
- feature UI state shared across many components
- draft state that never came from the backend

### Lane 4: Local screen state

Owned by **React** (`useState` / `useReducer`).

Examples:

- dialog open state
- inline edit mode
- temporary local filters before applying
- temporary input state
- page-only toggle state
- component-local expansion/collapse

---

## Core Rule

Each piece of state must have **one clear owner**.

If multiple systems are managing the same thing, the architecture is wrong.

Examples of correct ownership:

- `projectId` from URL → TanStack Router
- fetched project data → TanStack Query
- sidebar collapsed state → Zustand
- open state of one local dialog → `useState`

Examples of broken ownership:

- `projectId` duplicated in Router and Zustand
- fetched project detail copied into Zustand as primary data
- form field state stored in local state, Zustand, and URL at the same time
- route file loader and Query both trying to own the same backend cache lifecycle

---

## State Decision Order

When adding state, decide in this order:

### 1. Is this location state?

If the answer is yes, use **TanStack Router**.

Questions:

- should this be bookmarkable?
- should this survive reload/share/back-forward navigation?
- is this fundamentally part of the page URL?

If yes, use route params or search params.

### 2. Is this backend data?

If yes, use **TanStack Query**.

Questions:

- does this come from the API?
- does caching matter?
- do retries/loading/error states matter?
- does invalidation matter?

If yes, it belongs to Query.

### 3. Is this client-only state shared beyond one small subtree?

If yes, consider **Zustand**.

Questions:

- does this need to survive route changes?
- is it shared by many components?
- is local state no longer clean?
- is this not backend data?

If yes, Zustand may be correct.

### 4. Is this local to one page or component?

If yes, use **React local state**.

Questions:

- is the state only used here?
- does it not need URL ownership?
- does it not need cross-route persistence?
- is it not backend data?

If yes, keep it local.

---

## TanStack Router Rules

TanStack Router owns **location state**. It does not own server data.

### Router owns

- path params
- search params
- route transitions
- route-level guards
- route structure
- route context when truly route-related

### Router does not own

- backend data caching
- mutation lifecycle
- entity data source of truth
- generic client shared UI state

### Approved Router use cases

- page, sort, search, filters in the URL
- active tab in the URL
- selected detail view by route param
- route-based auth/access boundaries
- workspace/org selection when it is part of navigation context

### Router anti-patterns

Bad:

- using route loaders as the main replacement for TanStack Query
- storing long-lived backend data in route context
- treating route files as controller classes
- duplicating route/search state into Zustand without a reason

### URL state rule

If a state value should be:

- linkable
- shareable
- reload-stable
- back-button aware

then it should usually live in **TanStack Router search params or route params**, not Zustand.

Examples:

Good:

- table pagination page in URL
- table sort in URL
- filter chips in URL when users may share filtered views
- selected tab in URL for deep linking

Bad:

- hiding all of that in Zustand and losing linkability

---

## TanStack Query Rules

TanStack Query owns **server state**.

### Query owns

- API reads
- API write lifecycle
- async loading/error/success state
- cache invalidation
- refetch rules
- optimistic updates
- pagination / infinite query state tied to backend data

### Query does not own

- sidebar state
- theme/density preferences
- modal open state
- generic client-only wizard state
- route/search params

### Hard rules

1. All backend data belongs to Query unless there is a documented exception.
2. Do not move API responses into Zustand as primary ownership.
3. Do not fetch directly inside presentational components.
4. Query keys belong to the owning feature.
5. Query option builders belong to the owning feature.
6. Route files should compose feature queries, not duplicate them.

### Query file structure

```txt
features/<feature>/api/
  get-<item>.ts
  get-<items>.ts
  create-<item>.ts
  update-<item>.ts
  delete-<item>.ts
  <feature>.keys.ts
  <feature>.query-options.ts
```

### Query ownership examples

Good:

- `projectId` from route param
- `useSuspenseQuery(projectQueryOptions(projectId))`
- mutation invalidates `projectKeys.detail(projectId)`

Bad:

- fetch project in route file directly
- copy result into Zustand store
- render from Zustand instead of Query cache

### Query key rule

Each feature owns its own query key factory. Do not create one giant global query key file.

Example:

```ts
export const projectKeys = {
  all: ['projects'] as const,
  list: (filters: ProjectFilters) => ['projects', 'list', filters] as const,
  detail: (projectId: string) => ['projects', 'detail', projectId] as const,
}
```

### Query + Router relationship

Use Router for URL state and Query for the actual data.

Example:

- `page`, `sort`, `status` from search params
- `getProjects({ page, sort, status })` via Query

Router decides *what view is requested*. Query decides *how server data for that view is fetched and cached*.

### Query anti-patterns

Bad:

- two components inventing different query keys for the same resource
- route files owning separate fetch logic from feature hooks
- putting retry/refetch/cache logic into Zustand
- using Query for purely local UI toggles

---

## Zustand Rules

Zustand owns **client-only shared state**. It is not a second backend cache.

### Allowed uses

- app shell state
- sidebar/mobile nav state
- command palette state
- persisted UI preferences
- view mode
- density
- local draft state that is not server-owned
- selection state across a feature
- wizard progress across steps
- feature-local UI state shared by many descendants

### Forbidden uses

- entity lists from the API as the main source of truth
- entity detail payloads from the API as the main source of truth
- mutation response ownership
- a catch-all app-wide mega-store
- storing every form field by default
- duplicating route/search params without a reason

### Placement rules

App-wide stores:

- `src/lib/store/*.store.ts`

Feature-limited stores:

- `src/features/<feature>/store/*.store.ts`

### Store naming rules

Use specific names only.

Good:

- `app-ui.store.ts`
- `preferences.store.ts`
- `project-ui.store.ts`
- `report-builder.store.ts`

Bad:

- `state.ts`
- `store.ts`
- `global-state.ts`
- `app.store.ts` with everything in it

### Store creation rule

A new Zustand store is allowed only when all are true:

1. the state is client-only
2. the state is shared beyond one small subtree
3. local React state is no longer clean
4. TanStack Router is not the right owner
5. TanStack Query is not the right owner

If those are not all true, do not create the store.

### Store shape rule

Stores must expose named actions. Do not export raw unstructured setters everywhere.

Good:

- `setSidebarOpen`
- `toggleCommandPalette`
- `setViewMode`
- `resetProjectFilters`
- `setSelectedProjectIds`

Bad:

- generic `setState`
- mutation logic spread into components
- direct state object replacement from all over the app

### Selector rule

Components must subscribe only to the smallest state they need. Do not subscribe to an entire store object if one field is needed.

Good:

- select `sidebarOpen`
- select `density`
- select `setViewMode`

Bad:

- `const store = useAppUiStore()` when only `sidebarOpen` is needed

### Persistence rule

Persist only minimal state that should survive reload.

Good candidates:

- theme
- density
- sidebar collapse
- preferred list/grid mode

Bad candidates:

- fetched entities
- giant working sets
- whole feature stores by default
- mutation results

### Slice rule

If an app-wide store begins to accumulate unrelated concerns, split it. Prefer a few small stores or clear slices over a giant blob.

---

## React Local State Rules

React local state is the default for **screen-local or component-local state**.

### Use `useState` for

- dialogs
- popovers
- tabs
- accordions
- inline edit toggles
- local draft inputs
- temporary view toggles
- local selection state inside one component tree

### Use `useReducer` for

- complex screen workflows
- multi-action local state transitions
- builder/editor state local to one route subtree
- local state machines that would otherwise become hard to reason about

### Do not escalate local state too early

A lot of state should stay local. Do not create a Zustand store just because multiple nested children need access. Try prop composition or a small local context/reducer first when the state is still route-local.

### Local state anti-patterns

Bad:

- creating app-wide stores for one modal
- moving one page’s open/close logic into Zustand
- putting ephemeral component state into URL without a reason

---

## Reducer Rules

Reducers are for **complex local state**, not app-wide state by default.

### Approved reducer use cases

- report builder UI
- complex filter builder before URL/apply sync
- editor state local to one page
- multi-step local workflow with many transitions

### Reducer file naming

Use `.reducer.ts`.

Examples:

- `project-editor.reducer.ts`
- `report-builder.reducer.ts`

### Reducer placement

- feature-local reducer → `features/<feature>/`
- reducer shared by only one page subtree → keep close to that feature/page

Do not create global reducer dumping grounds.

---

## State Synchronization Rules

Synchronization is where bugs explode. Keep synchronization explicit and minimal.

### Approved sync directions

#### Router → Query

Very common and correct.

Example:

- search params define filters
- filters feed query options
- query fetches the backend data

#### Query → UI render

Very common and correct.

Example:

- query returns projects
- UI renders projects directly from query result

#### Zustand → UI render

Correct for client-only shared state.

Example:

- preferences store defines density
- table/card layout reads density

### Dangerous sync directions

#### Query → Zustand

Usually wrong.

Allowed only if there is a documented, client-only derived need that cannot cleanly render from Query directly.

Even then, be suspicious.

#### Router → Zustand

Usually unnecessary.

Only do this if a client-only store needs a derived initialization from the URL once. Do not create two sources of truth.

#### Zustand → Router

Allowed only when intentionally pushing client state into the URL for shareability/navigation. This must be explicit.

### One source of truth rule

When synchronization exists, one layer must still remain the source of truth.

Good:

- source of truth = URL search params
- query derives from URL

Bad:

- URL and Zustand both treated as equal owners of filters

---

## Form State Rules

Form state is not automatically global state.

### Default rule

Keep form state inside the form layer unless there is a strong reason not to.

### Good form state placement

- field values inside the form hook/library
- local UI state with the form component
- validation in feature schema files

### Form state may enter Zustand only when

- the form spans multiple routes or steps
- draft persistence is a real requirement
- the state is clearly client-owned
- the form is not better handled by a dedicated local reducer/workflow

### Form state should not enter Query

Query owns backend communication, not the live local form input state.

### Form state should not enter Router by default

Only use URL params for form-related state when it truly benefits deep linking or view persistence.

---

## Auth and Session State Rules

Auth usually touches all four lanes, so boundaries matter.

### Router may own

- access boundaries
- redirect targets
- auth-required route rules

### Query may own

- fetched session/user data
- session refresh requests
- current-user profile data from the backend

### Zustand may own

- client shell state related to auth UI only if needed
- transient UI concerns around auth flows

### Do not duplicate session payloads

If session/user data is coming from the backend, Query should own it. Do not copy the session response into Zustand unless there is a narrowly documented reason.

---

## Examples

## Example 1: Project detail page

Correct ownership:

- `projectId` from route param → Router
- fetch project by `projectId` → Query
- page layout shell → `components/app`
- local edit dialog open state → `useState`

Wrong ownership:

- `projectId` copied into Zustand
- project detail payload stored in Zustand
- route file does raw fetch and bypasses feature query files

---

## Example 2: Projects table with filters and pagination

Correct ownership:

- `page`, `sort`, `status`, `search` in URL → Router search params
- rows data fetched with those values → Query
- density preference → Zustand
- column visibility for just this page → local state or feature store depending on reuse/sharing

Wrong ownership:

- table filters hidden in Zustand when they should be shareable in the URL
- rows copied from Query into Zustand
- sort state duplicated in both Router and local state

---

## Example 3: Multi-step client-side wizard

Correct ownership:

- current step and wizard progress → Zustand or reducer, depending on scope
- local per-step ephemeral UI → local state
- final submit mutation → Query
- route-based step in URL only if deep linking is required → Router

Wrong ownership:

- using Query to store draft wizard state
- pushing every wizard field into URL for no reason

---

## Example 4: Command palette

Correct ownership:

- open/close state → Zustand if global, `useState` if local
- search input → local state
- query-backed search results → Query
- route navigation target → Router

---

## Anti-Patterns

These are state architecture violations:

- backend lists/details stored in Zustand by default
- route files becoming the main data-fetching system
- URL params duplicated into stores without reason
- global stores for one-screen problems
- local modal open state promoted to app-wide store with no need
- form state scattered across Router, Query, Zustand, and local state simultaneously
- reducer/store/context created before proving local state is insufficient
- mutation responses copied into client stores instead of relying on invalidation/cache updates

---

## Escalation Rules

Before escalating state to a more global owner, ask:

### Escalating from local state to Router

Do users need:

- deep linking?
- bookmarkability?
- back-button support?
- shareable filtered views?

If yes, Router may be correct.

### Escalating from local state to Zustand

Do many components across a feature/app need this? Does it need to survive navigation? Is it still client-only?

If yes, Zustand may be correct.

### Escalating from local state to Query

Does it actually come from the backend or represent async backend lifecycle?

If yes, Query is correct.

### Escalating from Query to Zustand

Almost always no. Require a written reason.

---

## Default Decision Summary

### Use TanStack Router when

- the state is location/navigation state
- it should live in the URL
- it should survive reload/share/back-forward navigation

### Use TanStack Query when

- data comes from the backend
- caching/invalidation/loading state matter
- async lifecycle matters

### Use Zustand when

- state is client-only
- shared beyond one small subtree
- not route-owned
- not backend-owned

### Use local React state when

- state is local to one page/component tree
- persistence is not needed
- URL ownership is not needed
- shared global ownership is not needed

### Use `useReducer` when

- local state transitions are complex enough that `useState` becomes messy

---

## Final Rule

When unsure, choose the **narrowest correct owner**.

That usually means:

- local state before Zustand
- Query before copying API data into stores
- Router for URL state instead of hiding it in stores
- one owner only

State should move outward only when there is a real reason. Not because it feels cleaner in the moment.

