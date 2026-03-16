# API\_INTEGRATION\_RULES.md

## Purpose

This document defines the rules for integrating the SPA frontend with the backend.

The goal is to make backend communication predictable, typed, and easy to reason about. This repo must not end up with random `fetch` calls scattered through components, inconsistent auth header handling, or different response/error conventions per feature.

The backend is always separate. The frontend is always a SPA.

---

## Core Principles

1. **The frontend does not own backend logic.**
2. **All HTTP goes through one shared client layer.**
3. **Feature folders own their backend integration surface.**
4. **TanStack Query owns async backend state.**
5. **Components do not fetch directly.**
6. **Backend models and UI models are not assumed to be identical.**
7. **Transport concerns and domain concerns must stay separated.**

---

## Backend Integration Layers

The backend integration path is:

`route/page -> feature hook/component -> feature api file -> lib/api/client`

This is the only approved path.

### Layer responsibilities

#### Route/page

May:

- read params/search params
- compose feature components
- pass route-derived values into feature hooks/components

May not:

- call raw HTTP
- define backend request logic inline
- own response parsing rules

#### Feature component/hook

May:

- call feature query hooks
- call feature mutation hooks
- coordinate feature-specific UI behavior around backend data

May not:

- bypass the feature API layer with direct HTTP
- invent a second transport layer

#### Feature API files

Own:

- request functions for that feature
- request/response typing for that feature
- query key definitions for that feature
- query option builders for that feature
- mapping from transport models to UI-facing models when needed

#### `lib/api/client.ts`

Owns:

- base request transport
- base URL handling
- auth header attachment
- shared request defaults
- shared response/error normalization at the transport layer

---

## Directory Structure

### Shared API infrastructure

```txt
src/lib/api/
  client.ts
  config.ts
  errors.ts
  auth-token.ts
```

### Feature-level API integration

```txt
src/features/<feature>/api/
  get-<item>.ts
  get-<items>.ts
  create-<item>.ts
  update-<item>.ts
  delete-<item>.ts
  <feature>.keys.ts
  <feature>.query-options.ts
```

This split is mandatory.

---

## Shared HTTP Client Rules

### All HTTP goes through `lib/api/client.ts`

Do not call `fetch` directly from:

- route files
- components
- hooks outside the API layer
- Zustand stores
- app-level wrappers

If the app uses `fetch`, `ky`, `axios`, or another HTTP library, it must be wrapped behind `lib/api/client.ts`.

### The client owns transport concerns only

Examples of transport concerns:

- base URL
- credentials mode
- headers
- auth token injection
- request timeout strategy if implemented
- generic JSON parsing
- transport-level error normalization

The client does **not** own:

- feature endpoints grouped into business domains
- query keys
- feature-specific response mapping
- UI-facing labels or transformations

### Client design goals

The shared client should be:

- thin
- boring
- typed
- easy to swap internals if needed
- not coupled to any one feature

---

## Feature API Rules

Each feature owns its own backend integration surface.

Examples:

```txt
features/projects/api/
  get-project.ts
  get-projects.ts
  create-project.ts
  update-project.ts
  delete-project.ts
  project.keys.ts
  project.query-options.ts
```

### Feature API files should do one thing

Good:

- `get-project.ts`
- `create-project.ts`
- `archive-project.ts`

Bad:

- `project-api.ts`
- `project-service.ts`
- `api.ts`

### Feature API file responsibilities

A feature API file may:

- call the shared client
- define request types
- define response types
- map the raw response if needed
- return the result to Query hooks/options

A feature API file may not:

- directly update UI state
- import app-level UI components
- contain routing logic
- contain unrelated feature actions

---

## Request Function Rules

### Naming

Use verb-based names.

Examples:

- `getProject`
- `getProjects`
- `createProject`
- `updateProject`
- `deleteProject`
- `archiveProject`

### Function behavior

Request functions should:

- take explicit typed input
- return typed output
- be narrowly scoped
- avoid hidden side effects

Good:

- `getProject(projectId: string)`
- `updateProject(input: UpdateProjectInput)`

Bad:

- `projectRequest(data: unknown)`
- `doProjectStuff()`

