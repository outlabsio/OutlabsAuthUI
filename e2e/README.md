# E2E harness

Playwright is the console's acceptance gate. This file is the canonical guide to running it
and to writing specs against the harness. Unit tests (Vitest) are covered at the end. What the
suite proves, its known gaps and the checklist of the retired React suite are in
[`docs/e2e-coverage.md`](../docs/e2e-coverage.md); which spec proves each capability is in
[`CAPABILITIES.md`](../CAPABILITIES.md).

## Quick start

From the repository root, with a seeded outlabsAuth example backend running (see
[Backends](#backends)):

```bash
# EnterpriseRBAC example on :8004 — preset and personas are detected automatically
E2E_API_BASE_URL=http://localhost:8004 bunx playwright test

# SimpleRBAC example on :8003 — same command, different backend
E2E_API_BASE_URL=http://localhost:8003 bunx playwright test

# No backend: only the backend-free smoke runs, everything else skips
bunx playwright test
```

`E2E_API_BASE_URL` is the switch for which backend a run targets. The harness reads the
backend's `GET /auth/config`, records its preset (`EnterpriseRBAC` / `SimpleRBAC`), features,
auth methods and mounted surfaces, and defaults every persona's credentials to that preset's
seed. No other variable is needed for either seeded example.

Useful variants:

```bash
bunx playwright test e2e/users                 # one area
bunx playwright test --project=session         # session-lifecycle lane only
E2E_TARGET=static bunx playwright test         # against the shipped static build (as the release check does)
E2E_ALLOW_DESTRUCTIVE_CLEANUP=1 bunx playwright test   # remove this run's test data afterwards
```

Retries are 0 in the inner loop (a flake should be seen). Release mode (`E2E_RELEASE=1`, which
`bun run release:check` sets; see [Release check](#release-check)) allows one retry with
`failOnFlakyTests`, so a test that only passes on retry still fails the run, and fails on a
committed `.only`.

## What happens in a run

1. **webServer** boots the console on `E2E_PORT` (default 3000): the Nuxt dev server
   (`E2E_TARGET=dev`, default) or `bun run generate` served by `scripts/serve-static.mjs`
   with the generated `_headers` (`E2E_TARGET=static`).
2. **globalSetup** (`support/global-setup.ts`)
   - preflight: waits up to `E2E_BACKEND_TIMEOUT_MS` (30 s) for `/auth/config`, failing with
     a clear message instead of letting every test time out;
   - optional reseed: runs `E2E_RESEED_CMD` (any shell command) and waits for the backend again;
   - personas: signs each available persona in **once through the API** (`POST /auth/login`)
     and writes its Playwright storage state (`e2e/.auth/<persona>.json`, tokens in
     localStorage exactly as the console stores them). A persona whose seed password no longer
     works fails the run immediately (reseed the backend);
   - provisions the run-marked personas (`globalAdmin`) through the admin API and probes the
     development capture routes per kind;
   - writes `e2e/.auth/run.json`, the run manifest workers read (preset, capabilities,
     personas);
   - dev target only: boots the sign-in page and the dashboard once so the first wave of tests
     does not hit a cold Vite compile (`E2E_WARMUP=0` to skip).
3. **Projects**
   - `chromium-guest` — `e2e/auth/**`, no session. The dedicated UI sign-in coverage lives here.
   - `chromium` — everything else, as the `admin` persona.
   - `session` — `e2e/session/**`, the session-lifecycle lane (below).
4. **globalTeardown** removes this run's test data when allowed (see [Cleanup](#test-data-and-cleanup)).

Outside release mode, a still-valid persona session from the previous run against the same backend is
reused instead of logging in again (`E2E_REUSE_SESSIONS=0` forces fresh logins). The example
backends allow 20 password logins per 5 minutes per IP; a run spends one per persona plus the
few UI sign-in specs, so consecutive runs no longer lock the suite out. Where the backend has no
dev invite or magic-link capture (SimpleRBAC), every disposable session is a password login too,
so an API login the limiter refuses waits the seconds the API names (extending that test's
timeout) and is tried once more (`support/login-limiter.ts`): a fast run slows down instead of
failing.

Expect that wait on SimpleRBAC. A full run right after a reseed spends more than 20 logins (the
personas, including the provisioned `globalAdmin`, plus every disposable session), so a few
session tests (for example "signs out from the collapsed sidebar" and the session-lifecycle
lane) each wait up to about five minutes for the window to reopen. Other workers keep running
meanwhile, so the whole SimpleRBAC static run still takes about eight minutes. EnterpriseRBAC
mints disposable sessions through the invite capture and stays under the limit. Helpers that need an
admin token (`apiLogin` in `support/passwordless-capture.ts`, `personaToken`) resolve a persona's
email to its minted session and spend no login.

## Variables

| Variable | Default | Purpose |
|---|---|---|
| `E2E_API_BASE_URL` | unset | Backend origin. Unset = backend-gated specs skip. |
| `E2E_AUTH_API_PREFIX` | `/v1` | Prefix the auth library is mounted under. |
| `E2E_PORT` | `3000` | Port the console is served on (must be in the backend's CORS allowlist). |
| `E2E_BASE_URL` | `http://localhost:$E2E_PORT` | Console URL, if not the local webServer. |
| `E2E_TARGET` | `dev` | `static` = generate + serve the shipped artifact with its `_headers`. |
| `E2E_REUSE_SERVER` | `1` on `dev`, else `0` | Reuse an already-running console server (never in release mode). |
| `E2E_<PERSONA>_EMAIL` / `_PASSWORD` | preset seed | Override a persona (`ADMIN`, `AGENT`, `ORG_ADMIN`, `WRITER`, `SUMMIT_ADMIN`, `AUDITOR`, `PERMISSIONS_ADMIN`, `GLOBAL_ADMIN`). |
| `E2E_PERSONAS` | all available | Comma list restricting which personas are minted. |
| `E2E_REUSE_SESSIONS` | on, off in release mode | `0` = always log personas in fresh. |
| `E2E_RESEED_CMD` | unset | Shell command that resets the disposable backend before the run. |
| `E2E_ALLOW_DESTRUCTIVE_CLEANUP` | unset | `1` = delete this run's test data afterwards (the release check sets it). |
| `E2E_RELEASE` | unset | `1` = release mode: one retry, flaky and `.only` fail the run, Playwright's default workers, fresh persona sign-ins, no server reuse. `CI=1` is an alias. |
| `E2E_REPORT_DIR` | unset | Folder for the HTML report (`report/`), JSON results (`results.json`) and failure artifacts (`test-results/`) instead of `playwright-report/` and `test-results/`. |
| `E2E_ERROR_GUARD` | `strict` | `off` / `report` / `strict` default for the response and console guard. |
| `E2E_BROWSERS` | unset | Comma list adding the `firefox`, `webkit` and `mobile-chrome` projects (see [Browsers](#browsers-and-the-accessibility-gate)). |
| `E2E_BACKEND_TIMEOUT_MS` | `30000` | Preflight wait for the backend. |
| `E2E_WARMUP` | on (dev) | `0` skips the dev-server warm-up. |
| `E2E_RUN_ID` | generated | Run marker for test data (set once per run; normally leave unset). |

The console under test never reads a local `public/app-config.json`: every browser context is
served the harness config (`support/app-config.ts`), pointing at `E2E_API_BASE_URL`.

## Personas

| Key | EnterpriseRBAC seed | SimpleRBAC seed | Meaning |
|---|---|---|---|
| `admin` | `admin@acme.com` | `admin@test.com` | Superuser. Default session of the `chromium` project. |
| `agent` | `agent@sf.acme.com` | `writer@test.com` | Low privilege. |
| `orgAdmin` | `org-admin@acme.com` | — | Delegated organization admin, not a superuser. |
| `writer` | — | `writer@test.com` | SimpleRBAC writer role. |
| `summitAdmin` | `summit-admin@summit.com` | — | Admin of the second organization (cross-organization checks). |
| `auditor` | `auditor@acme.com` | — | Read-only organization auditor. |
| `permissionsAdmin` | `permissions-admin@acme.com` | — | Global permission-catalog admin, not a superuser. |
| `globalAdmin` | provisioned | provisioned | A non-superuser holding the seed's system-wide `admin` role directly; on EnterpriseRBAC it belongs to the admin persona's organization. |

Passwords are the example seeds' (`Testpass1!` Enterprise, `Test123!!` Simple). Seeded personas
cost one password login each per run (a reused session costs none). `globalAdmin` is provisioned:
globalSetup creates a run-marked account through the admin API every run (invite acceptance where
invites are captured, so no login; one login on SimpleRBAC) and cleanup removes it. Add a
persona in `support/personas.ts` (key + seed per preset, or `PROVISIONED_PERSONAS`).

Persona coverage: `app/nav-parity.spec.ts` opens every nav item as every persona on the preset
that has it and pins each persona's nav; `app/persona-matrix.spec.ts` checks what the grants mean
inside the pages (no cross-organization data, the auditor's read-only sweep, the global admin,
seeded account states); `auth/seeded-accounts.spec.ts` covers the suspended and locked seeds at
sign-in. The seed's entity-scoped admins (`manager@sf`, `regional-admin`, `east-admin`) are not
personas yet.

## Writing specs

Always import from the harness:

```ts
import { expect, personaState, test } from '../support/fixtures'
```

| Fixture / helper | Use |
|---|---|
| `await requires({ surfaces: ['entities'], features: ['abac'], authMethods: ['magic_link'], capture: ['reset-password'], personas: ['orgAdmin'], preset: 'EnterpriseRBAC' })` | Skip with a reason unless the backend has it. Use it instead of hardcoding one preset's assumptions. Also `requireBackend(req)` outside fixtures. |
| `expectSeeded(me.root_entity_id, 'the org admin belongs to an organization')` | A record the reference seeds guarantee (the organizations, the inactive office, `west_coast_after_hours`, …). Missing on the reference seeds it fails the test, so a regression never reads as a green skip; with persona overrides (`E2E_<PERSONA>_EMAIL` / `_PASSWORD`) or an unknown preset it skips, naming the fact and the overrides. Never `test.skip` on seed data. |
| `test.use({ storageState: personaState('agent') })` | Run a file as another persona. Pair with `requires({ personas: ['agent'] })`. |
| `patchAuthConfig(page, config => ({ ...config, registration_mode: 'closed' }))`, `withPasswordPolicy(page, { min_length: 12 })`, `withExtraSurfaces(page, ['oauth'])`, `withoutSurfaces(page, [...])` (`support/capabilities.ts`) | Serve the backend's `/auth/config` with a change, for capabilities the example backends cannot be switched to (another password policy, registration mode, router). The base is the live answer; without a backend, a minimal SimpleRBAC config. Register it before `page.goto`. |
| `persona('orgAdmin').email` | The persona's account on this backend (never hardcode seed emails). |
| `api` / `apiAs('orgAdmin')` | Typed API client with the persona's minted token (no login): `get/post/patch/delete`, `listAll`, `me`, `createUser`, `createEntity`, `createRole`, `createPermission`, `grantableScopes`, `findUserByEmail`. Arrange through the API, assert through the UI. |
| `testData.name('role')`, `.email('user')`, `.displayName('entity')`, `.resource('perm')` | Run-marked identifiers for anything a test creates, so cleanup can find it. The `api.create*` helpers already use them. |
| `errorGuard.allow({ status: 404, url: /\/entities\// })` | Declare an expected failure for the response and console guard (it also covers the browser's "Failed to load resource" console line for that response). |
| `expectAccessible(page, { scope, include, ready })` (`support/a11y.ts`) | The accessibility gate on a page or one dialog in every variant (light/dark, 1440/390). |
| `field(scope, 'Status')`, `chooseSelect(page, trigger, 'Suspended')` (`support/ui-select.ts`) | A field by its label; pick a USelect/USelectMenu option. Select menus are buttons named by their label (`getByRole('button', { name })`) when another control shares the label. |
| `sessionContext(tokens \| personaState(key))` | An extra browser context that is prepared and guarded like `page`, closed after the test. |
| `mintFreshSession(api)` (`support/sessions.ts`) | A fresh run-marked user signed in once, for tests that expire, rotate or revoke their session. Never do that to a shared persona session. `mintAnotherSession(user, password, { userAgent })` adds a second device; the user agent is recorded, so its row in a sessions table can be named ("Firefox 130 on Windows"). |
| `corsHeaders()` / `jsonResponse()` (`support/mocks.ts`) | Headers for route-mocked backend responses, derived from the console origin. |
| `captureAccessCode(email)` and friends (`support/passwordless-capture.ts`) | Read codes and tokens from the example backends' development capture routes. Gate with `requires({ capture: [...] })`. |
| `signOutFromShell(page)`, `openUserMenu(page)`, `openUserMenuPage(page, 'Account')`, `userMenuLinks(page)`, `sidebarNav(page)`, `pressPaletteShortcut(page)`, `commandPalette(page)`, `routerPush(page, location)` (`support/shell.ts`) | Drive the app shell: sign-out, Account and My API keys live in the sidebar footer's user menu, not in the sidebar list. Never sign a shared persona out; use `mintFreshSession` + `sessionContext`. `routerPush` is a client-side navigation through the app's router, only for shell behaviour no shipped page triggers yet (query-driven tabs, anchors); prefer clicking real links. |
| `userDetailPath(id, 'access')`, `userTabs(page)`, `userActionsButton(page)`, `openUserAction(page, 'Change status')` (`support/users.ts`) | Drive the user detail: its cards sit in tabs (`?tab=access \| security \| history`, Overview by default), so open the tab a test exercises; lifecycle actions are in the navbar's "More user actions" menu, Edit is its own button. The Access tab's grant cards list live grants (active, suspended) and need the "Include ended" checkbox for revoked or expired rows, which offer only Reactivate (`reactivate-effects`); effective permissions are `effective-permission` rows, Check access results `check-access-results`. |
| `treeRow(page, name)`, `openEntity(page, id, name)`, `entityAction(page, 'Governance' \| 'Move' \| 'Archive')`, `entityOption(page, name)`, `pickEntity(page, trigger, name)`, `cardByHeading(page, name)` (`support/entities.ts`) | Drive the entities workspace: tree rows are UTree items (no links), the detail's secondary actions sit in the "More entity actions" menu, AppEntityPicker options are matched on their name. Seed entities with `api.createEntity({ kind, parent_entity_id, ... })` rather than the seeded organisations other specs share. |
| `historyEvents(page)`, `historyEvent(page, 'Updated')`, `serveEmptyHistory(page, '/roles/<id>/history')` (`support/definition-history.ts`) | The History card of a role or permission page: its timeline items newest first, or those with a title. Each item holds the title, the actor line ("By You") and the changes (`definition-history-changes`, `-added`, `-removed`, `-permissions`). Every definition a run creates has its creation recorded, so the empty state is shown by serving an empty page for one of them (`serveEmptyHistory` returns the URLs it answered), never by looking for a definition without history. |
| `grantableScope(api)`, `pickScope(dialog, name)`, `storeSecret(page)`, `pastExpiry(key)`, `rewriteKeys(page, url, edit)` (`support/api-keys.ts`) | API keys: a scope the persona may grant on either preset (user:read where offered), picking it in AppScopePicker (its search box is the textbox named Scopes), confirming the one-time secret, and serving a key in a state the backend cannot be put in quickly (an expiry date in the past, an owner who cannot sign in) by rewriting the real list or detail response. Key status cells are `getByTestId('api-key-status')` (filter `visible: true`: phones repeat it under the name); a disabled Rotate item's name contains its reason, so match Reactivate with `exact: true`. |

Audit and dashboard specs (`e2e/audit/`, `e2e/app/dashboard.spec.ts`): the Audit filter
pickers are `USelectMenu` triggers, so they are buttons named by their aria-label (`Event type`,
`About account`, `Actor`, `Entity`) inside the `Audit filters` group, while Category is a
combobox; active filters are buttons named `Remove filter <label>: <value>`. Table body rows are
`tbody > tr` (the header group also holds the loading-bar row). Events with a known shape are
served by fulfilling `/audit-events?…` (the payload and export tests do), because parallel specs
keep adding sign-ins. Dashboard tiles put their test id on the card's overlay link
(`dashboard-tile-<key>`) and their count on `tile-value-<key>`; compare a tile with the total of
the request it made (`waitForResponse`), never with a later API read, for the same reason.

Selectors are role- and label-first (`getByRole`, `getByLabel`); lint rejects `locator('#…')`
in `e2e/` (F-232), so a field that loses its label fails a spec. `data-testid` only where no
accessible name can tell elements apart. Tests must not mutate seeded personas (passwords,
roles, memberships): create a run-marked user with `api.createUser()`.

## Error guard

Every test records backend responses >= 400, console errors, uncaught page errors, CSP
violations and requests to origins other than the console and the API. The default mode is
`strict`: anything not declared with `errorGuard.allow(...)` fails the test, so a page that
renders its chrome around a failed request cannot pass (F-036). A spec that provokes failures on
purpose (a mocked outage, a refused sign-in) declares exactly those. `report` (or
`E2E_ERROR_GUARD=report`) only attaches the findings (`error-guard.json`) and annotates the test,
for triage. On the static target, CSP violations and third-party requests fail in every mode.

## Test data and cleanup

Destructive cleanup runs in globalTeardown after every run (guest-only runs included) and only
when all of these hold:

1. `E2E_ALLOW_DESTRUCTIVE_CLEANUP=1` (the release check sets it; set it yourself only against a
   disposable backend);
2. the backend exposes its development capture routes (the examples mount them only outside
   production), which marks it disposable;
3. the record is this run's: named with the run marker (`pw-e2e-<runId>-…`,
   `…@example.com`). Runs sharing a backend never remove each other's data.

It revokes the personas' matching personal API keys, then removes permissions, roles, platform
service accounts, users (soft delete; the backend has no hard delete) and entities (their
service accounts first, deepest entity first). Any unexpected non-2xx response fails the run.
To wipe everything, reseed the backend (`E2E_RESEED_CMD` or the example's `reset_test_env.py`).

Every spec names what it creates through `testData` / `api.create*`; anything else would never
be cleaned up.

## Browsers and the accessibility gate

Chromium runs the whole suite. `E2E_BROWSERS=firefox,webkit,mobile-chrome` adds a project per
browser (`bun run release:check --browsers firefox,webkit,mobile-chrome` runs them on both
presets):

- `firefox`, `webkit`: the cross-browser smoke: shell, personas, nav parity, persona scenarios,
  browser lifecycle and the accessibility sweep.
- `mobile-chrome`: a Pixel 7 profile (touch, phone viewport) running the phone-specific tests,
  selected by title (`on a phone`, `phone width`, `at 390`, `390px`, `drawer`, `slideover`).

Run one with `E2E_BROWSERS=webkit bunx playwright test --project=webkit` (install it once with
`bunx playwright install webkit`).

The accessibility gate (`support/a11y.ts`, `a11y/a11y-smoke.spec.ts`, `a11y/a11y-dialogs.spec.ts`,
`auth/auth-a11y.spec.ts`) runs axe (WCAG 2 A/AA) over every console route, the record pages
behind them, every dialog the console opens (modal dialogs, slideovers and popovers) and every
guest page, in light and dark at 1440 and 390px, without reloading between variants. Something
that exists at one width only (a phone-only Filters popover, a popover in a desktop-only column)
is swept at that width (`PHONE_VARIANTS`, `DESKTOP_VARIANTS`), and a scanned dialog that leaves
the screen while the variants change fails the sweep instead of passing unscanned.
It also fails on a select menu named "Show popup", on sideways page scroll at 390px, and on a
dialog that does not return focus to the control that opened it. `color-contrast` stays out by
owner decision: light-mode contrast is an accepted limitation (F-032, PRODUCTION.md section 3).
Two stock-component exceptions are waived node by node: the unnamed listbox of UCommandPalette
pickers and UDashboardPanel's scrolling body without a tab stop (`scrollable-region-focusable`);
keep pages linking what they show.

There are no screenshot baselines (`toHaveScreenshot`): they would need one fixed rendering
environment (operating system, fonts, browser build) for every machine that runs the release
check (F-148).

## Static target

`E2E_TARGET=static` makes the webServer run
`bun run generate` (nuxt generate + `scripts/csp-hashes.mjs`), then
`node scripts/deploy-preflight.mjs --local --config e2e/.static/app-config.json` (written from
`E2E_API_BASE_URL`, `E2E_AUTH_API_PREFIX` and the optional `E2E_FRONTEND_PROFILE_KEY`; it pins
the CSP's `connect-src` to the E2E API and stages the file as `app-config.json`), then
`node scripts/serve-static.mjs --dir .output/public --port $E2E_PORT`.
The server applies the generated `_headers` (Content-Security-Policy and friends) with the
Workers asset semantics, falls back to `index.html` for navigations, and answers real 404s for
every other miss. This is the artifact that ships, so shipped-only defects (a CSP that blocks
the boot scripts, icons missing from the client bundle) fail here. The `chromium-static`
project (`e2e/static/`) is the hosting smoke; it skips on the dev target. `bun run
preview:static` stages `public/app-config.json` and serves the last build on port 3000.

## Session-lifecycle lane

The seeded examples issue 8-hour access tokens, so ordinary runs never see one expire. The
`session` project simulates expiry client-side instead of needing a short-TTL backend:
`expireAccessToken(page)` rewrites the stored JWT's `exp` into the past, the backend rejects it
with a real 401, and the console must run its real refresh, rotation and logout. Each test owns
a fresh session (`mintFreshSession`), minted by accepting an invite where the backend exposes
the dev invite capture (no password login) and by one API login otherwise. A backend configured with a 1-minute access TTL exercises
the same paths without the simulation.

| Scenario | Server-side outcome (asserted through the API) | Console-side outcome |
|---|---|---|
| Idle, then a mutation | the mutation lands after one refresh | active |
| Idle, then a reload | one refresh for the whole boot | active |
| Idle, then sign out | no session left | active (F-005 fixed) |
| Two tabs refresh at once | the user keeps a session | active (F-006 fixed) |
| Idle, then change the password (signing in again refused) | the held pair can no longer refresh; its access token is rejected | tab signed out with `reason=password_changed` (F-029 fixed) |
| Change the password | only the new sign-in is left | tab signed in again with the new password; on EnterpriseRBAC a query refused with the old token while the sign-in is in flight waits and replays, no refresh is sent (F-029 fixed) |
| Idle, then sign out everywhere | the held pair can no longer refresh; no session left | active |
| Sign out everywhere | no session left | confirmation first, this browser marked (the server's `is_current`), tab on sign-in with `reason=signed_out_everywhere`, then an immediate logout blacklisting the tab's access token (F-030 fixed) |

A scenario that reproduces a known defect is written as a `fixme` naming its finding, verified to
fail against the current console; remove the `fixme` in the change that fixes the finding. `refreshTokenStatus(token)` and `accessTokenStatus(token)` in
`support/sessions.ts` probe a captured token from the test runner. Never probe a refresh token
the console has already rotated: the backend treats that as reuse and ends every session.

## Backends

The seeded example apps live in the public outlabsAuth repository (`examples/enterprise_rbac`,
`examples/simple_rbac`, at `v0.1.0a35` / `outlabs-auth==0.1.0a35`). The console requires that
release, and the suite asserts its behaviour and its example seeds' personas and fixtures. Its
[examples quick start](https://github.com/outlabsio/outlabsAuth/tree/v0.1.0a35/examples#quick-start)
covers the prerequisites (PostgreSQL, optionally Redis). Per example: set `DATABASE_URL` (one
database per example) and a random `SECRET_KEY`, run `reset_test_env.py` (migrates and seeds),
then `uvicorn main:app --port <port>`. Both examples allow the console origins
`http://localhost:3000` and `:3001` (Enterprise also allows `FRONTEND_URL`), so serve the console
on one of those ports.

## Release check

There is no hosted CI. `bun run release:check --enterprise <url> --simple <url>` (README
"Releasing", `scripts/release-check.mjs`) is the release gate, run on the releasing machine
against the two seeded examples above. After the static gates (frozen install, typecheck,
`typecheck:tests`, lint, unit tests, `check:api-types`, audit, generate) it checks that each
backend answers `/auth/config` with its own preset, then runs `bunx playwright test` once per
preset with:

- `E2E_RELEASE=1` (release mode), `E2E_TARGET=static`, `E2E_ALLOW_DESTRUCTIVE_CLEANUP=1`;
- `E2E_API_BASE_URL` and `E2E_AUTH_API_PREFIX` for that backend, `E2E_PORT` from `--port`;
- `E2E_RESEED_CMD` from `RELEASE_<PRESET>_RESEED_CMD` or `RELEASE_RESEED_CMD`, when set;
- `E2E_BROWSERS` from `--browsers`;
- `E2E_REPORT_DIR=.release/e2e-<preset>`, whose `results.json` gives the counts in the record.

Every other inherited `E2E_*` variable is dropped (except `E2E_BACKEND_TIMEOUT_MS`), so persona
overrides, a relaxed error guard or a reused server cannot weaken a release run. Both presets
gate. The outcome, passed or not, is recorded in `.release/gate.json`, which the deploy
preflight's `--require-release-gate` reads.

## Unit tests

Pure logic (runtime-config resolution, error normalization, utils, the harness's own matchers)
is covered by Vitest in `test/unit/**/*.test.ts`. `test/unit/lint-guardrails.test.ts` also lints
the negative fixtures in `eslint-fixtures/`, so the architecture and styling lint rules cannot
silently stop firing (`bun run lint:guardrails` runs it alone).

```bash
bun run test:unit                          # all
bunx vitest run test/unit/<file>.test.ts   # one file
bun run typecheck:tests                    # type-check E2E + unit test code
```

Anything that needs the browser or the Nuxt runtime belongs in Playwright.
