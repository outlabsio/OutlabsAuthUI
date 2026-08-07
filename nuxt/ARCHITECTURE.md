# Architecture & Patterns

Nuxt 4 SPA + Pinia Colada. One rule underlies everything: **one home per concern**, so
display and logic never mix. The layers below are grounded in the Pinia and Pinia Colada docs
(links at the bottom).

## Mental model: composables vs Pinia Colada vs Pinia stores

The thing that trips people up: **Pinia Colada _is_ Pinia.** Its query cache is a real Pinia
store (id `_pc_…`) holding every fetched record in memory, keyed by query key, and observable in
the Vue/Pinia devtools. So "domain data in memory, inspectable in devtools" already exists — you
do **not** hand-write a store per domain; `queries/<domain>.ts` + key factories organize the one
shared cache.

- **Server state → Pinia Colada.** Caching, dedup, background refetch, staleness, and
  invalidation come for free. A hand-written Pinia store holding server data re-implements all of
  that and is an anti-pattern here.
- **Feature logic + ephemeral view state → composables.** They consume Colada; they are not the
  data store.
- **Global _client_ state → one plain Pinia store**, and only when such state actually exists
  (none today).

Want named, per-domain, store-like observable query state (what a store-per-domain would give
you)? Colada's own primitive for that is **`defineQuery`** — "a tiny store" in the docs, a
globally-instantiated shared query. We use per-component `useQuery` (fine for single-page use);
promote a domain to `defineQuery` if it genuinely needs shared, named, observable state. Don't
hand-roll a store for it.

**Anti-patterns — do not do these:**
- a Pinia store per domain holding server data (use Colada);
- `useQuery` inside a Pinia store (immortal queries — read the cache via `useQueryCache()` if a
  store ever needs server data);
- re-deriving error messages or re-writing `try/catch` + `toast` per handler (use the shared
  helpers under "Cross-cutting side effects");
- manually `refetch()`-ing after a mutation (mutations invalidate their domain root, which
  refreshes active queries automatically).

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
- A composable per feature (`useEntitiesWorkspace`, `useEntityDetail`, …), plus shared building
  blocks used by all of them: **`useApiAction`** (the `run` mutation-runner), **`useApiErrorMessage`**
  (query error → message), and **`useResourceCrud`** (create-gate + `run` + delete-confirm flow for
  the users/roles/permissions list features; each still keeps its own query + create/edit forms).

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

## Cross-cutting side effects — shared helpers (use these, don't hand-roll)
- **`useApiAction().run(fn, { success?, error })`** wraps every mutation call: runs `fn`, toasts
  the outcome, and returns a discriminated `{ ok: true, data } | { ok: false, error }` so the
  caller can use the result (e.g. a one-time secret) and only close/reset/navigate on success.
  Never write a raw `try/catch` + `toast` in a handler. (`useResourceCrud` re-exports this `run`.)
  Toast content is flexible so it fits CRUD **and** auth flows: `success` is optional (navigate-on-
  success flows show none); `error` may be a title string (description defaults to the parsed API
  error), a full `{ title, description }`, or a **function of the error** (e.g. `describeAuthError`
  for 429 cooldowns). The only handlers that keep a bespoke `try/catch` are ones that show an
  **inline** error instead of a toast (magic-link verify, the OAuth callback).
- **`useApiErrorMessage(source)`** turns a query's `error` ref (or a getter) into the
  "Could not load …" string. Never re-derive it with a per-feature `computed(() => getApiErrorMessage(...))`.
- **No manual refetch.** Mutations invalidate their domain root via `onSettled` (Layer 1), so
  active queries refresh on their own; `run` deliberately does not refetch.
- Toasts carry **specific per-feature titles** ("Could not move entity"). A global PiniaColada
  `onError` net (root `colada.options.ts`) stays **deferred on purpose** — per-feature messages
  are more useful than any generic global handler.

## List views
- Default a list to its **non-terminal** rows and expose a **status filter** to reach the rest —
  don't show soft-deleted / archived records in the default view. Users default to **Active**
  (Deleted / All reachable via the filter); System API Keys shows **active** principals only.
  (The backend soft-deletes, so terminal rows never leave the data — they're filtered at the query.)

## Roles & permissions — the shared kit
Roles and permissions surface in many places (role detail, role create/edit, member add/edit, and
soon user detail / invite). They are shown and picked **only through one kit** so they read
identically everywhere — never ad-hoc badge lists or `USelectMenu`s:
- **Display** — `AppPermissionList` (permission NAMES → grouped-by-resource, enriched via the
  catalog; compact badges or `detailed` rows) and `AppEffectivePermissions` (the deduped union a set
  of roles grants — the "what will they get" view).
- **Pick** — `AppPermissionPicker` (permissions) and `AppRolePicker` (roles): both Nuxt UI
  `UCommandPalette` multi-selects (fuzzy search + keyboard nav), bound to name/id arrays via
  `value-key`. Callers pass the assignable pool (e.g. entity member roles are scoped to the org).
- **Data** — `usePermissionCatalog` is the single cached permissions source (name → rich definition,
  `groupByResource`). Effective permissions are the **client-side union** of each role's
  `permissions` — no dedicated endpoint.

When you need to show or choose a role/permission, reach for these and extend them; don't hand-roll a
badge list or a select. Permission badges show the full sub-action (`create_tree`, not `create`) so
tree variants stay distinct.

## Definition of done (per feature)
- SFC: template + one composable call; no queries/mutations/handlers/try-catch inline.
- Logic in `composables/`; server IO in `queries/` with a key factory.
- Mutations go through `useApiAction().run`; query errors through `useApiErrorMessage`; no raw
  `try/catch`+`toast` and no manual `refetch()`.
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
- [x] auth pages — `useLoginForm`, `useAccessCodeForm`, `useMagicLinkForm`, `useForgotPasswordForm`,
      `useResetPasswordForm`, `useAcceptInviteForm`, `useOAuthCallback` (login, access-code,
      magic-link, forgot/reset password, accept-invite, OAuth callback)

**Feature rollout complete** — every page under `app/pages/**` (the authed app **and** the auth
flows) is now template + one `useFeature()` call + pure display config; all feature logic lives in
`app/composables/`.

- [x] DRY pass — extracted **`useApiAction`** (the `run` mutation-runner, adopted by all 11
      composables, replacing ~14 inline `try/catch`+`toast` blocks) and **`useApiErrorMessage`**
      (adopted by all 9 query-error spots). `useResourceCrud` (create gate + `run` + delete-confirm)
      is used by users/roles/permissions. Manual `refetch()` removed — mutations invalidate their
      domain root via `onSettled`. The per-resource query + create/edit forms stay in each feature
      (kept typed inline).

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