### Input rules

Prefer one explicit object parameter when the function has multiple inputs.

Good:

- `updateProject({ projectId, values })`
- `getProjects({ page, sort, filters })`

This makes extension safer and clearer.

---

## Request and Response Typing Rules

### Everything crossing the API boundary should be typed

That includes:

- request params
- request body
- response body
- normalized error shape

### Transport types vs UI types

Do not assume backend response models are the same as UI models.

Use separate types when needed:

- `ProjectResponse`
- `Project`
- `ProjectListItem`
- `ProjectFormValues`

### Mapping rule

If the backend shape is not ideal for rendering, map it near the feature API layer or feature utils. Do not leak awkward transport shape deep into presentational components.

Good:

- `mapProjectResponseToProject()`
- `mapProjectSummaryResponse()`

Bad:

- every component individually interpreting backend field names differently

### Validation rule

If runtime validation is needed for unstable or untrusted backend responses, validate at the boundary, not deep inside components.

---

## Query Integration Rules

TanStack Query is the only approved owner of async backend state lifecycle.

### Query owns

- loading state
- error state
- cache state
- stale/fresh lifecycle
- retries
- invalidation
- mutation lifecycle

### Feature API files and Query

Request functions are not Query hooks. Keep them separate.

Good split:

- `get-project.ts` → plain request function
- `project.query-options.ts` → Query option builder
- component/hook → uses Query with those options

Bad split:

- API files tightly hiding all Query usage in opaque patterns that make reuse difficult
- components calling raw HTTP without Query

---

## Query Key Rules

Each feature owns its own keys.

Use `<feature>.keys.ts`.

Example:

```ts
export const projectKeys = {
  all: ['projects'] as const,
  list: (filters: ProjectFilters) => ['projects', 'list', filters] as const,
  detail: (projectId: string) => ['projects', 'detail', projectId] as const,
}
```

### Query key rules

- keys must be stable
- keys must reflect resource identity clearly
- keys belong near the feature
- do not create a global dumping ground for all keys

---

## Query Option Builder Rules

Use `<feature>.query-options.ts` for reusable query option builders.

Examples:

- `project.query-options.ts`
- `auth.query-options.ts`

### Why this exists

It keeps query construction consistent across:

- route components
- feature hooks
- prefetch flows if needed
- tests

### Rule

If the same query setup will be reused, create a query option builder instead of repeating it inline.

---

## Mutation Rules

Mutations are backend writes and belong to Query.

### Mutation ownership

Mutations should:

- call a feature request function
- invalidate or update the correct Query cache
- keep success/error UI handling close to the feature

### Mutation anti-patterns

Bad:

- write mutation logic directly inside components with raw `fetch`
- store mutation response as long-lived source of truth in Zustand
- invent per-component mutation patterns

### Mutation side effects

Allowed side effects after success:

- invalidate relevant queries
- navigate if required
- close dialog/sheet
- reset local form state
- show toast/notification through approved UI pattern

These should still be explicit and not hidden inside transport utilities.

---

## Error Handling Rules

### Separate transport errors from domain/UI handling

#### Transport layer (`lib/api/errors.ts`)

Owns:

- normalized error object creation
- HTTP/network-level error classification
- auth/unauthorized transport error classification
- timeout/network parsing if implemented

#### Feature layer

Owns:

- deciding how the feature reacts
- inline error presentation
- message adaptation where necessary
- feature-specific retry affordances

### Do not do this

- toast every error automatically in the HTTP client
- hide all error handling inside transport utilities
- let every component invent its own error parsing

### Error normalization goal

The frontend should not have to guess whether an error came from:

- no network
- timeout
- 401/403
- validation failure
- unexpected backend response

Normalize that once in the transport layer.

---

## Auth Token Rules

### Auth handling belongs in the API infrastructure layer

The shared API client may attach auth headers/tokens based on the approved auth strategy.

Examples:

- bearer token from secure client storage
- cookie/credential mode depending on backend setup

### Auth rules

- do not manually attach auth headers in every feature request file
- do not duplicate auth token reading logic across features
- do not spread refresh logic through random hooks/components

### Separation rule

