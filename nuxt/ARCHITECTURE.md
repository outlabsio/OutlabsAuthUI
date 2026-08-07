# Architecture & Patterns

Nuxt 4 SPA + Pinia Colada. One rule underlies everything: **one home per concern**, so
display and logic never mix. The layers below are grounded in the Pinia and Pinia Colada docs
(links at the bottom).

## Layers

### 1. Server state — Pinia Colada (`app/queries/<domain>.ts`)
- Every read is a `defineQueryOptions()` factory; every write is a `useMutation` wrapper that
  does the request **and** `invalidateQueries`. Data concern only — **no UI here** (no toasts,
  no router).
- Each domain exports a **key factory** (a single source of truth for its cache keys):
  ```ts
  export const entityKeys = {
    root: ['entities'] as const,
    list: (f: EntitiesListFilters) => [...entityKeys.root, 'list', f] as const,
    detail: (id: string) => [...entityKeys.root, 'detail', id] as const,
  }
  ```
  Queries key off it; mutations invalidate `entityKeys.root`.
- **Never call `useQuery` inside a Pinia store** — it makes the query immortal. A store that
  needs cached server data reads it with `useQueryCache()`.

### 2. Feature logic — composables (`app/composables/use<Feature>.ts`)
- All orchestration lives here: which queries run, derived/computed state, tree/filter building,
  **form state**, handlers, and toast feedback. The composable calls the `queries/` factories
  and mutation wrappers.
- Reach for Colada's **`defineQuery()`** when a list's own reactive state (search/filter) must be
  shared across simultaneously-mounted components; otherwise a plain composable wrapping
  `useQuery` is enough. (SPA, so `defineQuery`'s "state isn't SSR-serialized" caveat doesn't
  apply to us.)
- A composable per feature (`useEntitiesWorkspace`, `useEntityDetail`), plus shared building
  blocks (e.g. `useResourceCrud` — the shared create-gate + toast-wrapped `run` + delete-confirm
  flow used by the users/roles/permissions list features; each keeps its own query + forms).

### 3. Display — the `.vue` SFC
- Template + presentational helpers + **exactly one** `const { … } = useFeature()`.
- No `useQuery`/`useMutation`, no mutation handlers, no `try/catch`, no business rules inline.
- Pure, stateless display helpers (a badge-colour map, a `TableColumn[]` definition) may stay in
  the SFC — they're presentation, not logic.

### 4. Global UI state — a single Pinia store, only when there's a real need (`app/stores/ui.ts`)
- For genuinely global, cross-route **client** state — not server data (#1), not per-view form
  state (#2). There is none today: server state is Colada, feature/form state is composables,
  the sidebar is Nuxt UI's own, theme is nuxt-color-mode. So there is currently **no ui store**
  (an empty one was removed rather than padded with invented state).
- Add exactly one `stores/ui.ts` the moment a real need appears (command palette, a cross-route
  filter, persisted table prefs with a page-size control, …). A second store requires a written
  reason. Server data never goes here (see #1).

### 5. Pure helpers — `app/utils/`
- **Pure, stateless functions only** (tree building, formatters). No reactive state, no
  singletons, no HTTP client. If it holds state or does IO, it's not a util.

### 6. Infra modules — `app/api/`, `app/auth/`
- Cohesive infra singletons live in named modules, not in `utils/`: the HTTP client and its
  error/URL helpers (`getApiErrorMessage`, `buildApiUrl`) in `app/api/`, token storage in
  `app/auth/`.

## Cross-cutting side effects
- **Error and success toasts live in the feature composable**, with specific per-feature titles
  ("Could not move entity" beats a generic "Something went wrong"). Components never toast or
  `try/catch`.
- A global PiniaColada `onError` net (via a root `colada.options.ts`) is available if we ever
  want a catch-all for unhandled/background errors — **deferred on purpose**: the per-feature
  toasts are the primary path and are more specific than any global handler.

## Definition of done (per feature)
- SFC: template + one composable call; no queries/mutations/handlers/try-catch inline.
- Logic in `composables/`; server IO in `queries/` with a key factory.
- typecheck + lint clean; the feature's E2E stays green.

## Rollout status

Single source of truth for where this refactor is. Read this section + `git log --oneline` on
the `nuxt` branch (each feature is its own commit) to know exactly what's done and what's next.

**Infra & decisions — done**
- [x] Patterns doc (this file)
- [x] `utils/` cleanup — dead `index.ts` barrel removed; token singleton → `app/auth/tokens.ts`
- [x] HTTP client relocated `utils/api.ts` → `app/api/client.ts` (33 imports repointed)
- [x] Toast ownership — specific per-feature toasts in composables; global catch-all net deferred
- [x] Orphan UI store removed (reintroduce per Layer 4 only when a real need appears)

**Feature rollout — each SFC becomes template + one `useFeature()` call**
- [x] entities (pilot) — `useEntitiesWorkspace` + `useEntityDetail` (+ `entityKeys` factory)
- [x] users — `useUsersWorkspace`
- [x] roles — `useRolesWorkspace`
- [x] permissions — `usePermissionsWorkspace`
- [x] personal api-keys — `useApiKeysWorkspace`
- [x] system api-keys — `useSystemApiKeys` (scope toggle + service accounts + machine keys + inventory)
- [x] audit — `useAuditWorkspace`
- [x] account — `useAccount`
- [x] settings — `useSettings`

**Feature rollout complete** — every `app/pages/app/**` view is now template + one `useFeature()`
call + pure display config; all feature logic lives in `app/composables/`.

- [x] DRY'd shared CRUD behavior into `useResourceCrud` (create gate + toast-wrapped `run` +
      delete-confirm flow), adopted by users/roles/permissions. The list query + create/edit forms
      stay per-feature (inherently per-resource; the query is kept typed inline).

**Refactor complete.**

**Resume / verify** — per feature: follow "Definition of done" above, one commit each. Verify with
`npm run typecheck && npm run lint`, then E2E. E2E needs the seeded enterprise_rbac backend on
`:8004` with persona env matching the seed (the built-in test defaults do **not** match it):
```
E2E_API_BASE_URL=http://localhost:8004 \
E2E_ADMIN_EMAIL=admin@acme.com E2E_ADMIN_PASSWORD=Testpass1! \
E2E_AGENT_EMAIL=agent@sf.acme.com E2E_AGENT_PASSWORD=Testpass1! \
npx playwright test --retries=1
```
The suite self-cleans its `pw`/`PW` test data via the cleanup teardown.

## References
- [Pinia Colada — Queries](https://pinia-colada.esm.dev/guide/queries.html) · [Reusable Queries (`defineQuery`)](https://pinia-colada.esm.dev/advanced/reusable-queries.html) · [Mutations](https://pinia-colada.esm.dev/guide/mutations.html)
- [Pinia — Core Concepts](https://pinia.vuejs.org/core-concepts/) · [Composables](https://pinia.vuejs.org/cookbook/composables.html)
