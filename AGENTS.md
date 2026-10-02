# AGENTS.md — OutlabsAuthUI

Rules for AI agents and contributors working in this repository, the Nuxt 4 + Nuxt UI v4 admin
console for the outlabsAuth library. They load on every task, so they stay short; the details
live in the documents listed under "Read next".

## What this is

A generic, runtime-configured admin console. One static build points at any outlabsAuth
backend through `app-config.json` and adapts to what that backend mounts (`/auth/config`:
preset, surfaces, features, sign-in methods). It names no consumer and holds no consumer
configuration. Nuxt runs with `ssr: false`; there is no server code. Active development is
paused since 2026-10-02; README "Status and resuming work" says where the work stands and what
is open.

## Read next

| Document | Read it when |
|---|---|
| [README.md](README.md) | setting up, configuring a deployment, building, deploying; where the work stands ("Status and resuming work") |
| [ARCHITECTURE.md](ARCHITECTURE.md) | writing any code: layers, session lifecycle, shared kits (including roles, permissions and validity windows), per-area notes |
| [CAPABILITIES.md](CAPABILITIES.md) | deciding what to build next or claiming something works |
| [PRODUCTION.md](PRODUCTION.md) | anything about release, cutover or production readiness |
| [docs/security-posture.md](docs/security-posture.md) | tokens, headers, CSP, hosting, OAuth |
| [e2e/README.md](e2e/README.md) and [docs/e2e-coverage.md](docs/e2e-coverage.md) | writing or running tests |

## Commands (Bun, never npm)

```bash
bun install
bun run dev                 # http://localhost:3000
bun run typecheck && bun run typecheck:tests && bun run lint && bun run test:unit && bun run generate
E2E_API_BASE_URL=http://localhost:8004 bunx playwright test   # see e2e/README.md
bun run release:check --enterprise <url> --simple <url>       # the release gate; README "Releasing"
```

There is no hosted CI: `bun run release:check` on the releasing machine is the release gate, and
the deploy accepts only a commit whose record (`.release/gate.json`) passed.

The static gates share `.nuxt/` with a running dev server: do not run them while Playwright's
dev server for the same checkout is up.

## Non-negotiables

1. **Playwright E2E is the acceptance gate.** Every behaviour change ships with a spec or a spec
   update, capability- and preset-aware (EnterpriseRBAC and SimpleRBAC). Pure logic gets a
   Vitest unit test in `test/unit/**/*.test.ts`.
2. **Pinia Colada owns all server state** (`app/queries/<resource>.ts`); Pinia holds client state
   only (`app/stores/ui.ts`). Never cache API data in a store.
3. **Vanilla Nuxt UI, no custom styling.** Semantic colours only, stock utilities only; the
   theme is `app/app.config.ts`; `app/assets/css/main.css` is its two `@import`s.
4. **Nuxt UI's form system is the only form system:** `UForm` + Zod (`app/schemas/`) +
   `UFormField`, through `AppFormDialog` / `AppConfirmDialog`. No other form or validation
   library. Server 422 issues land on their fields.
5. **No CSS variable overrides** and no theme changes outside `app/app.config.ts`.

## Layers (lint-enforced)

| Layer | Owns | May not |
|---|---|---|
| `app/queries/<resource>.ts` | `defineQueryOptions` reads, `useMutation` writes that call `invalidateAfter(domain)`, key factories | toasts, routing, UI |
| `app/composables/use<Feature>.ts` | all feature logic: which queries run, form state, handlers, `useApiAction` feedback | import `apiClient`, make raw requests (`fetch`, `window.fetch`, `$fetch`, `useNuxtApp().$fetch`, `useFetch`, `useAsyncData`) |
| `app/pages`, `app/components`, `app/layouts` | template + one feature composable call + pure display config | `useQuery`/`useMutation`/`useQueryCache`/`defineQuery*` (as globals or imported from `@pinia/colada` or `#imports`), value imports from `app/queries/*` (types are fine), the API client, raw requests |
| `app/stores/` | cross-route client state (request cooldowns) | run queries or mutations (read the cache with `useQueryCache()`) |
| `app/utils/` | pure, stateless helpers | state or IO (one recorded exception: `utils/runtime-config.ts`, the boot config resolver) |
| `app/api/`, `app/auth/` | the one HTTP client, the error model, token storage, the refresh lock | feature logic |

`eslint.config.mjs` enforces the request, query and import walls; `eslint-fixtures/` pins each
rule (`bun run lint:guardrails`). Fix the code, never the rule, unless the rule is wrong; then
change rule and fixture together and say why in the commit.

