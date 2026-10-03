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
- **Global _client_ state → one plain Pinia store** (`app/stores/ui.ts`), and only for state
  that genuinely crosses routes (today: the tab's request cooldowns).

Want named, per-domain, store-like observable query state (what a store-per-domain would give
you)? Colada's own primitive for that is **`defineQuery`** — "a tiny store" in the docs, a
globally-instantiated shared query. Feature composables call `useQuery` with the option
factories from `queries/` (fine for single-page use); promote a domain to `defineQuery` if it
genuinely needs shared, named, observable state. Don't hand-roll a store for it.

**Anti-patterns — do not do these:**
- a Pinia store per domain holding server data (use Colada);
- `useQuery` inside a Pinia store (immortal queries — read the cache via `useQueryCache()` if a
  store ever needs server data);
- re-deriving error messages or re-writing `try/catch` + `toast` per handler (use the shared
  helpers under "Cross-cutting side effects");
- manually `refetch()`-ing after a mutation (mutations call `invalidateAfter(domain)`, which
  refreshes the active queries that write affects);
- awaiting or returning an invalidation from `onSettled` (a failed refetch would turn a successful
  write into an error; see "Server-state freshness").

## Layers

### 1. Server state — Pinia Colada (`app/queries/<domain>.ts`)
- Every read is a `defineQueryOptions()` factory; every write is a `useMutation` wrapper that
  does the request **and** calls `invalidateAfter(domain, { targetUserId })` in `onSettled`
  (`app/queries/invalidation.ts`). Data concern only — **no UI here** (no toasts, no router).
- Each domain exports a **key factory** (a single source of truth for its cache keys):
  ```ts
  export const entityKeys = {
    root: ['entities'] as const,
    list: (f: EntitiesListFilters) => [...entityKeys.root, 'list', f] as const,
    detail: (id: string) => [...entityKeys.root, 'detail', id] as const,
  }
  ```
  Queries key off it; mutations invalidate through the domain map, which includes `entityKeys.root`.
- A write whose response carries a one-time secret (API-key create/rotate) is a
  `useSecretMutation` (`queries/secret-mutation.ts`): same shape plus `discard()`, which evicts
  the response from the mutation cache once the secret is in AppSecretReveal.
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
  the users list; roles and permissions use `useRoleActions` / `usePermissionActions`, shared by
  their list and detail pages).

### 3. Display — the `.vue` SFC
- Template + presentational helpers + **exactly one** `const { … } = useFeature()`. A record
  page may also call `usePageMeta(() => record?.name)` for its document title (see "App shell").
- No `useQuery`/`useMutation`, no mutation handlers, no `try/catch`, no business rules inline.
  Lint rejects Colada calls, `@pinia/colada` imports, the API client and raw requests here
  (see "Guardrails").
- Pure, stateless display helpers (a badge-colour map, a `TableColumn[]` definition) may stay in
  the SFC — they're presentation, not logic.

