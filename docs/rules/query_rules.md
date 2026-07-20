# QUERY\_RULES.md

## Purpose

This document defines the approved TanStack Query usage patterns for the frontend.

The goal is to keep backend data fetching, caching, invalidation, and mutation behavior consistent across the app. Without hard rules, Query usage drifts fast: duplicate keys, random stale times, mutation side effects scattered through components, and inconsistent cache ownership.

This repo uses TanStack Query as the **only owner of server state**.

---

## Core Principles

1. **TanStack Query owns server state.**
2. **Query keys belong to the owning feature.**
3. **Request functions and Query config are separate concerns.**
4. **Route state and Query state are not the same thing.**
5. **Mutations must update or invalidate intentionally.**
6. **Defaults should be boring and centrally configured.**
7. **Do not improvise query patterns per screen.**

---

## What Query Owns

TanStack Query owns:

- backend reads
- backend write lifecycle
- loading/error/success state for backend calls
- cache freshness
- retries
- invalidation
- refetch behavior
- optimistic updates when used
- pagination/infinite query lifecycle tied to backend data

TanStack Query does **not** own:

- route params/search params
- sidebar state
- theme/preferences
- local modal open state
- generic client-only draft state

That boundary is hard.

---

## Query Ownership Model

The approved relationship is:

- **TanStack Router** owns URL/location state
- **TanStack Query** owns server state
- **Zustand** owns client-only shared state
- **React local state** owns screen-local state

### Example

Correct:

- `projectId` from route params → Router
- `page`, `sort`, `status` from search params → Router
- project detail/list data → Query
- table density preference → Zustand
- local dialog open state → `useState`

Wrong:

- query data copied into Zustand as the main source of truth
- route state duplicated into Query keys and local state inconsistently
- local UI toggle stored in Query

---

## Query File Structure

Each feature owns its own Query files.

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

### File responsibilities

#### `get-*.ts` / `create-*.ts` / etc.

Plain request functions. No Query hooks. No UI logic.

#### `<feature>.keys.ts`

Query key factory for that feature.

#### `<feature>.query-options.ts`

Reusable query option builders for that feature.

This split is required.

---

## Query Key Rules

Query keys are the identity layer for server state. If keys are sloppy, caching becomes sloppy.

### Key ownership

Each feature owns its own query keys.

Examples:

- `project.keys.ts`
- `auth.keys.ts`
- `user.keys.ts`

Do not create one global query key file for the whole app.

### Key structure rules

Keys must be:

- stable
- serializable
- hierarchical
- descriptive of resource identity

### Recommended pattern

```ts
export const projectKeys = {
  all: ['projects'] as const,
  lists: () => ['projects', 'list'] as const,
  list: (filters: ProjectFilters) => ['projects', 'list', filters] as const,
  details: () => ['projects', 'detail'] as const,
  detail: (projectId: string) => ['projects', 'detail', projectId] as const,
}
```

### Key rules

1. top-level segment should identify the domain resource
2. second-level segment should identify list/detail/subresource intent when needed
3. dynamic inputs must be included when they affect the data shape
4. use one canonical key pattern per feature
5. do not invent alternate key shapes for the same resource

### Bad keys

Bad:

- `['project', id]` in one place and `['projects', 'detail', id]` in another
- `['projects', filters, page, sort]` in one file and `['projects', 'list', { filters, page, sort }]` elsewhere
- vague keys like `['data']` or `['list']`

---

## Query Option Builder Rules

Reusable queries should be defined through option builders in `<feature>.query-options.ts`.

### Why

This keeps query configuration consistent across:

- route files
- feature hooks
- components
- prefetch flows
- tests

### Pattern

```ts
export function projectDetailQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: projectKeys.detail(projectId),
    queryFn: () => getProject(projectId),
  })
}
```

### Rules

- builder names should be explicit
- builder names should match resource intent
- reuse builders instead of repeating `queryKey` + `queryFn` inline across files

### Naming examples

- `projectDetailQueryOptions`
- `projectListQueryOptions`
- `currentSessionQueryOptions`

### Bad patterns

Bad:

- repeating inline query config in many screens
- hiding request logic and key construction in giant opaque helper functions

---

## Request Function vs Query Function Rule

A request function is not a Query hook. A Query hook is not a transport function.

### Correct split

- request function → calls shared API client
- query options → connect request function to Query identity/config
- component/hook → uses Query with those options

### Example

```ts
// get-project.ts
export async function getProject(projectId: string): Promise<Project> {
  return apiClient.get(`/projects/${projectId}`)
}
```

```ts
// project.query-options.ts
export function projectDetailQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: projectKeys.detail(projectId),
    queryFn: () => getProject(projectId),
  })
}
```

This separation makes testing, reuse, and cache reasoning cleaner.

---

## Default Query Configuration Rules

Global Query defaults belong in `lib/query/query-client.ts` and related query infra files.

### What belongs in global defaults

- default stale time
- retry policy
- refetch on window focus policy
- gc / cache timing policy
- suspense policy if used
- global mutation/query cache handlers if explicitly approved

### What does not belong in global defaults

- feature-specific stale times
- feature-specific retry logic
- feature-specific invalidation behavior
- route-specific assumptions

### Default philosophy

Defaults should be:

- conservative
- predictable
- not too clever
- easy to override explicitly when justified

---

## Stale Time Rules

Stale times control how eagerly Query considers data outdated.

### Rule

Start with shared sensible defaults. Override only when the data characteristics clearly justify it.

### Suggested philosophy

- fast-changing operational data → shorter stale time
- stable reference data → longer stale time
- current-user/session-like data → explicit deliberate choice

### Rules

- do not set random stale times per component
- do not use `Infinity` casually
- if a stale time differs from the default, it should be intentional and explainable

### Bad usage

Bad:

- arbitrary `staleTime: 13742`
- every list query using a different value for no reason
- using `Infinity` to hide invalidation problems

---

## Retry Rules

Retries belong to Query configuration.

### Rules

- keep retries consistent by default
- do not override per-query unless there is a real reason
- do not retry validation/business-rule failures blindly if the error type is known
- network/transient failures may justify retries

### Anti-pattern

Bad:

- every feature inventing its own retry behavior
- turning retries off everywhere because of one bad endpoint
- retrying actions that should fail fast and show a user-facing problem

---

## Refetch Rules

### Use refetch intentionally

Query already owns freshness behavior. Do not layer manual refetching everywhere without reason.

### Rules

- do not call manual refetch as a substitute for proper invalidation
- prefer invalidation after writes instead of random refetch chains
- refetch intervals/polling must be explicitly justified

### Polling rule

Polling is allowed only when the backend data genuinely needs periodic refresh. Document why in the feature if it is not obvious.

---

## Invalidation Rules

Invalidation is one of the easiest places to create chaos.

### Rule

Invalidate as narrowly as possible while still being correct.

### Good invalidation

- updating one project invalidates that project detail and any lists clearly affected
- deleting a project invalidates the relevant project lists and maybe detail if still mounted

### Bad invalidation

- invalidating everything after every mutation
- invalidating unrelated domains because it is easy
- failing to invalidate clearly impacted lists/details

### Pattern

Prefer feature-owned invalidation helpers or well-documented mutation handlers when invalidation logic is repeated.

### Example

Good:

- invalidate `projectKeys.detail(projectId)` after update
- invalidate `projectKeys.lists()` if the mutation affects list membership or visible fields

Bad:

- `invalidateQueries()` with overly broad filters unless absolutely necessary

---

## Cache Update vs Invalidation Rule

After a successful mutation, choose one of these intentionally:

1. **invalidate and refetch**
2. **directly update the cache**
3. **optimistic update with rollback path**

Do not mix approaches casually.

### Prefer invalidation when

- correctness matters more than instant perceived response
- the mutation affects more than one derived view
- the backend returns the canonical updated state via subsequent read

### Prefer direct cache update when

- the affected cache shape is simple and obvious
- the updated entity can be patched safely
- refetching would be unnecessarily wasteful and the behavior is very clear

### Prefer optimistic updates when