## Styling (lint-enforced)

- Semantic colour utilities (`text-muted`, `bg-elevated`, `border-default`, `text-error`, …)
  and component `color` props. No raw palette classes (`text-red-500`, `bg-white`) and no
  shades of the semantic aliases (`text-primary-500`).
- No arbitrary values (`max-w-[260px]`, `grid-cols-[320px_1fr]`, `bg-(--x)`), no `style` or
  `:style`, no `<style>` blocks.
- `:ui` is allowed only as an object literal on: `UModal` / `USlideover` `content` (max-width
  utilities only), `UDashboardPanel` `body` and `UDashboardSidebar` `footer` (as the official
  dashboard template uses them). Each slot value is a string literal or a choice between
  literals (`size === 'xl' ? 'sm:max-w-3xl' : undefined`), never a variable, and never `ui`
  inside an object `v-bind`. Widen a dialog with `AppFormDialog size="lg" | "xl"`.
- Status colours are for status; type badges are neutral.
- Recorded exceptions: `app/spa-loading-template.html` (the pre-boot loading screen, shown
  before any stylesheet loads, so it carries its own small inline CSS) and the 9-alias palette
  in `app.config.ts` (owner decision, ARCHITECTURE.md "Decisions").

## Reuse before writing

Forms and dialogs: `AppFormDialog`, `AppConfirmDialog`, `useDialogForm`, `useDialogGuard`,
`useDirtyPatch` (send only changed fields), `useApiAction`, `AppPasswordInput`, `codeSchemaFor`. Lists: `useListQueryState`,
`AppQueryState`, `AppListPagination`, `utils/table.ts`. Display: `AppTimestamp` and
`utils/format-date.ts`, `AppDetailList`, `utils/status.ts`. Pickers: `AppEntityPicker`,
`AppUserPicker`, `AppRolePicker`, `AppPermissionPicker`, `AppScopePicker`, `AppDateField`.
Access: `useAssignableRoles`, `AppRoleAccessEditor`, `AppEffectivePermissions`, `AppRoleChip`.
Secrets and sessions: `AppSecretReveal` + `useSecretMutation`, `AppSessionsTable`. Pages:
`usePageMeta`, `AppPermissionGate`, `useAuth().canAccess` / `can` / `hasSurface` over
`utils/capabilities.ts` (`APP_SECTIONS`, `meetsAccessRequirement`). ARCHITECTURE.md describes
each.

## Capabilities and authorization

- Nav visibility equals page visibility: surface AND feature AND permission, evaluated with the
  backend's permission algebra (`utils/permissions.ts`). Capability-absent features are hidden.
- Route guards and hidden buttons are UX, never security: the backend is the authorization
  boundary. Never offer an action the backend will refuse; never claim the UI protects data.
- Delegated (non-superuser) admins and SimpleRBAC are release-gating: test them, not just the
  superuser.

## Testing

- Use the persona helpers and fixtures in `e2e/support/` (`personaState`, `persona`,
  `personaToken`, `api`/`apiAs`, `mintFreshSession`, `createSignedInUser`); password logins
  are rate-limited by the backend.
- Locate by role and label, never by `#id` (lint-enforced). Name created records with the run
  marker so cleanup finds them. The error guard is strict: a spec that expects a failing
  request declares it.
- Skip only on capability or preset (`requires`), never to hide a failure. A record the
  reference seed guarantees is asserted with `expectSeeded`, which skips only under persona
  overrides.

## Definition of done

Code in the right layer; shared kit reused; Zod schema for every form; E2E (and unit tests for
pure logic) added or updated and green on EnterpriseRBAC, and on SimpleRBAC where the area
exists; typecheck, typecheck:tests, lint, unit tests and generate green; CAPABILITIES.md,
docs/e2e-coverage.md and ARCHITECTURE.md updated in the same change when they stop being true.
Never mark something built or fixed without a passing spec that shows it.

## Public repository

This code is published. In code, comments, docs, test data and commit messages: no names of
private consumers or internal systems, no internal hostnames, no absolute machine paths, no
real e-mail addresses, tokens or secrets. Use the example backends' seed personas and generic
wording ("a consumer", "a deployment").

## Commits

Small Conventional commits (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`), scoped to
the area when that helps (`fix(audit):`). Stage explicit paths; never commit generated output
(`.output/`, `.nuxt/`, `.release/`, reports), local config (`public/app-config.json`, `.env*`)
or screenshots.