- transport layer attaches tokens / credentials
- Query owns session/user fetches
- Router owns protected route behavior
- UI reacts to auth state through approved flows

---

## URL Params vs API Params

Do not mix route state ownership with API ownership.

Good:

- Router owns `projectId` param
- feature request function receives `projectId` as an argument
- Query uses the request function and query key

Bad:

- API client reaching into router state directly
- request functions reading URL state implicitly
- route files doing all request construction inline without feature abstractions

---

## Mapping Rules

### Map near the boundary when needed

If the backend returns awkward fields, normalize them near the API/feature boundary.

Examples:

- snake\_case → camelCase mapping if required by project conventions
- backend enum values → UI-friendly domain values
- date strings → explicit typed date handling strategy

### Do not map in random places

Bad:

- map transport shape inside five different components
- transform the same field names differently in two features

### UI-facing model rule

If the UI benefits from a cleaner model, expose a UI-facing model from the feature rather than leaking backend transport shape everywhere.

---

## API Client Function Shape

The shared client should expose simple, typed helpers.

Examples of acceptable patterns:

- `apiClient.get<T>(path, options)`
- `apiClient.post<TResponse, TBody>(path, body, options)`
- a single `request<TResponse>(config)` helper

The exact implementation is flexible. The rules are not.

### Rules

- keep the surface area small
- keep behavior explicit
- do not hide too much magic
- do not bake feature-specific conventions into the client

---

## No Direct Fetch Rule

This rule is absolute.

Do not call raw HTTP from:

- route files
- presentational components
- app-level reusable UI components
- Zustand stores
- random utility files

If a component needs backend data, it must go through:

- feature API request function
- Query option/hook
- then render from Query state

---

## Testing Guidance for API Integration

### Test the right layers

What to test:

- request function behavior
- mapping behavior
- error normalization behavior
- Query integration for key flows

What not to over-test:

- raw transport internals in every feature repeatedly
- trivial pass-through wrappers with no logic

### Mocking rule

Tests should mock at a stable boundary. Usually that means:

- mock HTTP at the client boundary, or
- mock feature request functions when testing UI layers

Do not make every component test depend on real transport internals.

---

## Good Examples

### Good: feature-owned request + query options

```ts
// features/projects/api/get-project.ts
export async function getProject(projectId: string): Promise<ProjectResponse> {
  return apiClient.get(`/projects/${projectId}`)
}
```

```ts
// features/projects/api/project.query-options.ts
export function projectDetailQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: projectKeys.detail(projectId),
    queryFn: () => getProject(projectId),
  })
}
```

Why this is good:

- request logic is isolated
- Query ownership is clear
- route/components can reuse the same query options

### Good: mapping near the boundary

```ts
export async function getProject(projectId: string): Promise<Project> {
  const response = await apiClient.get<ProjectResponse>(`/projects/${projectId}`)
  return mapProjectResponse(response)
}
```

Why this is good:

- UI does not need to understand raw transport shape

---

## Bad Examples

### Bad: direct fetch in component

```ts
useEffect(() => {
  fetch(`/api/projects/${projectId}`).then(...)
}, [projectId])
```

Why bad:

- bypasses Query
- bypasses shared client
- spreads transport behavior into UI

### Bad: storing backend list in Zustand

Why bad:

- duplicates Query responsibilities
- creates stale/invalidated data problems
- breaks the single-owner rule

### Bad: one giant `api.ts`

Why bad:

- destroys feature ownership
- becomes a dumping ground
- makes searchability and maintenance worse

---

## Review Checklist

Before adding or changing backend integration code, check:

- is all HTTP going through `lib/api/client.ts`?
- does this belong in the owning feature?
- is the request function named by exact action?
- are input and output typed?
- does Query own the async lifecycle?
- am I leaking transport shape too deep into the UI?
- am I duplicating auth header logic?
- am I inventing a second request pattern?
- am I using Zustand for something Query should own?

---

## Final Rule

Backend integration should feel boring:

- one transport layer
- one feature-owned API surface per domain
- one async owner for backend state
- explicit typing
- explicit mapping
- no random fetches

If backend communication starts showing up everywhere, the architecture is already slipping.