- the UX benefits materially from immediacy
- the rollback logic is clear
- the mutation failure mode is understood

### Anti-pattern

Bad:

- optimistically updating one cache and also broadly invalidating half the app without need
- patching caches in inconsistent ways across screens

---

## Mutation Rules

Mutations belong to TanStack Query.

### Mutation structure

Mutation flow should look like this:

- mutation calls a feature request function
- mutation handles success/error side effects explicitly
- mutation updates cache or invalidates intentionally
- UI responds through approved patterns

### Allowed side effects after success

- invalidate relevant queries
- patch cache deliberately
- navigate if required
- close dialog/sheet
- reset local form state
- show toast/notification through approved UI patterns

### Disallowed mutation patterns

- raw `fetch` in a button click handler
- mutation responses stored as long-lived truth in Zustand
- mutation side effects hidden inside shared transport code
- ad hoc cache updates spread across arbitrary components

### Mutation naming examples

- `useCreateProjectMutation`
- `useUpdateProjectMutation`
- `useDeleteProjectMutation`

If custom mutation hooks are created, keep them near the feature and keep the name honest.

---

## Optimistic Update Rules

Optimistic updates are allowed, but only when used deliberately.

### Requirements

Before adding an optimistic update, confirm:

1. the user benefit is real
2. the rollback path is clear
3. the cache(s) affected are known
4. failure behavior is acceptable

### Good optimistic use cases

- toggling a simple boolean flag
- reordering where the UI clearly benefits from immediacy
- lightweight status changes where rollback is straightforward

### Bad optimistic use cases

- complex workflows with many downstream derived lists/details
- cases where failure is common and rollback would be messy
- broad list/detail ecosystems that are hard to patch consistently

If in doubt, prefer invalidation.

---

## Pagination Rules

Pagination state often spans Router and Query.

### Ownership split

- current page / page size / sort / filters in URL when shareable → Router
- paginated backend data → Query

### Query rule

Pagination parameters must be part of the query key when they affect the dataset.

Good:

- `projectKeys.list({ page, pageSize, sort, filters })`

Bad:

- page changes but query key stays the same

### UX rule

When pagination is URL-owned, changing page/search params should naturally drive the correct Query cache identity.

### `keepPreviousData` rule

Every paginated/filterable list query option builder must set
`placeholderData: keepPreviousData`. This keeps the previous page's rows on
screen (instead of flashing a loading state) while the next page/filter
combination fetches.

```ts
export function getProjectsQueryOptions(filters: ProjectFilters) {
  return queryOptions({
    queryKey: projectKeys.list(filters),
    queryFn: ({ signal }) => getProjects(filters, { signal }),
    placeholderData: keepPreviousData,
  })
}
```

Pair this with `isPlaceholderData` in the UI (e.g. `AppDataTable`'s
`isPlaceholderData` prop) to show a subtle "refreshing" indicator instead of
a full loading skeleton. See `getUsersQueryOptions` in
`src/features/users/api/users.query-options.ts` for the reference pattern
already used across every paginated feature list in this repo.

### `AbortSignal` rule

Every request function must accept and forward an optional
`{ signal?: AbortSignal }` option, and every `queryFn` must pass Query's
`signal` through to it:

```ts
export async function getProjects(
  filters: ProjectFilters,
  options: { signal?: AbortSignal } = {}
) {
  return apiClient.get<ProjectsResponse>('/projects', { signal: options.signal })
}
```

```ts
queryFn: ({ signal }) => getProjects(filters, { signal }),
```

This lets Query cancel in-flight requests when a query is superseded (new
filters/page, unmount, etc.) instead of racing stale responses against fresh
ones. This is the default for every `get-*.ts` request function in this
repo - do not add a new one without it.

---

## Infinite Query Rules

Use infinite queries only when the UX is genuinely infinite-scroll based.

### Rules

- do not use infinite queries for normal paginated tables unless there is a real reason
- keep page param derivation explicit
- key shape should still reflect the dataset identity
- cursor/pageParam handling should be localized and clear

---

## Prefetch Rules

Prefetching is allowed when it improves real navigation or perceived latency.

### Good uses