### 4. Global UI state — a single Pinia store, only when there's a real need (`app/stores/ui.ts`)
- For genuinely global, cross-route **client** state — not server data (#1), not per-view form
  state (#2). Server state is Colada, feature/form state is composables, the sidebar is Nuxt
  UI's own, theme is nuxt-color-mode, and the command palette's open state and search term live
  in its own component (`useCommandPalette`).
- `useUiStore` holds the **request cooldowns**: per-identifier waits for the requests the auth
  API rate-limits (sign-in codes, magic links, reset links, phone verification), shared by every
  page in the tab (sign-in, access-code, recovery, Account), kept in sessionStorage across a
  reload, with one ticker that runs only while a wait is active. Features never read the store
  directly: `useRequestCooldown(key)` and `startRequestCooldown*` / `requestCooldown*`
  (`composables/useRequestCooldown.ts`) are its accessors. Unit tests:
  `test/unit/ui-store.test.ts`.
- It also holds the **account-picker latch**: the id of the account that first opened an
  `AppUserPicker` in the tab. Every picker observes the same unsearched account list, so they
  share one `enabled`, and none loads it until the signed-in account has opened one; keyed to the
  account, it reads as unopened after a sign-out or with another account. `useUserPicker` is its
  only accessor (`e2e/audit/audit-workspace.spec.ts` "the account pickers load nothing…").
- New global client state (a cross-route filter, persisted table prefs with a page-size
  control, …) joins this store as its own section. A second store requires a written reason.
  Server data never goes here (see #1). No module-level refs as a substitute: state shared
  across components lives here, not in a composable's module scope.

### 5. Pure helpers — `app/utils/`
- **Pure, stateless functions only** (tree building, formatters). No reactive state, no
  singletons, no HTTP client. If it holds state or does IO, it's not a util.
- Recorded exception: `utils/runtime-config.ts` keeps the resolved boot configuration in module
  state and fetches `/app-config.json` once at boot (the only `fetch` outside `app/api/`). It is
  read-only after boot, and modules and tests across the app import it from here; moving its
  loader into `app/api/` is a pure refactor left for later.

### 6. Infra modules — `app/api/`, `app/auth/`, `app/navigation/`
- Cohesive infra singletons live in named modules, not in `utils/`: the HTTP client and its
  URL helpers (`buildApiUrl`) in `app/api/client.ts`, the pure error model (`ApiError`,
  `normalizeApiError`, `getApiErrorMessage`) in `app/api/errors.ts`, token storage in
  `app/auth/`, the shell's scroll and focus memory in `app/navigation/`.

## Session lifecycle (`app/api/client.ts`, `app/auth/`, `app/queries/session.ts`)
One protocol, owned by the client and the session queries; features never handle tokens.
- **Renewal.** A 401 that refuses the bearer token (the auth dependency's bare or `HTTP_ERROR`
  body) is renewed once through `/auth/refresh` and the request replayed. A 401 that *answers*
  the request (`INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, …) is not; endpoints that check a
  user-supplied secret pass `verifiesSecret: true` so their `TOKEN_*` codes are answers too.
- **One refresh at a time, across tabs.** Tabs share the tokens in localStorage and the backend
  revokes every session when a rotated refresh token is presented twice. Renewals are
  single-flight per tab and serialized across tabs (`app/auth/refresh-lock.ts`: Web Locks, with a
  localStorage lease fallback); inside the lock a tab reuses a rotation another tab already made.
- **Only a refused refresh ends a session.** "Refused" means the refresh endpoint's own
  answer: 400, 401, 403, 422, or a 404 carrying `USER_NOT_FOUND` (`isDefinitiveRefreshFailure`).
  Network failures, timeouts (15 s per request), 408, 429, 5xx and any other status (a bare 404
  or 405 from a proxy or a missing route) keep the tokens and surface as retryable errors. At
  boot they render `AppApiUnreachableScreen` with Retry and Sign out. A refused refresh calls
  `endSession(reason)`, which clears the tokens once and announces it; the session-sync plugin
  empties the query cache and routes to `/auth/login?reason=…&redirect=…`, where
  `AppAuthSessionNotice` explains it. A boot Retry that ends in a refusal carries the reason too.
- **Sign-in** (`finalizeAuth`) verifies minted tokens with `/users/me` before storing them and
  drops the previous actor's cache. **Sign-out** (`useLogout`) clears locally first, then revokes
  server-side in the background from the captured tokens (renewing first if the access token has
  expired, so the live refresh token is the one revoked). Every tab that presents a refresh
  token and gets an answer records its fingerprint (`recordSpentRefreshToken`, inside the lock);
  a sign-out never presents a token another tab already spent.
- **Other tabs** follow sign-in, sign-out and identity switches through the storage event
  (`app/plugins/01.session-sync.client.ts`); a plain rotation needs nothing. A tab whose
  renewal was overtaken by a newer sign-in in another tab revokes the pair it minted and uses
  that sign-in (`resolveSession`), rather than wiping it.
- **Another account in another tab.** A switch is recognised from the subject of the access
  token the storage burst started from as well as the cached user (a `/users/me` refetch that
  ran meanwhile may already have cached the new account), and the tab reloads into it after
  `releaseUnloadWarnings()` (useDialogGuard), so no "Leave site?" prompt can keep the previous
  account's dialog open on the new session. A request refused meanwhile is never replayed with
  the other account's token: `refreshUnderLock` ends it when the rejected and the stored token
  name different subjects (`tokensNameDifferentSubjects`; opaque tokens cannot be compared).
- **The account's own session-ending actions** (Account › Security). The server ends every
  session of the account on a password change and on `DELETE /users/me/sessions`, the current
  one included (with `?keep_current=true` it keeps the session the access token names). A
  password change (`useChangePassword`) therefore signs this browser in again
  with the new password (`signInAgainWithPassword`); if that fails it calls
  `endSession('password_changed')`. The sign-in again holds the refresh lock until the new
  tokens are stored, so a renewal started meanwhile (a query refused with the old access token,
  in any tab) waits and replays with the new session instead of presenting the revoked refresh
  token. The same account keeps its cached responses and every query on screen is refetched
  (`invalidateQueries`), so Security lists the sessions the change left; the password form is
  remounted empty (its pending validate-on-input would otherwise flag the emptied fields). Sign out everywhere (`useRevokeAllSessions`) confirms, then calls
  `endSession('signed_out_everywhere')` and blacklists this tab's access token in the background
  (`blacklistAccessToken`: an immediate logout without a refresh token, effective where the host
  turns token blacklisting on). Sign out other devices (`useRevokeOtherSessions`) confirms and
  sends `keep_current=true`; this tab keeps its tokens. An access token minted before
  outlabs-auth 0.1.0a35 names no session (`sid`) and is refused with a plain 400
  (`isSessionNotBoundError`; outlabs-auth gives no reason code, and it is the only 400 of that
  request): the console renews once through the refresh lock (`renewAccessToken`, the same
  single-flight renewal as a refused request; a renewal adds the claim) and asks again. A second
  400 closes the dialog and the card explains it, offering Sign out everywhere. A reset with an
  emailed token (`useResetPassword`) signs a signed-in browser out before the sign-in page. An
  account without a password (`has_password` false) has no change form: its Security card is
  "Set a password", which emails the reset link (`useAccountResetLink`), since outlabs-auth
  0.1.0a35 changes a password only with the current one.
  "This browser" in a sessions table is the server's `is_current` (the row of the session the
  request's access token names); the console makes no guess of its own, so a token without `sid`
  marks no row.
- Errors carry `kind` (`http` | `network` | `timeout` | `session_ended`); `isTransientApiError`
  and `isSessionEndedError` classify them. `useApiAction` shows no toast for an ended session.
- **Backend dependencies** (not fixable in the console):
  - *Lost refresh answers.* If `/auth/refresh` times out on the client or the connection drops
    after the API has rotated the token, the console still holds the spent refresh token and
    reports a retryable state. The next renewal presents it again and is refused as reuse
    (`reuse_detected`), which signs this browser out; the API's reuse detection is meant to
    revoke every session of the user as well. The fix belongs in the API: a short grace
    window for a just-rotated token presented again (returning the same child), or an
    idempotent refresh keyed by a client-supplied request id.
  - *Sign-out after expiry needs two requests.* `/auth/logout` requires a valid access token,
    so an expired session is renewed before it can be revoked. Both requests use `keepalive`,
    but the logout can only be sent after the renewal answers; a tab closed in between leaves
    the renewed session alive until it expires. A logout that accepts the refresh token alone
    would remove the extra step.

## Cross-cutting side effects — shared helpers (use these, don't hand-roll)
- **The error model** (`app/api/errors.ts`). Every failure is read through
  `normalizeApiError(error)` → `{ kind, status, code, message, details, issues, fieldErrors,
  missingPermissions, requiredPermissions, retryAfterSeconds, sessionEnded, transient, generic }`.
  `kind` is one of validation, forbidden, not_found, conflict, rate_limited, unauthorized, server,
  network, timeout, unknown. It reads every backend envelope (the library's `{ error, message,
  details }`, FastAPI's `detail`, request-validation `details.errors[]` / `detail[]`, and non-JSON
  gateway pages), matches on the stable `code` rather than the message, and its `message` is
  user-facing copy (`ERROR_COPY` by code, `KIND_COPY` by kind). Messages the console wrote itself
  (renewal and transport failures) are kept. Never parse a response body in a feature.
- **`useApiAction().run(fn, options)`** wraps every mutation call and returns
  `{ ok: true, data } | { ok: false, error, apiError }`, so the caller can use the result (a
  one-time secret) and only close/reset/navigate on success. Never write a raw `try/catch` +
  `toast` in a handler (`useResourceCrud` re-exports this `run`). Options:
  - `success?` / `error`: toast content ("<Thing> <past verb>" / "Could not <verb> <thing>"). The
    description comes from the error model unless the caller gives one; `error` may be a function
    of the error, and a function returning null means "explained elsewhere, no toast".
  - `form` + `fieldMap?`: the dialog's `UForm` template ref. Server issues land on the matching
    `UFormField` (`form.setErrors`), focus moves to the first one, and issues no field matches are
    listed. `fieldMap` renames wire paths (`{ password: 'new_password' }`; `null` = never a field);
    an entry for a field also covers its members (`value.str`, `role_ids.0`). A server issue stays
    on its field until the user changes that value: UForm re-validates a field on blur, on change
    and 300 ms after typing, and AppFormDialog re-validates flagged fields on every change to its
    state, which would otherwise replace it with the (passing) client result when the user submits
    straight after typing or edits another field. Keeping ends at the next submit and when the form
    unmounts. It reads the form's own `state` prop, so any `UForm` ref works as is.
  - `fieldErrors?`: `(error) => { name, message }[]` for answers that belong on a field without
    being validation issues, e.g. a wrong current password (401 `INVALID_CREDENTIALS`) on Current
    password. They land, stay and take focus like server issues (`changePasswordFieldErrors`).
  - `inline`: a `Ref<ActionError | null>` the dialog renders with `<AppApiErrorAlert :error>` at
    the top of its body instead of a toast (cleared when the run starts), or a predicate for errors
    the caller explains itself.
  - `onNotFound` + `notFoundCodes?`: the record is gone (404/410) — typically close the dialog; a
    toast says so. Every not-found answer counts unless `notFoundCodes` lists the codes of the
    dialog's own record (`['USER_NOT_FOUND']`). Pass it whenever the request also names other
    records (roles to grant, an entity): a missing role is then reported in the dialog, which stays
    open, instead of closing it with "no longer exists".
  - `grantedRoles`: the roles the action grants, so a delegation denial names the roles carrying
    the missing permissions.
  Treatment by kind: validation → fields/alert; forbidden → names the missing permissions and
  refreshes the actor's permissions; not_found → `onNotFound`; rate_limited → the cooldown;
  server → status in the title; timeout on a write → "may still have been saved"; ended session →
  nothing (the session layer explains it). Non-API exceptions are logged with `console.error`.
  `focusFirstFormError` is the UForm `@error` handler for client-side validation.
- **`useApiErrorMessage(source)`** turns a query's `error` ref (or a getter) into the
  "Could not load …" string; **`useApiError(source)`** gives the classified error (e.g. to render
  a not-found state instead of a failed load). Never re-derive them per feature.
- **No manual refetch.** Mutations invalidate on settle (Layer 1), so active queries refresh on
  their own; `run` deliberately does not refetch.
- Toasts carry **specific per-feature titles** ("Could not move entity"). There is still no
  global Pinia Colada `onError` net — per-feature messages are more useful than a generic one.

## Server-state freshness (`app/queries/invalidation.ts`, `freshness.ts`, `colada.options.ts`)
- **Invalidation map.** `INVALIDATE_AFTER[domain]` lists the roots a write in that domain makes
  stale (a membership change: memberships, users — the user's membership history lives under
  their detail —, entities and audit). `invalidateAfter(queryCache, domain, { targetUserId })`
  also refreshes the signed-in admin's session and permissions when the write targets them, and
  always after a role or permission definition changes (they may hold it). Add a domain there, not
  ad-hoc `invalidateQueries` calls; multi-step writes (assigning several roles) run in one
  mutation so they invalidate once.
- **Never await it.** Pinia Colada awaits `onSettled`; a rejected refetch there replaces the
  mutation's result with the refetch error. `invalidateAfter` swallows refetch failures: the view
  shows its own load error, the write is still reported as done, and create/rotate secrets survive.
- **Defaults** (`colada.options.ts`): data is fresh for 30 s (the library default of 5 s plus
  refetch-on-focus re-downloaded every active query on every focus); catalogues behind pickers use
  `CATALOGUE_STALE_TIME` (5 min), the session and the actor's permissions `IDENTITY_STALE_TIME`
  (60 s). Paginated lists keep the previous page as `placeholderData` (`keepPreviousPage`) — never
  on pools that feed a picker. When one query factory serves both (users, roles, permissions,
  entities), the list page adds it at its `useQuery` call, not in the factory.
- **Transient read retry** (`queries/retry-plugin.ts`): a query that got no answer or a
  502/503/504 is fetched again twice with backoff, without the failure ever reaching a view or a
  watcher; decided answers (4xx, 500, 429) and timeouts surface at once. Mutations are never
  retried.
- **One `enabled` per key.** Pinia Colada keeps ONE options object per cache entry: whichever
  `useQuery` observing that key last (re)computed its options wins, and invalidation skips an
  entry whose stored `enabled` is false. A dialog that observes a key the page also shows (the
  entity detail, its path, a picker's selected entity) must therefore not gate it on `open` or
  on an idle state: gate it on its inputs only (`Boolean(entityId)`), or reuse the page's own
  options. Otherwise closing the dialog silently stops the page refetching after the next write.
- **No stale rows beside a refusal** (`queries/stale-data-plugin.ts`): when a refetch is denied,
  not found or invalid, the entry drops its previous data, so a view renders its error state
  alone; transient failures keep the last good data. The session layer's own queries (session,
  auth-config, my-permissions) are exempt.

## API contract (`openapi/`, `app/types/api.gen.ts`)
- `openapi/outlabs-auth.openapi.json` is the checked-in snapshot of the library routes the console
  targets (operations carrying `x-outlabs-auth-surface`, relative to the auth prefix, with the
  example presets that expose them). `bun run gen:api-types` regenerates `app/types/api.gen.ts`
  with openapi-typescript; after a library release, rebuild the snapshot with
  `node scripts/gen-api-types.mjs --refresh --version <x.y.z> --spec EnterpriseRBAC=<openapi.json
  or URL> --spec SimpleRBAC=<…>` and review the diff.
- Domain types in `app/types/*.ts` derive their response shapes from `components['schemas']`.
- `test/unit/api-contract.test.ts` extracts every path the client builds and fails on a route
  the snapshot lacks, a wrong method, a trailing-slash mismatch (the API answers the other form
  with a 307), a route SimpleRBAC lacks outside the enterprise-only surfaces, or generated types
  that no longer match the snapshot. `e2e/app/openapi-routes.spec.ts` checks the same routes
  against the running backend's `/openapi.json` and that no read is redirected. A new computed
  path must be taught to `DYNAMIC_PATHS` in `scripts/lib/client-routes.mjs`.

## List views
- Default a list to its **non-terminal** rows and expose a **status filter** to reach the rest —
  don't show soft-deleted / archived records in the default view. Users default to **Active**
  (Deleted / All reachable via the filter); Service accounts default to **Active** (Deactivated,
  Archived and All via the filter) and an account's keys to active and suspended ones.
  (The backend soft-deletes, so terminal rows never leave the data — they're filtered at the query.)
- **State lives in the route query** through `useListQueryState` (search `q`, `page`, one key per
  filter; only non-default values are written, with `router.replace`), so reload, Back from a
  detail page and shared links keep the filtered view. Put `searchTerm` (debounced ~300 ms), not
  the raw input, in the query key, and add `placeholderData: keepPreviousData<ListResponse>` so
  the table keeps its rows while the next page or filter loads.
- **Page on the server** with the endpoint's own `page`/`limit`/filter parameters and show the
  true total with `AppListPagination`. Never load one fixed page and filter it in the browser.
  Where the API lacks a filter (GET /permissions has no search or is_system; GET /roles has no
  is_system), filter the complete set walked with `collectAllPages` (roles: `rolesListCatalogQuery`)
  and page it locally — never a truncated page. Those walks load lazily (only while such a
  local filter is on, or when the permissions resource filter opens); filters the API has always
  go to the server.
- Render the list through `AppQueryState` (skeleton, error with Retry, "no matches" vs "none yet"
  with an action). The permissions list is the reference implementation.
- **Key rows by record** (`UTable :get-row-id`), as the users list and Audit do. TanStack keys
  rows by position otherwise, so a list that changes under an open row menu or row dialog (a
  search answering, a refetch) hands that row's elements to another record, and closing the
  dialog cannot return focus to the button that opened it (useDialogReturnFocus finds it
  detached). The other record tables still key by position; key them when they are next touched.
- **An active-only list needs an "Include inactive" (or "Include ended") control as soon as the
  UI can deactivate through it**, or a suspended row vanishes with no way to see or undo it (hit
  twice: entity members, then direct role memberships). Check for this whenever a suspend or
  status action joins an existing list.

## Display kit
Shared building blocks for showing server data. Reach for these instead of hand-writing
loading/empty copy, date formatting or one-off selects.

| Piece | Use |
|---|---|
| `utils/format-date.ts` | `formatDateTime` (medium date + short time), `formatDate`, `formatRelativeTime`, `timestampParts`. The one formatter. |
| `<AppTimestamp :value fallback relative date-only>` | Every API timestamp in a cell, card or detail list: relative when recent, the absolute value in a UTooltip and screen-reader text. |
| `<AppQueryState :status :error :enabled :empty :refreshing ... @retry>` | Every card/list backed by a query: `enabled=false` renders nothing (or a lock with `disabled-title`), pending renders a `skeleton` of `table`/`list`/`detail`/`lines`, error renders a `role=alert` UAlert with Retry and hides stale rows (with `has-data`, a failed refresh of a query that still holds data — Pinia Colada keeps it only after a transient failure — keeps the content under a "Couldn't refresh" warning with Retry), empty renders a UEmpty (`empty-title`, `empty-description`, `empty-icon`, `empty-actions`), success renders the slot. Keep empty titles distinct from the card heading. |
| `useListQueryState({ filters, allowed, pageSize, searchParam, pageParam, debounce })` | List URL state; returns `search`, `searchTerm`, `page`, `pageSize`, `filters.<key>`, `values`, `isFiltered`, `reset()`, `syncTotal(getter)`. `keepPreviousData<T>` lives beside it. |
| `<AppListPagination v-model:page :total :page-size noun>` | The total ("Showing 26–41 of 41 permissions", announced politely) and a named UPagination. |
| `utils/pagination.ts` | `collectAllPages(fetchPage, { pageSize })` for catalogues (reports `complete: false` instead of capping), `slicePage`, `pageCount`, `clampPage`, `listSummary`. |
| `<AppDetailList :items>` | Detail values with list-consistent badges (`badge`), a `type` of `datetime`, `date`, `boolean` or `code`, wrapping instead of truncation, `#value-<key>` slots, `full` rows, and a `description` under a value (the explanation stays with its row: a lockout, an access scope). |
| `utils/avatar.ts` | `localImageSrc(url, origin)`: the avatar URL the CSP lets the console show (same-origin or `data:image/`), else undefined. An OAuth provider's picture is never bound; Connected accounts show the provider icon and Users the initials instead. Never widen `img-src` for avatars. |
| `utils/status.ts` | `USER_STATUS_COLOR`, `DEFINITION_STATUS_COLOR`, `API_KEY_STATUS_COLOR`, `MEMBERSHIP_STATUS_COLOR`, `statusLabel`, `originLabel`, `yesNo`, `badgeColor`, `ENTITY_CLASS_BADGE`; a `BadgeStyle` binds the same way in a list (`<UBadge v-bind="ENTITY_CLASS_BADGE[entity.entity_class]" />`) and as a detail item's `badge:`. A role's type badge is `roleTypeBadge(role)` in `utils/role-definitions.ts` ('System-wide' / 'Organization' / 'Entity'). |
| `utils/table.ts` | `srOnlyHeader('Actions')` for action columns; `hideBelowSm` / `hideBelowMd` column `meta` for secondary columns on phones. Row triggers are `size="sm"` with a name like "Role actions for Admin". |
| `<AppSessionsTable :sessions :status :error :has-data revocable :revoking-id :signing-out @revoke @sign-out @retry>` | Refresh-token sessions (account, user detail): device from the user agent (`utils/user-agent.ts`) with the IP under it, last active and expiry (both relative, absolute in the tooltip). Fits a `max-w-3xl` card and a 390px phone without sideways scrolling; the Revoke column is pinned right. The row the server marks `is_current` (only on one's own sessions) comes first, is marked "This browser" and, when revocable, offers Sign out (`sign-out`) instead of Revoke. |
| `<AppSecretReveal v-model:secret>` | One-time API-key secrets: set the model to `oneTimeSecretFrom(response, owner)` to open; it cannot be dismissed by accident (no X; ESC and outside clicks are ignored), holds a `useDialogGuard` until the key is marked as stored (browser Back asks "Close without storing the key?", reload/tab close is warned), and clears the model when closed. The create/rotate mutation must be a `useSecretMutation` (`queries/secret-mutation.ts`) and the caller calls its `discard()` right after filling the model: Pinia Colada otherwise keeps the plaintext in its mutation cache after the dialog closes (`reset()` alone does not evict it). |
| `<AppEntityPicker v-model :root-id :entity-class :allowed-types :exclude-ids :exclude-subtree-of>` | Every entity select: options with path and class icon grouped by organisation; scoped to a root (whole subtree, local filter) or, without one, server search (superusers, system-wide admins, rootless accounts). The options are `utils/entity-picker.ts` (pure): the bound value is never dropped, so a selection a filter excludes stays listed, disabled, with the reason first, and one outside the candidates reads "Unavailable entity", never its raw id. |
| `utils/entity-tree.ts` | `indexEntities`, `entityAncestors`, `entityRootId`, `entityPathLabel`, `isInSubtree` — the only parent-chain walks — plus pure mirrors of the server's hierarchy rules: `entityDescendants`, `entityArchivePlan` (what `DELETE ?cascade=true` archives and leaves behind), `effectiveAllowedChildTypes` / `allowedChildTypesOwner` (parent, else root, else any), `allowedChildTypesHelp` (what an empty list means, for Create and Governance alike: a root's list governs every descendant without its own), `placementProblem` (why an entity cannot go under a parent), `entityValidityState`; `buildEntityTree` flags `detached` nodes. |
| `useActorReach()` | `{ isGlobal, ownRoles }`: whether the admin has the backend's global scope (superuser, active direct system-wide role, or no hierarchy); `null` while their own direct roles load. Decides who may create accounts outside an organization and change superuser accounts. |
| `useEntityScope()` | `{ anchoredRootId, canBrowseAllRoots, rootInScope(rootId) }`: a non-global admin in an organisation sees that organisation only (pass `anchoredRootId` as an AppEntityPicker `root-id`); superusers, system-wide admins (`useActorReach().isGlobal === true`) and accounts without an organisation browse every organisation. Unknown reach stays anchored. The Users and Roles lists use the same rule (`canBrowseAllRoots`). The pure rules, including `entityPickBlocked` (a rootless admin without global reach has no entity to pick), are `utils/entity-scope.ts`. The backend scopes the entity routes as well (another tenant's entity answers 404); the anchoring keeps the tree and pickers on the admin's organization. |

## Entities workspace (`pages/app/entities`, `components/app/EntityDetail.vue`, `components/app/entity/*`)
- **One organisation at a time.** The tree is `GET /entities/{root}` + `/descendants` (includes
  inactive entities, never paginated); the paginated list is active-only and only feeds the
  organisation switcher (`?root=`) of admins who browse every organisation. Delegated admins are anchored on their own
  organisation (`useEntityScope`); a deep link elsewhere reads "Entity not found" (the backend
  answers another tenant's entity 404, like a nonexistent one, so the copy names both).
  Inactive entities sit behind "Show inactive" (`?inactive=true`); a node whose parent is archived
  or unreadable is flagged "Detached". The selection is `?entity=` (pushed, so Back steps through
  it); UTree selection drives it, rows hold no links.
- **Detail placement.** Beside the tree from `lg`; below it inside a USlideover (the dashboard
  template's inbox pattern), never both.
- **Create.** "New entity" opens Create entity under the selection (F-074), known from the tree,
  its own record (the key the detail panel reads) or its path; an archived selection falls back
  to the organisation in view. Until any of them has loaded the selected id itself is the
  parent, never a new top-level organisation (`useEntitiesWorkspace` `defaultCreateParent`).
- **Lifecycle.** Edit offers Active/Inactive only: a status PATCH revokes nothing (members keep
  access). Archive is `DELETE /entities/{id}` behind a typed confirmation listing what the server
  revokes; with active children it needs `cascade=true`, which the admin acknowledges. Archived
  entities are read-only and leave the tree. An entity archived by the old status edit that still
  has active members shows a warning with "Finish archiving" (the same DELETE).
- **Scope (F-020).** The backend scopes the entity routes to the admin's tenant (DD-061: another
  tenant's entity answers 404), and `useEntityScope` anchors a delegated (non-global) admin on
  their own organisation in the console: the tree, `AppEntityPicker` (whatever `root-id` the
  caller passes), the plain entity selects (`useScopedEntities`), and the command palette's entity
  search (`entityOrganisationQuery`, filtered locally). The detail renders nothing about an entity,
  not even its name in the navbar or document title, and loads none of its cards, until its scope
  is resolved (`scopeReady`): at once for an entity of the admin's subtree, else from its path.
- **Naming rules.** A root's patterns are Python regular expressions: the server compiles them
  with `re.compile` and matches names with `re.fullmatch`. `schemas/entity.ts` checks a name
  before submit only against a portable pattern (no Python-only syntax, none of the
  Unicode-sensitive `\w \b \d`, compiles in RegExp's `u` mode); otherwise the server decides and
  its refusal (422, the field named by its label) lands on the field. Python-only syntax is never
  reported invalid (the field says the server checks it), and Governance validates only the
  patterns the admin changed.
- **Composition.** The detail is split into components with their own composables
  (`AppEntityMembersCard`/`useEntityMembers`, `AppEntityActivityCard`/`useEntityActivity`,
  `AppEntity{Create,Edit,Governance,Move}Dialog`/`useEntity*Dialog`); each SFC still binds exactly
  one composable. Dialog components take `v-model:open` and the record as props.

## Users workspace (`pages/app/users`, `useUsersWorkspace`, `utils/users.ts`)
- **List.** Search, status, account type (`is_superuser`), organization (`root_entity_id`, for
  admins who browse every organization) and "Orphaned only" live in the route query; every filter
  goes to the server. Rows lead with the name and email, a Superuser and an "Email unverified"
  badge, the organization, the status with its **holds** (`userHolds`: a lockout in force, a timed
  suspension's end) and the last sign-in. The name is a link; rows have no UTable `@select`,
  because a row with `role="button"` around a link and a menu is nested-interactive. Below `sm`
  the status moves under the name and the filters move behind a Filters popover.
- **Orphaned** (`GET /users/orphaned`) rows wrap the user and add where it last belonged and its
  membership counts. A delegated admin gets the orphans rooted in their organization; deleted
  accounts are left out, and the status and account-type filters are disabled there (the list
  sends neither).
- **Scope.** `useActorReach().isGlobal` mirrors the backend's global scope (superuser, an active
  direct system-wide role, or no entity hierarchy); null while unknown counts as not global. A
  delegated admin's new account is placed in their organization (`newUserRootChoice`: required,
  preselected), and an invite must attach an entity membership (`inviteEntityRule`), so neither
  vanishes from their list; without `membership:create_tree` they get no Invite. The Superuser
  switch exists for superusers only. Create and invite open the new account.
- **Row menus** come from `userRowPolicy` (the user detail's header uses it too, through `useUserPolicy`): View first;
  Edit profile and Restore with `user:update`, Delete with `user:delete`; superuser accounts only
  for global admins; never Delete, Change status or Reset password on one's own account, which
  links to Account instead. `<AppUserProfileDialog v-model:open :user>` is the one profile edit
  (email, names, phone; diff-only).

## Roles and permissions workspaces (`pages/app/roles`, `pages/app/permissions`, `utils/role-definitions.ts`)
- **Authoring rules** live in `utils/role-definitions.ts` (pure, unit-tested): `roleTypeBadge`,
  `roleDefinedAt`, `roleScopeLabel` (only entity-local roles have a scope that matters),
  `roleTypeChoices` (system-wide roles only for actors with global scope, `useActorReach`),
  `roleSlugFromDisplayName`, `roleRowPolicy` / `permissionRowPolicy` (system definitions cannot be
  changed; archived roles are read-only; Edit/Archive/Duplicate follow role:update/delete/create),
  `rolePermissionChanges`, `delegablePermissionNames`, `permissionPickerOptions`,
  `inactiveSelected`, `duplicateRoleDraft`.
- **Roles list** (`useRolesWorkspace`): search, Type (`is_global`), Organization
  (`root_entity_id`, for admins who browse every organization) and page go to the server; Origin
  has no API parameter and filters every page (`rolesListCatalogQuery`) while it is on. One
  Type column (System-wide / Organization / Entity, where it is defined, and the scope of an
  entity-local role), Permissions count, Origin and Status; Type is EnterpriseRBAC-only. Below
  `sm` the filters move behind a Filters popover.
- **Actions** (`useRoleActions`, shared by the list's row menus and the detail's navbar): View,
  Edit, Duplicate as custom role, Archive last (typed name). A role the admin holds (`useHeldRoles`:
  direct grants and memberships in force) reads "You hold this role", and archiving it or removing
  its permissions warns that they lose that access too.
- **`<AppRoleFormDialog v-model:open :target>`** (`useRoleFormDialog`) is the one add / edit /
  duplicate dialog (`target`: `{ mode: 'create', source? }` or `{ mode: 'edit', role }`): Type
  first as cards (`roleTypeChoices`: only types the admin can complete, so a rootless admin without
  global reach is offered no Entity card), then the organization (a delegated admin's own, fixed;
  a system-wide admin's own, preselected) or the entity
  (`AppEntityPicker`), names (the slug follows the display name until edited), permissions
  (`AppPermissionPicker`: the selection as removable chips, inactive ones flagged), Active,
  auto-assign and "Applies to" for entity roles, and "Assignable at" as a multi-select with
  create. Create opens the new role. Edit sends the changed fields with PATCH and the permission
  **diff** through POST/DELETE `/roles/{id}/permissions` (`useSaveRole`), never the whole set:
  PATCH `permissions` re-resolves every attached permission and fails while one is inactive, and
  would overwrite another admin's concurrent change. The order is DELETE (removals), PATCH, then
  POST (additions): a PATCH that widens a role (activates it, widens its scope, turns on
  auto-assign, adds assignable types) is checked against the role's current set, so a permission
  being removed must be gone first. A save that fails part-way re-bases the form on what reached
  the server, so Save again sends only the rest.
- **Permission picker pool** (`useGrantablePermissions`): the catalog from `GET /permissions/`
  (every status; needs permission:read) rather than the active-only `/auth/config/permissions`,
  because the editor must name the inactive permissions a role already carries; only active
  permissions are offered. Without the catalog, a delegated admin is offered what they hold plus
  the base action of each `_tree` / `_all` grant. A non-superuser's dialog says they can grant
  only what they hold, worded for the source (`roleDelegationNote`): with the catalog, the rest is
  listed but can't be added; without it, only what they hold is listed.
  A refusal names the missing permissions (AppApiErrorAlert); inactive or unknown names land on
  the Permissions field.
- **Permissions**: `usePermissionActions` (Edit for custom permissions with permission:update,
  Archive with permission:delete; the archive confirmation reads every page of roles while open)
  and `<AppPermissionEditDialog v-model:open :permission>` (display name, description, tags,
  Active; diff-only, says what activating or deactivating does).
- **Detail pages** (`useRoleDetail`, `usePermissionDetail`) follow the user detail's states: a
  malformed id or 404/422 is "not found" (archived definitions are not readable), 403 a lock
  UEmpty, `AppQueryState has-data` otherwise; the navbar holds Edit and a More menu.

## Service accounts (`pages/app/service-accounts`, `utils/service-accounts.ts`, `components/app/service-account/*`)
- **Section.** "Service accounts" (outlabs-auth integration principals) at `/app/service-accounts`;
  the former `/app/users/api-keys` redirects through the section's `legacyPaths` in APP_SECTIONS
  (the route guard keeps the query and hash). Requirement: the `integration_principals` surface,
  the `system_api_keys` feature and `api_key:read` (a delegated admin's `api_key:read_tree`
  counts). Credentials are "keys" everywhere in the copy.
- **Scope.** SimpleRBAC has platform-wide accounts only (no scope controls). On EnterpriseRBAC the
  platform routes are superuser-only: superusers choose Platform-wide or an entity
  (AppEntityPicker, server search); anyone else is on entity scope, at their organization by
  default: inside it only for a delegated admin (the picker anchors itself), at any entity for a
  system-wide admin (server search). A rootless admin without global reach is told they belong to
  no organization. `resolveServiceAccountScope` (pure) decides it from `?scope=entity&entity=<id>`,
  written with `router.replace`; the entity page's Integrations "Manage" link lands there.
- **List** (`useServiceAccountsWorkspace`): one server page at a time (`q`, `status`, `page` via
  useListQueryState; active by default), AppQueryState + AppListPagination, rows link to the
  account. The navbar's New service account is icon-only below `sm` (the title stays readable).
- **Key inventory** (`useKeyInventory`, `?view=inventory`, EnterpriseRBAC with `api_key_admin`):
  every key anchored exactly at the entity (personal and service-account keys, not children's),
  server search `kq`, kind and status filters (`kind`, `kstatus`), `kpage`, and Revoke
  (api_key:delete at the entity) confirmed. The status filter is the STORED status
  (`KEY_INVENTORY_STATUS_ITEMS`): the server never stores `expired`, so the default is "Active
  (includes expired)", there is no Expired choice, and each row's badge shows the effective
  state (the backend gap is in PRODUCTION.md section 8). Both empty states offer "Show all
  statuses" (`keyInventoryEmptyCopy`). `<AppApiKeyOwner :api-key :entity-id>` names the owner
  (AppUserLabel, or AppServiceAccountLabel: the account's name from its cached record, linked to
  its page) in the Owner column, in an "Owner:" line under the key name below `md`, and in the
  key detail's "Acts as" row (its `#owner` slot). There is no owner filter yet.
- **Account page** (`/app/service-accounts/<id>`, `?entity=<anchor>` for an entity account, whose
  API path needs it; `serviceAccountPath(account, tab?)` builds it; `useServiceAccountDetail`):
  tabs `?tab=overview|access|keys`; malformed id / 404 / 422 is "not found"; 403 a lock UEmpty; a
  non-superuser on EnterpriseRBAC is denied a platform-wide link without a request. Overview
  (AppDetailList: status, scope with the anchor's path, includes child entities, created by),
  Access (roles as AppRoleChip, effective scopes, direct scopes and how many are not in effect),
  Keys (`AppServiceAccountKeysCard`). Archived accounts are read-only; deactivated ones say their
  keys were revoked. `serviceAccountStatusLabel` words `inactive` as "Deactivated" on the badges,
  the status filter and the alert alike. Below `sm` the navbar's Edit is icon-only.
- **Actions** (`useServiceAccountActions` + `useServiceAccountGrants`, list rows and the navbar):
  `serviceAccountPolicy` — Edit, Deactivate and Reactivate need api_key:update, Archive
  api_key:delete (SimpleRBAC also api_key:revoke), New key api_key:create on an active account;
  archived accounts offer nothing. Deactivate and Archive confirmations state how many active or
  suspended keys are revoked (the account's keys are read while the dialog is open); Archive is
  typed; reactivation says revoked keys stay revoked.
- **Create / edit** (`<AppServiceAccountFormDialog>`, `useServiceAccountFormDialog`): name and
  description, "Includes child entities" only for entity accounts (the API refuses it
  platform-wide), roles first through AppRoleAccessEditor over `useAssignableRoles` (system-wide
  roles for platform accounts, the roles available at the anchor for entity accounts), direct
  scopes under "Advanced: direct scopes" (restricted) through `AppPermissionPicker :allow`
  limited to what the server says this admin may grant at the account's scope
  (`principalGrantableScopesQuery`: `GET …/integration-principals/grantable-scopes`, the host's
  system-key allowlist within what the admin holds there; its action prefixes word the field's
  help). While it loads the field says so; a failed read is an alert with Retry and a refused one
  (403) says direct scopes are not theirs to give, the picker disabled in both: the console keeps
  no copy of the policy. At least one role or direct scope. outlabs-auth checks the whole envelope
  (roles' permissions and direct scopes) against that list on create and on every edit, a rename
  included, with a 400 that names no scope, so the dialog checks it first: `scopesBeyondGrant` +
  `scopesBeyondGrantErrors` (`utils/service-accounts.ts`) are an AppFormDialog `validate` rule that
  names the roles on Roles and the direct scopes on Direct scopes (opening the section); roles
  whose permissions are not loaded are left to the server, and Save waits for the grantable read
  (not for a failed or refused one), so a quick submit cannot pass the rule unjudged. Edit sends
  only what changed. The
  API's 400 still shows in the dialog. Create opens the new account.
- **Keys** (`useServiceAccountKeys`): every key of the account (all pages), live ones by default
  with "Include revoked and expired" (a key past its expiry date counts as expired). Status,
  detail and actions follow the shared API-key rules below; Edit opens the same dialog as New
  key. `<AppServiceAccountKeyDialog :target>` (`machineKeySchema` in `schemas/api-key.ts`: name,
  description, Live/Test, scopes through AppScopePicker: the account's effective scopes that the
  admin may also grant (`machineKeyScopeOptions`, the same grantable-scopes read; the server checks
  both), rate limit, expiry preset, IP allowlist) creates a key (`useSecretMutation`: the secret goes to
  AppSecretReveal, owner = the account's name, and the mutation is discarded) or edits one
  (changed fields only; scopes the account no longer grants, or the admin cannot grant, are
  flagged (`machineKeyScopeFlags`), and a create or an edit that changes the scopes must drop them
  first, as in the personal key dialog: a `validate` rule of the form, so the refusal stays on the
  Scopes field and blocks the submit, F-082).

## API keys (`utils/api-keys.ts`, `components/app/ApiKey*.vue`, `components/app/api-key/*`)
- **One set of key rules** for every key table (My API keys, a service account's Keys tab, the
  entity key inventory, the user detail's Personal API keys card). `apiKeyState(key, now)` reads
  `is_currently_effective` / `ineffective_reasons`, not only the stored status: Active, Not in
  effect (stored active but refused: owner or service account inactive, entity inactive or gone,
  no scope still granted, with `INEFFECTIVE_REASON_COPY` sentences), Suspended, Expired (by
  status, or once `expires_at` has passed: the server never writes `expired`) and Revoked.
  `<AppApiKeyStatus :api-key>` renders it with the reasons in a tooltip and screen-reader text.
  `visibleKeys` / `isTerminalKey` treat date-expired keys as terminal; when that leaves a table
  empty, `keyListEmptyCopy` says how many keys are hidden ("No keys yet" only when there are none).
  Scope counts open the full list through `<AppApiKeyScopes :scopes :key-name>` in every table
  with a Scopes column. The user detail card sorts newest first and pages by 10.
- **Actions** (`apiKeyActionStates(key, { canUpdate, canDelete, canReplace? })` +
  `apiKeyMenuItems(states, handlers)`): Edit; Rotate only on an active key in effect, otherwise
  shown disabled with the reason (rotating issues an active key and drops a passed expiry);
  Suspend / Reactivate; Revoke; "Create replacement" for expired personal keys. Revoked keys
  offer nothing (no menu). The row menu starts with View details.
- **Detail** (`<AppApiKeyDetail v-model:open :api-key :owner :actions @action>`, or an `#owner`
  slot instead of the `owner` text for a linked label): a USlideover
  opened from the key's name (a wrapping ULink button) with status and reasons, type, prefix,
  owner ("Acts as"), restriction (`<AppApiKeyAnchor>`), rate limit, IP allowlist, dates, uses and the scopes
  (AppPermissionList); footer actions from the same states, disabled ones say why. My API keys
  re-reads the key from `GET /api-keys/{id}` while it is open.
- **My API keys** (`useApiKeysWorkspace`, `pages/app/api-keys.vue`): `GET /api-keys/` returns
  every key, so search (name, prefix, description), the status filter (`live` = active and
  suspended by default, active, suspended, expired, revoked, all) and pages are client-side in
  the route query (`q`, `status`, `page`). Columns: key, status, scopes (count + popover),
  restricted to (EnterpriseRBAC), expires (Soon under 7 days), created, last used.
- **Personal key dialog** (`<AppApiKeyFormDialog :target>`, `useApiKeyFormDialog`;
  `ApiKeyFormTarget` = create | edit | replace; `personalKeySchema`): Key (name, description,
  Live/Test with the label-only copy), Access (on EnterpriseRBAC "Restrict to entity" over the
  account's memberships in force plus "Include child entities"; scopes through AppScopePicker
  from `GET /api-keys/grantable-scopes?entity_id&inherit_from_tree`, refetched per restriction,
  with loading, error and empty states and the allowed action prefixes explained), Limits
  (`<AppApiKeyLimitsFields>`: whole-number rate limit or "No rate limit", expiry presets on create
  and a read-only expiry on edit, IP allowlist tags). Selected scopes the server no longer
  offers are flagged; a create, or an edit touching scopes or the restriction, must drop them
  (AppFormDialog `validate`).
  Edit sends only changed fields (`useDirtyPatch`). A replacement copies the expired key's
  settings with the preset closest to its old lifetime.
- **Pickers**: `<AppScopePicker v-model :options :flags :label?>` is the options-driven, grouped-by-
  resource scope picker for keys (names resolved through the permission catalog when readable,
  else from their parts); its search box is named by `label` ("Scopes"). It is its UFormField's
  input: a selection the admin changes (an option picked, a chip removed) is reported to the form
  as a `change`, as AppDateField does, so the Scopes field validates again and a `validate` rule
  that depends on the selection (a scope no longer offered) follows it at once.
  AppPermissionPicker stays the role editor's catalog-pooled picker.
- **Known gaps (backend)**: rotate issues an active key and drops a passed expiry (the console
  prevents both; the API does not); the restriction picker lists memberships only (a superuser
  cannot restrict a key to any other entity from here). Each membership names its entity
  (outlabs-auth 0.1.0a35 `entity_display_name`), so an account that cannot read entities still
  sees the names; "An entity you belong to" is left for a key restricted to an entity the account
  no longer belongs to and cannot read.

## User detail (`pages/app/users/[userId].vue`, `useUserDetail`, `components/app/user/*`)
- **Frame.** The page binds `useUserDetail`: the record, its not-found state (a malformed id is
  never sent; 404 and 422 read "User not found" with Back to users) and denied state, the tabs, and
  the navbar actions. A failed refresh keeps the loaded page (`AppQueryState has-data`).
- **Tabs** are the route query `?tab=` (Overview, Access, Security, History; access before
  history), a `UNavigationMenu` in a `UDashboardToolbar`. Back leaves the record for the list
  rather than stepping through tabs. A card whose capability the server lacks is hidden, not
  flagged (Personal API keys without `api_keys`; Audit timeline without `activity_tracking`;
  Memberships and Membership history without memberships); History is hidden when it has no card.
- **Composition.** Each card is a component with its own composable, mounted only once the record
  loaded, so none of its requests fire for a missing account: `AppUserProfileCard`,
  `AppUserRolesCard`, `AppUserMembershipsCard`, `AppUserAccessCard` (`useUserAccess`),
  `AppUserSessionsCard`, `AppUserApiKeysCard`, `AppUserAuditCard`, `AppUserMembershipHistoryCard`
  (`useUser<Card>(user)`), and the dialogs `AppUserStatusDialog`, `AppUserResetPasswordDialog`,
  `AppUserSuperuserDialog`, `AppUserCheckAccessDialog` (`useUser<Dialog>(user, open)`). Each SFC still binds exactly one composable; cards that read the
  same key (direct roles, memberships, the first membership-history page) use the same `enabled`.
- **Actions.** `useUserPolicy(user)` gives `canEdit` (userRowPolicy) and `canManage` (another
  account: status, password reset, sessions). The navbar holds Edit and a "More user actions" menu,
  built only for a loaded record: Change status (active/suspended/banned accounts only; an invited
  account offers Resend invite), Reset password (Set password for an account without one,
  `has_password` false; neither for an invited account, which sets its own by accepting the
  invitation), Resend invite and Restore (both confirmed), Your account (self), Grant/Revoke
  superuser (superusers, not self), Delete user last (typed email; the account is kept as deleted
  and the page shows it). The Profile card's Password row says whether one is set
  (`passwordStateLabel`); the dialog's title, effects and button come from
  `adminPasswordDialogCopy` (`utils/users.ts`).
- **Status.** Change status opens on the real status with a timed suspension's day; the stored end
  is sent back unchanged unless the day changes (`suspendedUntilForSave`), so a reason never makes
  a timed suspension indefinite. outlabs-auth does not lift a suspension by itself. Superuser
  grants need a reason (audited) and the typed email.
- **Sessions.** Revoke one session or Sign out everywhere (`useRevokeUserSession`,
  `useRevokeAllUserSessions`, user:update on another account). The refresh token ends at once; an
  issued access token works until it expires unless the host enables the token blacklist, and the
  copy says so. Reset password ends every session at once (outlabs-auth refuses older access
  tokens) and clears a lockout. The server marks "This browser" (`is_current`) only on the admin's
  own account, which is managed from Account, not here; outlabs-auth 0.1.0a35 has no keep-current
  option for another account, so there is no "Sign out other devices" on user detail.
- **Access.** Direct roles, Memberships (EnterpriseRBAC) and Effective permissions, in that order.
  - *Grants* (`utils/access-grants.ts`). Both grant cards read every status (role-memberships with
    `include_inactive`; `userAllMembershipsQuery` reads every page) and show the **live** grants
    (stored active or suspended) by default, so a suspension never makes a row vanish; "Include
    ended" adds revoked and expired ones. Rows show the effective status, the window
    (`<AppGrantWindow>`), who granted it and when, and an ended grant's note.
  - *Never re-grant (F-015).* Edit assignment / Edit access open only on a live grant, with its real
    status, send only what changed (`useDirtyPatch`) and re-read the record first (Reload /
    Overwrite; a grant ended meanwhile is a conflict). A suspended or ended grant offers
    **Reactivate** (`<AppAccessReactivateDialog :target>`, also on the entity Users card): it lists
    what comes back, writes status Active plus only a changed Valid until (cleared when the stored
    end has passed) and a written note. Remove is offered on live grants only; a suspended direct
    role is revoked through its PATCH (DELETE answers 404 for it). An assignment of an inactive or
    archived role offers no Reactivate. Assign roles never offers a role with a live assignment
    (the API would reactivate a suspended one in place); a revoked or expired one is assignable.
    The entity Users card re-reads through the entity's own member list when the user's
    memberships cannot be read, and a re-read that fails stops the save and says so.
  - *Writes follow the account.* Every grant write also needs `useUserPolicy(user).canEdit`, so a
    deleted account (its Access tab says to restore it) or, for a delegated admin, a superuser
    account offers none.
  - *Dialogs.* Assign roles, Add membership and Edit access are `AppFormDialog` + Zod
    (`schemas/membership.ts`). A multi-role assign tries every role and reports each refusal
    (`assignOutcomeSummary`), keeping only the refused roles selected. A user without an
    organization can be given a first membership; the dialog says it places them in that
    entity's organization.
  - *Names.* A membership names its entity itself (outlabs-auth 0.1.0a35 `entity_display_name`,
    `entity_name`), which comes first; `useMembershipEntities` (the Memberships and Effective
    permissions cards share it) supplies the rest and the status: the admin's organization (all
    statuses) or, for a superuser, the active list plus `entityPathsQuery`, with an "Entity
    inactive" badge (an "(inactive)" suffix on an effective permission's origin). Role chips use
    the membership history's names, then the catalog, then the membership's own `role_names`
    where `membershipRoleDisplay` can tie one to an id ("Loading role..." while either source is
    still loading, then "Unknown role" with the id inside, never a raw id). Names it cannot tie to
    an id are shown alone, as outline badges, in place of the chips they stand for (see the Roles
    kit's Display).
  - *Effective permissions* (`<AppUserAccessCard>`, `useUserAccess`): `GET /users/{id}/permissions`
    grouped by resource with search, each with a source role chip and where that role comes from
    (direct assignment, or the entities whose memberships carry it). It is RBAC across every entity
    and says so; **Check access** (`<AppUserCheckAccessDialog>`, permission:check where the
    permissions router is mounted) asks `POST /permissions/check` about chosen permissions,
    optionally inside one entity, and lists Allowed/Denied per permission.
- **History.** Actors are named by `<AppUserLabel :user-id :subject-id>` ("You", or the account's
  email, read only where the API answers: global admins, the subject itself). Membership history is
  a `UTimeline` with roles added and removed (`membershipHistoryChanges`); the audit timeline
  filters by category on the server and links to the Audit workspace for events about the user or
  actions by them. Its events are `AppAuditEventCard context="user"` (see Audit below).

## Audit (`pages/app/audit.vue`, `useAuditWorkspace`, `utils/audit.ts`, `utils/audit-redaction.ts`)
- **Coverage.** `GET /audit-events` returns account events only (sign-ins and sessions, passwords
  and API keys, invitations, memberships, role assignments, superuser, profile, status). The page
  and its guide say so; role/permission definition, service-account and settings changes are not
  recorded by outlabs-auth (backend). A non-global admin on EnterpriseRBAC (`useActorReach`) is
  told the search is limited to their organization (the API scopes it by root entity).
- **Filters** are typed controls in a `UDashboardToolbar`, kept in the route query by
  `useListQueryState` (`category`, `eventType`, `subjectUserId`, `actorUserId`, `entityId`,
  `range` or `occurredFrom`/`occurredTo`, `page`, `limit`): Category `USelect` over
  `AUDIT_CATEGORIES`; Event type `USelectMenu` over `AUDIT_EVENT_TYPES` (narrowed by category,
  `create-item` for a type the console does not know); About/Actor `AppUserPicker`; Entity
  `AppEntityPicker` (EnterpriseRBAC only); dates as presets (`24h`/`7d`/`30d`/`90d`, kept as the
  id so a link stays relative, resolved to an instant at request time) or a `UCalendar` range of
  whole days (start/end of day in the admin's time zone). Below `xl` the pickers move into a
  Filters `USlideover` (below `sm` all but Category). Active filters are removable chips. A
  malformed id from a link is not sent (the API would 422 the whole search); a warning says so.
- **Events** are a `UTable` (time, humanized event + severity badge, about, actor, entity) with an
  expandable row: `AppAuditEventDetails` (changes table from `auditChanges`, context
  `AppDetailList` with the actor named by AppUserLabel through `#value-actor`, pivot links, raw
  payload in a `UCollapsible`). Below `sm` the event cell adds "About <email>", below `md` "By
  <actor>" or "Actor not recorded" (the About and Actor columns are hidden there). Emails,
  Before/After values and pivot links use `wrap-anywhere` (breaks at spaces first, and lowers the
  min-content width), so a long value never pushes the table under its pinned details column. On user and entity pages the
  same event is an `AppAuditEventCard` (an `article` with an `h3`, the same details in a
  `UCollapsible`); `useAuditEventView` derives both. Pivots are links to `/app/audit?…`, offered
  only with `canAccess('audit')`, so they work from any page.
- **Redaction** (`redactAuditPayload`, `isSensitiveAuditKey`) is by exact field name or suffix
  (`password`, `client_secret`, `*_token`, `key_hash`, …); `*_id`, `*_prefix`, `*_count`,
  `*_expires`, `*_at` and `last_*` stay readable. Every view, the changes table and the export use it.
- **Export** (`exportAuditEvents` in `queries/audit.ts`): CSV or JSON of the filtered query in
  pages of 100 over one fixed window (relative range resolved once, upper bound pinned), with
  progress and Cancel, capped at `AUDIT_EXPORT_MAX_EVENTS` (the JSON says `complete: false` and the
  toast says so when capped); CSV cells that start like a formula are neutralised.

## Dashboard and Settings (`useDashboard`, `useSettings`, `utils/capability-labels.ts`)
- **Dashboard.** Admins get tiles, each the `total` of one `limit=1` request gated on its section
  (active, invited, suspended and membership-less users, roles, permissions, organizations or a
  delegated admin's entities, and wrong passwords on existing accounts in 24 hours, the only failed
  sign-ins outlabs-auth audits) and linking to the filtered list, each link named with its count
  (`dashboardTileLabel`, `utils/dashboard.ts`), plus
  the latest audit events. Accounts with no admin tile get `AppDashboardMyAccessCard` (scope,
  permissions, memberships in force; the same reads as Account › Access) and a launcher of the
  sections they can open. The unknown-contract warning (`useApiContractNotice`) shows to admins
  here and in Settings.
- **Settings** requires `consoleAdmin`: any read of an admin section this backend offers (tree
  grants count), resolved per backend by `resolveRequirement` / `consoleAdminPermissions`, so
  SimpleRBAC never asks for `entity:read`; a backend with no admin section leaves it to
  superusers. The Auth server card labels features, routers and sign-in methods through the one
  label map (`featureList`, `surfaceLabel`, `enabledAuthMethods`); `featureList` leaves out the
  flags the backend reports as always on (`ALWAYS_ON_FEATURES`), and the Audit log line follows
  the mounted `audit` router (`auditLogSummary`). Entity types show where the
  config router is mounted and `entity_hierarchy` is on; superusers edit them in an
  `AppFormDialog` with four `UInputTags`, sending only the changed groups; the only rule is the
  backend's (one root type across both classes).

## Forms and dialogs — the shared kit
Every create, edit and confirm dialog is built from the same pieces, so they behave identically: the
actions sit in the footer, a running request cannot be dismissed, unsaved input is never lost to a
stray key, and destructive copy says what the backend really does. Nuxt UI's form system (UForm +
Zod) is the only form system.

- **`AppFormDialog`** (`components/app/FormDialog.vue`) — a UModal whose body is one
  `<UForm :id :schema :state>` and whose footer holds a ghost Cancel and the submit button (bound
  through `:form`). Props: `v-model:open`, `title`, `description?`, `schema`, `state`,
  `submit-label`, `submit-color?`, `cancel-label?`, `error?` (the `inline` ref, rendered as
  `AppApiErrorAlert`), `pending?` (UForm's own loading is used too), `dirty?` (default: state vs a
  snapshot taken on open), `require-changes?` (submit disabled until dirty), `submit-disabled?`,
  `size?` (`md` | `lg` = `sm:max-w-2xl` | `xl` = `sm:max-w-3xl`), `discard?` (prompt copy),
  `conflict?` (`{ fields }`, with `@reload` and `@overwrite`), `validate?` (client-side rules the
  schema cannot express because they depend on more than the state, run with it on every
  validation; never set such an error once from `@submit` with `setErrors`, which UForm's next
  validation of that field replaces), `@submit` (awaited), `@invalid`
  (client-side validation failed, after focus moved: e.g. open a collapsed "Advanced options"
  section that holds the invalid field, as the entity create dialog does). Fields go in the
  default slot as `<UFormField name label required>`. It exposes its inner UForm for
  `useDialogForm`. Fields validate on blur only once the open transition has finished: a dialog
  opened from a dropdown menu sees focus leave and come back while it opens (the menu hands focus
  to its trigger as it closes), and that blur must not flag an untouched field. A flagged field
  follows the typing: while any field shows a message, every change to the state re-validates the
  flagged fields at once (UForm's `validate({ name, silent })`, as AppConfirmDialog does for its
  typed text). A press on the footer (or on the conflict warning) holds the form until the click
  it makes: validate-on is empty, that re-check waits and the conflict warning keeps its state.
  The dialog is centred, so a message that appears or clears moves the footer, and the press on
  Save is itself what takes the focus out of the field being edited: that is when UForm validates
  the field, and when a number field (`UInputNumber`, which writes its value only on blur or
  Enter) or a tags field with `add-on-blur` writes what was typed. Without the hold the release
  could land beside the button (Decisions, 2026-10-02). The click's submit validates everything;
  a press that submitted nothing re-checks the flagged fields when it ends (the next task after a
  mouse or pen release; a touch waits for its click, at most a second). Leaving a field still
  flags it; UForm's own rules (blur, change, 300 ms after typing in a field already left once)
  decide when an unflagged field is first checked.
  Enter submits from any text field except a tags field (`UInputTags`), where it only adds the
  tag, empty or filled (`utils/tags-enter-guard.ts`): the footer button is the form's default
  button, and reka's tags input cancels Enter only after a tick and never on an empty field, so
  the browser would otherwise submit a half-finished form. Capture-phase `keydown`/`keypress`
  listeners on a wrapper around the form arm the guard until the next task, and a capture-phase
  `submit` while armed is cancelled before UForm runs. The key event itself is never cancelled
  (reka would then skip adding the tag), and a click on the submit button right after a tag Enter
  still submits.
- **`useDialogForm(refName)`** — the `form` option for `useApiAction().run`, for the
  `<AppFormDialog ref="refName">` of the calling component: server issues land on the fields.
- **`AppConfirmDialog`** (`components/app/ConfirmDialog.vue`) + **`useConfirmAction`** — the one
  confirmation. Title "<Verb> <target>", an error-subtle "What happens" list of concrete effects in
  the backend's terms (retain-delete vs archive, revoked, restorable or not), an optional typed
  confirmation (`confirmText`: the email, name or slug) for user delete, role archive, entity
  archive, superuser grant and service-account archive, and the dialog's own error alert. Content
  in the default slot renders above the effects (context); the `acknowledge` slot renders after
  them and before the typed confirmation, so an acknowledgement is ticked once the effects are
  read; `confirm-disabled` keeps Confirm off until it is satisfied (entity archive: the cascade
  acknowledgement checkbox). The
  typed text is checked on submit (Enter) only; the disabled confirm button is the live feedback,
  so the field never opens flagged. After a flagged submit the message follows the typing and
  clears on a match, never on blur, so Confirm does not move under the click that follows. The
  controller holds `open`, `target`, `pending`, `error` and the `dialog` props; `ask(row)` opens it,
  `confirm()` runs the action and closes on success (a gone record closes it with a toast).
- **`useDialogGuard({ open, dirty?, pending?, hold?, discard? })`** — used by both dialogs; for a
  hand-built UModal bind `dismissible`, `onUpdateOpen` and `requestClose`. While pending, ESC, the
  overlay, X, Cancel and browser Back do nothing. While dirty (or `hold`, e.g. a one-time secret)
  they ask "Discard changes?" first (a stacked AppConfirmDialog via `useOverlay`). Browser
  Back/Forward with a dialog open closes the top dialog and stays on the page (other navigations
  are never blocked). Reload and tab close are warned while a dialog is dirty, held or pending.
- **`useDialogReturnFocus(open)`** — used by both dialogs (pass its `onCloseAutoFocus` in UModal's
  `content`): a dialog opened from a row menu item returns focus to that row's menu button when it
  closes (the item itself is gone by then, so reka's default fell back to the page body). Any
  other opener keeps reka's default return. A hand-built UModal opened from a menu should use it.
- **Select menus in forms carry `aria-label` equal to their field label.** reka names a
  USelectMenu trigger "Show popup", which overrides the UFormField label for screen readers; the
  accessibility gate fails on a trigger still named that way.
- **`useDirtyPatch(state, toWire, { always? })`** — edits send only what changed: `snapshot()`
  after filling the form, then `patch` (changed keys, plus `always` keys such as an audit note when
  anything changed), `dirty`, `changed` and `conflicts(serverState)`. The API has no version or
  ETag, so an edit that must not clobber a concurrent change re-reads the record before saving and
  shows AppFormDialog's `conflict` when a field it changed was changed by someone else (Edit
  assignment does this). Overwrite submits through the form (schema validation and the pending lock
  apply) and calls the `@overwrite` handler, awaited like `@submit`; the warning hides as soon as
  the admin edits the form after it appeared, and the next save checks the server again. Pure
  diffing lives in `utils/dirty-patch.ts`.
- **`schemas/common.ts`** — shared Zod pieces: `requiredText(label, max?)`, `optionalText(max?)`,
  `emailText`, `reasonText`, `dateInput`, `tagList`, `validityWindowShape` + `checkValidityWindow`
  (superRefine; the issue lands on `validUntil`), and the account-name rules: `newAccountNameText`
  (optional, 100 characters) and `accountNameText(label, isSet, message)` (a name the account
  already has can be changed but not removed, as outlabs-auth refuses to clear one; Account's
  profile and the admin's Edit profile share it). Keep schema keys in the form's visual order: the
  first failing field is focused.
- **Dates** — `AppDateField` (`v-model` 'YYYY-MM-DD', '' or `INCOMPLETE_DAY`; `label` for
  assistive technology) is Nuxt UI's `UInputDate` (typeable segments) with a calendar popover,
  inside a `UFormField`. A day is a whole day in the admin's time zone: send "from" days with
  `startOfDayIso`, "until" and "suspended until" days with `endOfDayIso` (23:59:59.999 local), read
  instants back with `toDateInput`, and say so with `endOfDayHelp()` (`utils/validity.ts`). When
  focus leaves a field with only some segments typed, its value is `INCOMPLETE_DAY`, never '':
  `dateInput` rejects it ("Enter the whole date, or clear it."), and a validity window spreads
  `validityWindowShape` and adds `checkValidityWindow`, so every day field is validated by the
  form's Zod schema and nothing else. Calendar picks and partial entries reach UForm through Nuxt UI's
  form-field bus (`formBusInjectionKey` / `formFieldInjectionKey` from
  `#ui/composables/useFormField`), its integration point for custom inputs but not a documented
  export: recheck it on every Nuxt UI upgrade (the dialog-kit E2E "a calendar pick re-validates its
  field" fails if it breaks). Never a native `<input type="date">`. A calendar pick closes its
  popover in a macrotask (`setTimeout 0`) so the surrounding UModal is not dismissed mid-click.
  Never pass a text `placeholder` to UInputDate: the prop is a DateValue and a string crashes it
  (`defaultPlaceholder.copy is not a function`); say "leave empty for no expiry" in the help text
  instead.
- **Passwords** — every password field is `<AppPasswordInput>` (a UInput with a Show/Hide toggle in
  its trailing slot) inside its `UFormField`: sign-in, signup, invitation, reset, Account ›
  Security and the admin dialogs that set one. A new password follows the policy the backend
  publishes (`/auth/config` `password_policy`): `usePasswordPolicy()` resolves it
  (`resolvePasswordPolicy`, `utils/password-policy.ts`: the request models' 8 to 128 characters
  applied, outlabs-auth's default while the capabilities are unknown) and gives `policy` and
  `hint`. The composable that owns the form builds a computed schema from `policy` with the
  factories in `app/schemas` (`newPasswordSchemaFor` inside `registerSchemaFor`,
  `setPasswordSchemaFor`, `changePasswordSchemaFor`, `createUserSchemaFor(rules, policy)`,
  `resetPasswordSchemaFor`) and returns it with `hint`, which the field shows as `help`; pages
  and components bind both and import no schema for it. `passwordPolicyProblem` mirrors the
  server's check exactly and reports its first broken rule in the server's order (length in code
  points, `[A-Z]`, `[a-z]`, `\p{Nd}` for Python's `\d`, then membership of
  `special_characters`). UForm does not re-validate when its schema changes, so a guest or
  Account form calls `useRecheckOnSchemaChange(form, schema)`: a policy that arrives after the
  form rendered (the capabilities failed to load at boot) re-checks the flagged fields, after the
  render so UForm already holds the new schema. Admin dialogs open only on pages that need the
  capabilities loaded. The server's refusal (INVALID_PASSWORD) still lands on the field
  (`passwordPolicyError`).
- **One-time codes** — a code is a UForm field like any other: `<UForm :schema="codeSchemaFor(length)"
  :state="{ code: digits }">` with `UPinInput` inside `<UFormField name="code">`; the last digit
  submits the form (`@complete` → `form.submit()`), and Verify is a submit button. A code the
  server refuses (`codeFieldError`, `utils/auth-messages.ts`) is the field's `error`, kept until the
  next attempt while the boxes are cleared and refocused; rate limits and network failures stay
  toasts. Shared by `AppAuthOtp` (sign-in, access code, recovery) and Account's phone verification.
- **Conventions** — one dialog per action; "Create <noun>" for the trigger, title and submit of a create dialog; "Save
  changes" for edits; "<Verb> <noun>" for destructive buttons; setting-style booleans are a
  `USwitch` inside a `UFormField` with a label and description; lists are `UInputTags`; reset
  create dialogs on every open.

The permissions create dialog (`pages/app/permissions/index.vue` + `usePermissionsWorkspace`) is the
reference create dialog, Edit assignment on the user detail page (`useUserRolesCard`) the reference
edit dialog, and the user delete (`userDeleteCopy`, list and detail) the reference typed confirmation.

## Roles & permissions — the shared kit
Roles and permissions surface in many places (role detail, role create/edit, member add/edit, user
detail, invite). They are shown and picked **only through one kit** so they read identically
everywhere — never ad-hoc badge lists or `USelectMenu`s:
- **Grant** — `AppRoleAccessEditor` is the one role-assignment workspace for every access dialog:
  the selection as removable chips, `AppRolePicker` and the `AppEffectivePermissions` preview side
  by side from `sm` (stacked below), each in a fixed-height scroll box so validity and reason stay
  in view. Order the dialog Roles, then Status/Validity, then Reason. `grant="direct"` marks direct
  user grants: a system-wide role there warns that it reaches every organization. Pass the pool's
  `truncated` so the picker says when not every role could be loaded; `collapse-when-empty` (for an
  optional Roles section such as Invite) shows only the pool's `emptyText` while there is nothing
  to offer and nothing selected.
- **Pools** — `useAssignableRoles(target, { enabled, exclude })` builds every picker's pool: only
  the roles the backend accepts for the target (`{ kind: 'direct', rootEntityId }` or
  `{ kind: 'entity', entityId }`), each tagged with its `type` and the `missingPermissions` a
  non-superuser actor lacks (listed but disabled — delegation containment). For an entity it asks
  `GET /roles/entity/{id}` when the actor holds `role:read_tree`, otherwise it applies the same
  rules (`app/utils/role-access.ts`, a unit-tested port of the backend checks) to the role catalog
  and the entity's path. It reports `status` (`idle` until an entity is chosen, `denied`, `pending`,
  `error`, `success`), an `emptyText` for the picker and `truncated`. Never hand-build a pool from
  `rolesListQuery`. Known gap of the fallback: it can only offer roles the catalog shows, and
  `GET /roles/` is scope-filtered — actors without global scope never see system-wide roles (or
  entity-local roles outside their entities). Their membership pools therefore lack system-wide
  roles even where they hold every permission those roles carry; closing that needs a backend
  "grantable roles at this entity" answer they can read.
- **Display** — `AppPermissionList` (permission NAMES → grouped-by-resource, enriched via the
  catalog; compact badges that are keyboard-focusable, or `detailed` rows — also used automatically
  on devices without hover — whose names link to the permission's page where the actor can read
  permissions), `AppEffectivePermissions` (what a set of roles grants; inactive roles
  grant nothing, and entity-only or ABAC-conditioned roles retitle it "Grants up to" with the caveat
  spelled out) and `AppRoleChip` (a role as a button; click, tap or Enter opens its permissions).
  Pass chips every name the payload carries (`RoleSummary`, history `role_names`): names win over
  the catalog, and an unnamed role reads "Unknown role", never a raw id. An entity membership's
  `role_names` (outlabs-auth 0.1.0a35) are system names sorted by name while its `role_ids` are
  sorted by id, so they are never paired by position: `membershipRoleDisplay`
  (`utils/role-access.ts`) ties a name to an id only for a single role, or for the one role left
  once the catalog (`useRoleCatalog().systemNames`) names the others; when the names it cannot
  tie are exactly as many as the unnamed roles they are shown as outline badges in their place,
  otherwise those roles stay "Unknown role" (a wrong pairing would mislabel access). While the catalog, or a
  name source the caller flags with `namePending`, is still loading, the chip reads "Loading
  role..." with `aria-busy`, and its popover says it is loading instead of "outside the roles you
  can read" or "not visible to you".
- **Pick** — `AppPermissionPicker` (permissions; non-held ones disabled for delegated admins, who
  fall back to their own grants when they cannot read the catalog) and `AppRolePicker` (roles; type
  badge per row on EnterpriseRBAC): both Nuxt UI `UCommandPalette` multi-selects bound to name/id
  arrays via `value-key`. Neither autofocuses: the dialog's first field owns the focus. While their
  options load, or when there are none, they (and AppScopePicker) say so in place of the palette
  ("Loading roles...", `role="status"`): a listbox may hold options only, and the palette's own
  empty message sits inside it (axe `aria-required-children`). Its no-match message while a search
  finds nothing does too; that state is stock Nuxt UI and outside the a11y sweep.
- **Data** — `usePermissionCatalog` and `useRoleCatalog` are the single cached sources, gated on
  the Permissions / Roles section requirement (`canAccess`) so actors without the read permission
  never fire a denied request. The role catalog loads every page (bounded, with `truncated`).
  The preview's ABAC flags (`useRoleConditionFlags`) cache one entry per role, so changing a
  selection only looks up the roles not seen within the stale time.

When you need to show or choose a role/permission, reach for these and extend them; don't hand-roll a
badge list or a select. Permission badges show the full sub-action (`create_tree`, not `create`) so
tree variants stay distinct.

## Authorization & capabilities — one predicate
What the backend exposes and what the actor may do are decided in ONE place, so the sidebar, the
route guard and each page agree for every persona and preset:
- **Permission algebra** — `app/utils/permissions.ts` is a pure port of the backend
  `PermissionMatcher` (`*:*`, `resource:*`, `x_all`, `x_tree` implications). `useAuth().hasPermission`
  / `hasAnyPermission` use it; call sites keep asking for base names (`membership:read` is granted
  by `membership:read_tree`). Never compare permission strings yourself. Unit tests:
  `test/unit/permissions.test.ts`.
- **Capabilities** — `app/utils/capabilities.ts`: `mounted_surfaces` is the real availability signal
  (several feature flags are constant true). `useAuth()` exposes `hasSurface(name)`, `isEnterprise`
  (entity_hierarchy AND the entities router — false on SimpleRBAC), `hasMemberships`,
  `configState`, `permissionsState` and `apiContract`. Gate every entity/tree/root-org/membership/scope control and
  every `/entities` or `/memberships` query on `isEnterprise` / `hasMemberships`.
- **Sections** — `APP_SECTIONS` lists each nav item with its requirement (surfaces AND features AND
  permission). `useAppNavigation` builds the sidebar from it, `middleware/auth.global.ts` redirects
  a route whose surface/feature is absent, and a page wraps its body in
  `<AppPermissionGate section="…">` and enables its queries with `canAccess('…')`. Change a
  section's requirement there, never in the page. Cross-links use `canAccess(section)` too.
- **Denied / unavailable** — `AppPermissionGate` renders a UEmpty naming the missing permission
  (page level, with a dashboard action) or, with `permission` + `label` + `compact`, inside a
  card, or `section` + `label` + `compact` when the card IS another section's data (entity
  activity uses `section="audit"`). Toolbars and header actions render only when the read gate
  passes. Without a resolved
  `/auth/config` every capability-gated section fails closed with Retry. Without the actor's
  permissions (`useAuth().permissionsState`, built like `configState`) a non-superuser's
  permission-gated section fails closed too, but shows "Loading your permissions" or "Couldn't
  load your permissions" with Retry instead of the denial; the shell adds one persistent notice
  (`usePermissionsNotice`) and the nav keeps those sections hidden. Requirements are read through
  `resolveRequirement`, so the permissions a denial names are the ones that open it here.
- **Contract** — only an `api_contract_version` whose major parses AND differs from the
  supported one blocks the app with the configuration error screen (`useAppConfigError`). An
  absent or unparseable version is `unknown`: the console runs and Settings (and the admin
  dashboard) show a warning, so a
  reporting-format change never locks operators out.

## App shell & navigation (`app/layouts/default.vue`, `app/app.vue`)
The shell follows the Nuxt UI dashboard template: `UDashboardGroup` > a collapsible, resizable
`UDashboardSidebar` (search button, grouped navigation, Settings pinned at the bottom, the user
menu in the footer) + `UDashboardSearch` + the page's `UDashboardPanel`s inside one `<main>`.
- **Navigation data** — `APP_SECTIONS` entries carry `nav` (an `APP_NAV_GROUPS` id: overview,
  Directory, Access control, Integrations, Monitoring, the bottom `system` list, or `user` for the
  actor's own pages) and one `label`, used by the menus, the page and document title and the back
  links alike. Within a group, `APP_SECTIONS` order applies unless the group sets `order` (the
  user menu reads Account, My API keys).
  Add or move a page by editing its entry; never hand-build a menu.
- **`useAppNavigation()`** → `{ sections, sidebar, sidebarBottom, userSections }`, all filtered
  by `canAccess`. `sections` is in shell order (`shellOrder`: the sidebar top to bottom, then the
  user menu), which the command palette's "Go to" and the dashboard launcher follow. `sidebar` is `NavigationMenuItem[][]` (one list per group, headed by its label);
  items stay `active` on detail routes with `aria-current` `page`/`true` (`navCurrentFor`).
  `useCapabilitiesNotice()` (called once by the layout) owns the "can't load capabilities" toast.
- **User menu** (`AppUserMenu`, `useUserMenu`) — Account, My API keys, Appearance (system /
  light / dark via `useColorMode`), Sign out. Works collapsed and in the mobile drawer. Every
  shell sign-out entry (menu, palette) calls the one `useSignOut()`.
- **Command palette** (`AppCommandPalette`, `useCommandPalette`) — Cmd/Ctrl+K or the sidebar
  button. "Go to" lists every accessible section; Users, Roles and Entities search the server
  (debounced, 5 results) through the existing list queries only when `canAccess` that section.
- **Titles** — `app.vue` gives every route a title from its section (`routeFallbackTitle`) or
  guest page with the `"<page> · <app name>"` template; `NuxtRouteAnnouncer` reads it after each
  navigation. Record pages call `usePageMeta(() => record?.name)` →
  `"<record> · <section> · <app name>"`. Never set `title` with `useHead` in a page directly.
- **Landmarks** — the layout renders one `<main id="main-content" tabindex="-1">` around the
  page panels and a "Skip to main content" link first in the tab order. Pages must not add
  another `main`.
- **Detail navbars** — `#leading` holds `<UDashboardSidebarCollapse />` then
  `<AppBackButton section="users" />`: Back goes through history when the previous entry is
  another console page, else to the section's list (`useBackNavigation`, `historyBackTarget`).
  The history entry is re-read after every in-page navigation; an entry on the same path (a
  query-driven tab or filter of the same record) counts as the record itself, so Back then goes
  to the list. A master-detail page whose record is a query of its list route (Entities) keeps
  its close action instead of a back link.
- **Scroll and focus memory** — the window never scrolls in the dashboard; panel bodies (and
  tables inside them) do. `plugins/02.panel-memory.client.ts` records the page's scrolled
  elements and focused link when leaving a console page; `router.options.ts` restores them when
  Back/Forward returns to that history entry, retrying until the list has rendered (up to 3 s or
  the first user input). A `#hash` on a console route scrolls its anchor into view inside its
  panel. Guest pages keep Nuxt's default window scrolling (saved position, `#hash` anchor, top;
  `definePageMeta({ scrollToTop: false })` opts out). `planScroll` (utils/navigation.ts) holds
  these rules. Nothing to do per page.
- **Motion and loading** — under `prefers-reduced-motion`, `app.vue`'s `UTheme` turns off modal,
  slideover and palette transitions. Loading placeholders carry `role="status"`.
- **Mobile** — every navbar keeps the drawer toggle and its title on screen at 390px: at most
  one labelled action in `#right`; secondary actions are icon-only with `aria-label` + `UTooltip`.

## Guardrails (lint)

The layering and styling rules are mechanical, not review-only (`eslint.config.mjs`,
`eslint-rules/console.mjs`):

| Rule | Where | Rejects |
|---|---|---|
| `no-restricted-globals` | `app/**` except `app/api/**`, `utils/runtime-config.ts` | `fetch`, `$fetch`, `useFetch`, `useLazyFetch`, `useAsyncData`, `useLazyAsyncData` |
| `no-restricted-properties` | the same files | `window.fetch`, `globalThis.fetch`, `self.fetch`, and `$fetch` on any object (`useNuxtApp().$fetch`, destructured too) |
| `no-restricted-globals` | pages, components, layouts, `app.vue`, `error.vue` | the above plus `useQuery`, `useMutation`, `useInfiniteQuery`, `useQueryCache`, `useMutationCache`, `useQueryState`, `defineQuery`, `defineMutation`, `defineQueryOptions` |
| `no-restricted-globals` | `app/stores/**` | raw requests plus running queries or mutations (`useQueryCache()` stays allowed) |
| `@typescript-eslint/no-restricted-imports` | `app/**` except `app/api/**`, `app/queries/**` | importing `apiClient` (error helpers and types stay allowed); importing the raw-request helpers from `#imports` or `#app` |
| `@typescript-eslint/no-restricted-imports` | `app/queries/**` | importing the raw-request helpers from `#imports` or `#app` |
| `@typescript-eslint/no-restricted-imports` | `app/stores/**` | the above plus importing the query and mutation functions from `@pinia/colada`, `@pinia/colada-nuxt`, `#imports` or `#app` |
| `@typescript-eslint/no-restricted-imports` | pages, components, layouts, `app.vue`, `error.vue` | value imports from `@pinia/colada`, `@pinia/colada-nuxt`, the API client module or `app/queries/*` (any alias or relative path); the Colada and raw-request functions from `#imports` or `#app`. Type imports stay allowed |
| `console/no-raw-tailwind` | `app/**` (template and script strings) | arbitrary values, variants and properties (also when interpolation splits them: `` `w-[${n}px]` ``); raw palette colours; shades of the semantic aliases (`text-primary-500`) |
| `console/ui-allowlist` | `app/**/*.vue` | `ui` except as an object literal on `UModal`/`USlideover` `content` (max-width only), `UDashboardPanel` `body`, `UDashboardSidebar` `footer`, each slot a string literal or a choice between literals; `ui` inside an object `v-bind` |
| `vue/no-restricted-static-attribute`, `vue/no-restricted-v-bind`, `vue/no-restricted-block` | `app/**/*.vue` | `style`, `:style`, `<style>` |
| `no-restricted-syntax` | `e2e/**` | `locator('#id')` (locate by role and label) |

Every rule has a negative fixture in `eslint-fixtures/` (mirroring `app/`), linted by
`test/unit/lint-guardrails.test.ts`: a rule that stops firing, or starts firing on an allowed
pattern, fails the unit tests. Add a fixture line with every new rule.

## Definition of done (per feature)
- SFC: template + one composable call; no queries/mutations/handlers/try-catch inline (lint).
- Logic in `composables/`; server IO in `queries/` with a key factory.
- Mutations go through `useApiAction().run` (dialog forms pass `form` + `inline`); query errors
  through `useApiErrorMessage` / `useApiError`; no raw `try/catch`+`toast` and no manual `refetch()`.
- Dialogs are `AppFormDialog` / `AppConfirmDialog` (or a UModal wired to `useDialogGuard`) with a
  Zod schema from `app/schemas/`; edits send only changed fields (`useDirtyPatch`).
- Mutation wrappers invalidate through `invalidateAfter(domain)`, never awaited; every client path
  passes the contract test.
- Stock Nuxt UI only: semantic colours, no arbitrary values, `:ui` only where allowlisted (lint).
- typecheck, typecheck:tests, lint, unit tests and generate clean; the feature's E2E green on
  both presets where the feature exists; CAPABILITIES.md and docs/e2e-coverage.md still true.

## Decisions

Dated, append-only. Superseded decisions stay with their status changed.

- **2026-10-01 — The 9-alias palette stays.** `app.config.ts` maps primary amber and neutral
  zinc (locked) plus secondary, success, info, warning, error, accent and special to distinct
  stock Tailwind palettes so badges are distinguishable. Any change goes through
  `app.config.ts` only. Light-mode contrast (primary buttons and some status text fail WCAG AA)
  is a separate owner decision, because the documented fix overrides CSS variables (decided
  2026-10-02, below). *Status: adopted.*
- **2026-10-01 — `:ui` allowlist.** Only `UModal`/`USlideover` `content` max-width utilities and
  the dashboard template's `UDashboardPanel` `body` and `UDashboardSidebar` `footer` slots;
  enforced by `console/ui-allowlist`. *Status: adopted.*
- **2026-10-01 — The cutover (P4) is gated by PRODUCTION.md** and the owner's sign-off recorded
  there, per deployment. *Status: adopted.*
- **2026-10-01 — CAPABILITIES.md replaces PARITY.md** as the only status list, framed on the
  backend's capabilities rather than the React screens. *Status: adopted.*
- **2026-10-02 — No hosted CI; `bun run release:check` is the release gate.** The repository has
  no GitHub workflow. The release check runs the static gates and the whole E2E suite on the
  static build against both presets on the releasing machine and records the outcome in
  `.release/gate.json`; the deploy requires a clean `HEAD` whose record passed, is for that commit
  and is at most 7 days old. Consequence: nothing runs on push or on a schedule, so the
  cross-browser lanes run only when a release check asks for them (`--browsers`). Supersedes the
  CI workflow and the deploy's green-CI requirement. *Status: adopted.*
- **2026-10-02 — The Nuxt console is the repository.** It moved from a subdirectory to the
  repository root and the React console it replaces was removed with its tests, docs and CI.
  Deployments that still run the React console cut over per PRODUCTION.md; it stays in the
  history for rollback. *Status: adopted.*
- **2026-10-02 — Light-mode colour contrast is accepted as a known limitation (F-032).** Primary
  buttons and some status text (the stock subtle amber badges) fall below WCAG AA on light
  backgrounds. Fixing them means overriding the theme's CSS variables, which non-negotiable 5
  forbids, so the stock theme stays. Consequence: the axe `color-contrast` rule stays off in the
  accessibility gate (`e2e/support/a11y.ts`), and PRODUCTION.md section 3 records the item as
  Accepted. *Status: adopted.*
- **2026-10-02 — A client-side refusal is a form rule.** A check the schema cannot express (a
  scope no longer offered) is an AppFormDialog `validate` rule, not an error set once on submit:
  UForm re-validates a field on blur, on change and 300 ms after typing and replaces its errors,
  which erased the refusal a moment after it appeared (F-082). Server errors are kept on their
  fields by `useApiAction` for the same reason. *Status: adopted.*
- **2026-10-02 — A flagged field in a dialog follows the typing; the footer does not move under a
  click.** Amends the build plan's guidance to accept UForm's default validate-on (input, blur,
  change) in dialogs. With the defaults, a corrected field's message cleared 300 ms after the last
  keystroke (and only in a field the admin had left once, not one flagged by a refused submit) or
  when focus left the field, and a press on Save is what moves focus. The centred dialog got
  shorter between press and release, the footer moved up (13 px for a one-line message, more when
  it wraps), and a click on the lower part of Save was released beside it: nothing was submitted.
  AppFormDialog now re-validates the flagged fields on every change to the state while any is
  shown, so the footer is already where it stays when the click comes. Considered and not taken:
  dropping blur and change from validate-on (fields would no longer be flagged when left, and the
  date field reports a partly typed day through change), immediate and eager input validation for
  every field (flags a field from its first keystroke), and a footer pinned independently of the
  body (a slideover or a fixed-height modal changes every dialog's layout). Leaving an invalid
  field still flags it and can still move the footer; the click that lands beside the button then
  is one the form would have refused. AppConfirmDialog already behaved this way (no blur
  validation; its typed text follows the typing). Covered by `e2e/app/dialog-kit.spec.ts` "a
  corrected field and the click straight after", which failed without the change.
  *Status: adopted; amended 2026-10-02 (next entry): the re-check alone does not keep the footer
  still for an input that writes its value only on blur, and a field left invalid by the press no
  longer moves the footer.*
- **2026-10-02 — A press on a dialog's footer holds the form until its click.** Amends the entry
  above. Its re-check follows the state, and a number field (`UInputNumber`, reka's number field)
  writes what was typed only on blur or Enter: while the admin typed a correction the state did
  not change and the message stayed up, and the press on Save, which blurs the field, committed
  the value and cleared the message between press and release. Found in review on the ABAC
  condition value: the footer moved 14 px and a click on the lower part of the button was lost 3
  out of 3 times; a tap was lost the same way. AppFormDialog now holds the form from a pointerdown
  on its footer (or on the conflict warning) until the click that press makes: validate-on is
  empty, the re-check waits and the conflict warning keeps its state. The click's submit
  validates everything; a press that submitted nothing re-checks the flagged fields when it ends
  (the next task after a mouse or pen release; a touch waits for its click, at most a second).
  The hold also covers a tags field that adds its typed tag on blur, and a field left invalid by
  the press: its message now comes with the refused submit instead of moving the footer before
  the click. The hold alone keeps the footer still (the dialog-kit cases pass with the re-check
  removed); the re-check stays as feedback while typing. Considered and not taken: a number-field
  wrapper that writes the value as it is typed (it would repeat reka's parsing, clamping and step
  snapping, and a value the blur clamps or snaps would still change under the press), and the
  alternatives listed in the entry above. Known residual: what a commit on blur changes besides
  validation, such as a committed tag that wraps a tags field onto a second line, can still
  resize the dialog under the press. The page forms outside dialogs (account, auth) are not
  covered. Covered by `e2e/app/dialog-kit.spec.ts`: "a number field flagged by a refused submit,
  then corrected, is saved by the very next click" and its tap variant (EnterpriseRBAC, the ABAC
  value), and "a field left invalid by the press on the submit button is refused by that same
  click" (both presets), each of which failed without the change. *Status: adopted.*
- **2026-10-03 — "This browser" is the server's mark, never a guess.** The console targets
  outlabs-auth 0.1.0a35 only, which names the session in access tokens (`sid`) and marks it in
  session lists (`is_current`). The former client-side match (the row created when this browser's
  refresh token was issued) is removed rather than kept as a fallback for older backends: it could
  only guess, and an older backend is not supported. Consequence: a session whose access token
  predates 0.1.0a35 is marked nowhere until its next renewal; Sign out other devices renews once
  itself when the server refuses `keep_current` for that reason. *Status: adopted.*

- **2026-10-03 — Passwords follow the policy the backend publishes.** The console targets
  outlabs-auth 0.1.0a35, which publishes its password policy (`password_policy`), registration mode
  and `has_password`. The static mirror of the default policy (`newPasswordSchema`,
  `PASSWORD_POLICY_HINT`) is removed rather than kept beside the published one: it lacked the
  backslash among the symbols, so the console refused a password the server takes. Every
  new-password schema is built from the published policy (`usePasswordPolicy`); outlabs-auth's
  default is used only while the capabilities are unknown. An account without a password sets
  one through the emailed reset link (0.1.0a35 has no endpoint for a first password of the
  signed-in account), and an admin's Set password is not offered on an invited account, whose
  status an admin-set password would not change. *Status: adopted.*

## Status

What is built is tracked only in [CAPABILITIES.md](./CAPABILITIES.md); readiness for production
in [PRODUCTION.md](./PRODUCTION.md); where the work stands and how to resume it in README
"Status and resuming work". The console's development history was squashed into the cutover
commit (`f8141f9`), so `git log` does not explain earlier choices: the dated Decisions above and
PRODUCTION.md section 11 do. Verify with `bun run typecheck && bun run typecheck:tests && bun run lint
&& bun run test:unit`, then E2E against a seeded example backend. The harness detects the preset
from `/auth/config` and signs the seed personas in through the API, so the backend URL is the
only required setting:
```
E2E_API_BASE_URL=http://localhost:8004 bunx playwright test
```
Test data is removed afterwards only when `E2E_ALLOW_DESTRUCTIVE_CLEANUP=1` is set and the
backend is a disposable development instance (globalTeardown; scoped to the run's own records).
`e2e/README.md` is the canonical guide: personas, capability gating, the static-build target,
the session-lifecycle lane and cleanup rules.

A long-lived dev tab that survived many hot reloads can throw errors from stale cached modules
that are not in the code (seen: `defaultPlaceholder.copy is not a function`, `ENTITIES_ROOT is not
defined`); open a fresh tab before chasing them. Typecheck, lint and a fresh-server E2E run (its
error guard fails on any console error) are the source of truth.

Labels in code comments come from the original build plan and the 2026-09 audit, neither of
which is published: `P0`–`P5` are build phases (P2 the resource verticals, P4 the per-deployment
cutover), `A1` the runtime-targeted backend and capability discovery, `F0`–`F4` the sign-in
surfaces (F0 the `authUi` config, F1 unified sign-in, F2 phone sign-in, F3 signup and phone
verification, F4 recovery), `WP-NN` the audit's work packages, and `F-NNN` and `v-…` its
findings. Each comment states its point in place; the label is only a cross-reference.

## References
- [Pinia Colada — Queries](https://pinia-colada.esm.dev/guide/queries.html) · [Reusable Queries (`defineQuery`)](https://pinia-colada.esm.dev/advanced/reusable-queries.html) · [Mutations](https://pinia-colada.esm.dev/guide/mutations.html)
- [Pinia — Core Concepts](https://pinia.vuejs.org/core-concepts/) · [Composables](https://pinia.vuejs.org/cookbook/composables.html)