- prefetch detail data for likely next navigation
- prefetch next page when user behavior strongly suggests it

### Rules

- use the same feature-owned query option builders
- do not invent separate hidden fetch logic for prefetching
- do not prefetch broadly without evidence it helps

---

## Custom Query Hook Rules

Custom Query hooks are allowed, but they must stay thin.

### Good custom hook role

A custom hook may:

- read Router params/search params
- call one or more feature query option builders
- package repeated feature-specific Query usage

### Bad custom hook role

A custom hook should not:

- become a god-hook mixing transport, cache logic, navigation, toasts, and UI state all together
- hide broad side effects unexpectedly
- duplicate request/query options logic already defined elsewhere

### Naming examples

- `useProjectDetailQuery`
- `useProjectListQuery`
- `useCurrentSessionQuery`

Keep names specific.

---

## Query Data Transformation Rules

### Prefer transformation near the boundary

If backend data needs normalization, do it near:

- request function mapping, or
- select/derived transformation when clearly appropriate

### Rules

- do not transform the same query result differently in many components
- do not leak raw transport weirdness everywhere
- if transformation is shared, centralize it near the feature

### `select` rule

Use Query `select` deliberately when it improves reuse or avoids repeated derived work. Do not hide major domain remapping in random inline `select` callbacks across screens.

---

## Router + Query Rules

TanStack Router and TanStack Query have a strict boundary.

### Router owns

- params
- search params
- route transitions
- location identity

### Query owns

- backend data cache identity and lifecycle

### Correct pattern

- Router gives `projectId`, `page`, `sort`, `filters`
- Query uses those values in keys and request functions
- UI renders Query results

### Incorrect pattern

- route loaders becoming the main data layer
- route files owning all caching rules
- URL values duplicated into Zustand for no reason

---

## Error Handling Rules in Queries

### Query should expose error state

Feature components decide how to render or react.

### Rules

- do not toast every query error globally by default
- do not let every component invent a different parser for the same backend error shape
- transport normalization belongs below Query
- UI reaction belongs above Query

### Mutation error rule

Mutation errors should be handled intentionally at the feature level. Do not hide them inside the transport layer.

---

## Suspense Rules

If suspense is used, use it deliberately and consistently.

### Rules

- do not mix suspense and non-suspense patterns arbitrarily for the same feature flow
- route/page boundaries should make suspense usage predictable
- fallback/loading UI should still use approved app patterns

If suspense is not a deliberate project-wide pattern yet, do not casually introduce it in isolated places.

---

## Query Anti-Patterns

These are violations:

- repeating the same query config inline in many files
- duplicate key shapes for the same resource
- random stale times and retry settings with no reason
- storing query results in Zustand as primary data ownership
- broad invalidation after every mutation
- using Query for local UI toggles
- route files bypassing feature query files
- giant god-hooks that hide fetch + transform + mutation + UI state together
- using `Infinity` or `enabled: false` as a band-aid for bad state ownership

---

## Review Checklist

Before adding or changing Query code, check:

- does the owning feature define the key?
- is the key stable and canonical?
- is a reusable query option builder needed?
- does Query clearly own the server-state lifecycle?
- is Router only providing location state, not duplicating ownership?
- is invalidation narrow and intentional?
- is this mutation handling success/error/cache effects explicitly?
- am I using Query for something that should be local state or Zustand?
- am I leaking backend data ownership into Zustand?

---

## Default Decision Summary

### Use Query when

- data comes from the backend
- async lifecycle matters
- caching/invalidation matters
- retries/refetch behavior matter

### Use Router with Query when

- URL state determines what data is being requested
- filters/sort/page/search should be shareable/bookmarkable

### Use Zustand instead when

- state is client-only and shared
- no backend cache ownership is needed

### Use local React state instead when

- state is local to one component/screen subtree
- no URL ownership or cross-route sharing is needed

---

## Final Rule

Query usage should feel repetitive in a good way:

- same key pattern style
- same query option builder pattern
- same mutation shape
- same invalidation philosophy
- same ownership boundary with Router and Zustand

If every feature uses Query differently, the repo is already drifting.

