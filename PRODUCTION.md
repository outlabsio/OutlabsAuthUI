# Production gate

The objective go/no-go for putting this console in front of real administrators: the cutover
of each deployment from the earlier React console. A release of the console passes
the gate when every item in sections 1–7 is **Met** or **Accepted** (a recorded owner decision
that names its consequence). A deployment cuts over when the release has passed and its own
checklist (section 9) is complete, and the owner has signed off (section 10).

Status words: **Met** (verified, with the evidence named), **Open** (not yet true; blocks the
gate unless the owner accepts it), **Accepted** (an owner decision keeps it as is),
**Backend** (needs an outlabsAuth change; the console side is done defensively).

## 1. Release check

There is no hosted CI. A release is verified on the releasing machine by `bun run release:check`
(`scripts/release-check.mjs`; README "Releasing"), which runs every gate below against the two
seeded outlabsAuth example backends and records the outcome in `.release/gate.json` (not
committed). The deploy reads that record.

| Requirement | Status | Evidence |
|---|---|---|
| A clean tree, a frozen install, typecheck (app and tests), lint with the architecture and styling guardrails, unit tests, API types in sync with the snapshot, the dependency audit and the static generate pass at the release commit | Met | `bun run release:check` steps `clean-tree` to `generate`; guardrail fixtures in `eslint-fixtures/`; section 11 |
| E2E against the generated static build, served with its own headers, on both presets (EnterpriseRBAC and SimpleRBAC), strict: one retry, a test that passes only on retry fails, `.only` fails | Met | `release:check` steps `backends`, `e2e:enterprise`, `e2e:simple` (`E2E_RELEASE=1`, `playwright.config.ts`); section 11 |
| Firefox, WebKit and phone-sized Chromium pass before a release | Open | `bun run release:check --browsers firefox,webkit,mobile-chrome` runs them on both presets (`E2E_BROWSERS`, e2e/README.md "Browsers and the accessibility gate"); the default check runs Chromium only, and the release commit in section 11 was checked without them |
| No flaky E2E test hides a product defect | Open | Fixed, each with a spec that fails without the fix: API password logins of the harness on SimpleRBAC that the backend's login limiter refused again after one wait of the 300 seconds every refusal names, because the next window had filled already (test; such a login is now tried every 15 seconds until admitted, `test/unit/login-limiter.test.ts`), and a sessions-table spec whose bare login did not wait at all (test; `e2e/account/sessions-table.spec.ts` "user detail identifies each session…"); the entities spec checking an Advanced options checkbox while the section was still opening, so the field moved between being located and being pressed (test; `e2e/entities/entities-workspace.spec.ts` waits for the opening to finish); a scope refusal in the key dialogs that the field's own re-validation erased a moment after it appeared, so Save seemed to do nothing (product, F-082; `e2e/service-accounts/service-accounts.spec.ts` and `e2e/api-keys/api-keys-workspace.spec.ts` "…refused on the field…"); "New entity" used before the tree and the selection's path loaded opening Create entity on "New organization" (product; `e2e/entities/entities-workspace.spec.ts` "New entity opened before the tree…"); the F-090 audit spec working the pager while the previous result was still on screen (test; it now waits for the category's own answer and rows); a role, permission or scope picker still loading its options showing the palette's empty message inside its listbox, invalid ARIA the dialog sweep caught only when it scanned before the pool arrived (product; `e2e/a11y/a11y-smoke.spec.ts` "a role picker still loading its roles"); the dialog-kit date spec reopening Edit validity before the row's refetch after a save had landed (test); the permissions list spec comparing the summary with a total that other tests change (test, data isolation); users list rows keyed by position, so closing a row dialog after the list changed lost the keyboard focus (product; `e2e/users/users-list.spec.ts` "closing a row dialog after the list changed…"); the governance specs pressing Save before the number they typed was committed (test). Earlier: Enter in a Tags field submitting a form dialog (`e2e/app/dialog-kit.spec.ts` "Enter in a tags field"); a role chip reading "Unknown role" while its names load (`e2e/roles/role-access-kit.spec.ts` "a membership chip says it is loading…"). Open: the entity-activity raw payload failed once on its first attempt and has not been reproduced since (section 11) |
| Releases deploy only a clean `HEAD` that passed the release check, with a token for the deployment's Cloudflare account | Met | `scripts/deploy-with-env.sh` passes `--require-release-gate` to `scripts/deploy-preflight.mjs`, which refuses a dirty tree and any record that is for another commit, ran on uncommitted changes (`--allow-dirty`), failed, lacks either preset or is older than 7 days (`--release-gate-max-age-days`); a `HEAD` on no remote branch only warns. `DEPLOY_SKIP_RELEASE_GATE=1` drops only the release-gate requirement, with a warning. Before building, the script requires `CLOUDFLARE_ACCOUNT_ID` with `--env` and stops when `wrangler whoami --json` fails or does not list that account (`test/unit/release-gate.test.ts`, `test/unit/deploy-account.test.ts`) |

## 2. Security

| Requirement | Status | Evidence |
|---|---|---|
| Written security and session posture | Met | [docs/security-posture.md](docs/security-posture.md) |
| Security headers on every response, CSP without `'unsafe-inline'`/`'unsafe-eval'` scripts, `connect-src` pinned to the deployment's API | Met | `public/_headers`, `scripts/csp-hashes.mjs`, the deploy preflight; `e2e/static/static-build.spec.ts` fails on any CSP violation or third-party request |
| The edge does not inject scripts into the HTML that the hashed `script-src` blocks (Cloudflare Web Analytics' automatic beacon, e-mail obfuscation, JavaScript detections) | Met | `Cache-Control` carries `no-transform` on every response except the content-hashed `/_nuxt/*` chunks, which keep edge compression: `public, max-age=0, must-revalidate, no-transform` for HTML, the SPA fallback, redirects and public files; `public, max-age=31536000, immutable` for `/_nuxt/*`; `no-cache, no-transform` for `/_nuxt/builds/*` and `/app-config.json`; `no-store, no-transform` on the Worker's 404 (docs/security-posture.md, "Edge rewriting"). `test/unit/static-site.test.ts` and `e2e/static/static-build.spec.ts` assert exactly one value per class. Rocket Loader is not documented to honour `no-transform`, so a zone serving the console keeps it off; both are checked on the live host per deployment (section 9, item 6) |
| Production config fails closed (missing or invalid `app-config.json`, plain-`http` remote API) | Met | `e2e/app/config-fail-closed.spec.ts`, `e2e/static/static-build.spec.ts` |
| One-time secrets never cached; audit payloads and exports redacted | Met | `e2e/api-keys/secret-reveal.spec.ts`, `e2e/audit/audit-workspace.spec.ts`, `test/unit/audit.test.ts` |
| Delegated (non-superuser) admins cannot reach other organizations' data | Backend | The console scopes what it shows (`e2e/app/persona-matrix.spec.ts`), but the backend's entity, membership and account-creation routes are not scoped to the admin's organization (F-020, F-039, F-040, F-012). Until outlabsAuth fixes this, a deployment either gives console access only to global admins or accepts the risk in its sign-off. |
| OAuth works only same-site | Accepted with a check | Documented constraint (docs/security-posture.md); each OAuth deployment runs the live check in section 9 (F-150) |
| The OAuth callback cannot sign a browser into someone else's account (login CSRF) | Met | A one-time `sessionStorage` marker set right before the provider redirect (sign-in and signup only); without one from the last 20 minutes the callback revokes the pair and stores nothing (docs/security-posture.md). `e2e/app/session-lifecycle.spec.ts` "an OAuth callback this tab did not start…" fails without it |

## 3. Accessibility

| Requirement | Status | Evidence |
|---|---|---|
| No axe WCAG 2.1 A/AA violations on every route, record page, the main dialogs and the guest pages, in light and dark mode, at 1440px and 390px | Met, except colour contrast (accepted, next row) | `e2e/a11y/a11y-smoke.spec.ts` (including a dialog whose role picker is still loading, and Connected accounts explaining a failed link), `e2e/auth/auth-a11y.spec.ts` |
| Colour contrast (WCAG AA) in light mode | Accepted | Owner decision 2026-10-02 (F-032): a known limitation. Primary buttons and some status text (the stock subtle amber badges) fall below AA on light backgrounds; the only fix overrides the theme's CSS variables, which the stock-theme rule forbids (AGENTS.md non-negotiable 5), so the stock theme stays. Consequence: colour contrast is not checked by the gate; the axe `color-contrast` rule stays off in both modes (`e2e/support/a11y.ts`), and every other WCAG A/AA rule is checked. |
| Keyboard use: skip link, landmarks, titles, focus return from dialogs and menus, reduced motion | Met | `e2e/app/shell-navigation.spec.ts`, `e2e/app/dialog-kit.spec.ts` |
| Every dialog swept by axe | Met | All 84 dialogs the console opens. `e2e/a11y/a11y-smoke.spec.ts` "accessibility: dialogs" sweeps 8 (the main create dialogs and the user delete confirmation, and a role picker still loading); `e2e/a11y/a11y-dialogs.spec.ts` sweeps the other 76: 64 modal dialogs (record and row-menu dialogs, every confirmation, the one-time secret, the discard prompt, the command palette), 6 slideovers (API key detail, the entity record at phone width, the service account and Audit guides, Audit filters, the navigation drawer) and 6 popovers (date field calendar, role chip, key scopes, Audit date range, the users and roles lists' phone filters). Each is opened the way an admin opens it, scanned in light and dark at 1440 and 390px (at its own width only where its opener exists on phones or desktops alone), closed with Escape, and focus must return to its opener. SimpleRBAC skips the dialogs of surfaces it does not mount (entities, memberships, ABAC, Audit, entity types, key inventory). Served responses stand in for states the seeds cannot be put in quickly (a session list, a linked provider account, a phone number, an expired key). States of a swept dialog (a conflict warning, an error, the one-time secret's Back prompt) and its other openers are not swept separately. Found and fixed: the users and roles lists' phone Filters popover dropped the focus to the page on Escape. |

## 4. Resilience and recovery

| Requirement | Status | Evidence |
|---|---|---|
| An unreachable or slow API never strands the admin (Retry, Sign out; 15-second timeout) | Met | `e2e/app/session-lifecycle.spec.ts` |
| Session renewal is single-flight across tabs; only a refused refresh signs out, with the reason | Met | `e2e/session/session-lifecycle.spec.ts`, `e2e/app/session-refresh.spec.ts` |
| A new deployment never breaks an open tab (missing chunks get real 404s, Nuxt reloads) | Met | `wrangler.toml`, `cloudflare/not-found-worker.js`, `e2e/static/static-build.spec.ts` |
| Rollback | Per deployment | Redeploy the previous release commit with the same config (or roll back the Worker version). A deployment cutting over from the React console keeps that console deployable from the source it was built from until its sign-off says otherwise: this repository holds the React console only as of the initial public release (`a4d7e84`), so a deployment running a later React build keeps that build's own source and build steps for rollback |
| A refresh lost after the API rotated the token | Backend | Signs the browser out as token reuse; needs a grace window in outlabsAuth (ARCHITECTURE.md, "Session lifecycle") |

## 5. Observability

| Requirement | Status | Evidence |
|---|---|---|
| External error reporting or telemetry | Accepted (none) | Owner decision: the console sends nothing to third parties. Failures surface to the admin (toasts, inline alerts, the configuration and unreachable-API screens) and in the browser console; the backend's logs and audit log are the server-side record. Consequence: console-side errors are known only when an admin reports them. |
| The API contract version is checked at boot and shown in Settings | Met | `e2e/auth/api-contract.spec.ts`, `e2e/settings/settings-workspace.spec.ts` |

## 6. Performance

| Requirement | Status | Evidence |
|---|---|---|
| Lists page on the server and never load unbounded data | Met | CAPABILITIES.md list rows; `e2e/permissions/permissions-list-state.spec.ts`, `e2e/users/users-list.spec.ts` |
| A bundle-size budget enforced by the release check | Met | `bundle-budget.json` holds the baseline (2,343,028 bytes of JavaScript under `.output/public/_nuxt`, measured at `018b6d6`) and a 10% allowance. `release:check` runs the `bundle-budget` step after `generate`, records the size in `.release/gate.json` (`bundle`) and fails past the limit; `bun run check:bundle` runs it alone (`scripts/lib/bundle-budget.mjs`, `test/unit/bundle-budget.test.ts`). Raising the baseline is a reviewed change to that file. At the release commit in section 11: 2,373,613 bytes, 1.3% over the baseline, within the 2,577,330-byte limit |

## 7. Capability and documentation

| Requirement | Status | Evidence |
|---|---|---|
| Every capability the deployment relies on is Built in CAPABILITIES.md, or its gap accepted in the sign-off | Per deployment | [CAPABILITIES.md](CAPABILITIES.md) |
| Delegated admins and SimpleRBAC are tested, not only the superuser | Met | `e2e/app/nav-parity.spec.ts`, `e2e/app/persona-matrix.spec.ts`; the whole suite runs on SimpleRBAC in every release check |
| README, ARCHITECTURE, AGENTS, CAPABILITIES and this gate describe the release truthfully | Met at the release commit | Reviewed in the change that last touched them |

## 8. Backend dependencies (outlabsAuth)

The console requires outlabs-auth 0.1.0a35 or later. That release closed the scoping gap that
blocked delegated admins; the items below are what remains. Of what it added for consoles, the
console does not use the self-service e-mail change (owner decision 2026-10-03, below) and
`entity_id` on `/permissions/me` and `/permissions/user/{id}` (the permissions in force at one
entity), which no page needs yet.

- **Authorization scoping** (resolved in 0.1.0a35, DD-061): entity, membership, permission-check
  and orphaned-account routes and account creation are scoped to the admin's organization (F-020,
  F-039, F-040, F-012, F-161, F-162). Another tenant's entity answers 404 like a nonexistent one,
  which the entity detail says; a delegated admin gets their organization's orphans. The console
  still anchors delegated admins on their organization in the tree and pickers.
- **Accounts holding a system-wide role** (0.1.0a35): a tenant admin may not change any account
  with a direct system-wide role row, whatever its status (403 on the users routes: profile,
  password, status, delete, restore, invitation, direct roles, sessions, API keys; entity
  memberships are not covered). Nothing on the user record, `/permissions/me` or `/auth/config`
  says so. The only signal is partial: user detail reads the account's direct roles
  (`GET /users/{id}/role-memberships?include_inactive=true`) and hides the refused changes with
  an explanation, but that read leaves out rows whose role definition is archived
  (`_role_definition_is_visible`) while the refusal
  still counts them, so such an account is offered the change and the server's refusal is shown;
  and the users list has no per-row signal at all (its row menu offers Edit profile and Delete
  and shows the refusal). A field on the user record and list rows (for example
  `managed_by_global_only`) would close both.
- **ABAC write refusals** (0.1.0a35): the condition routes refuse an invalid condition with 400
  but forward only the message (`details.detail`), not the `details.reason`
  (`invalid_abac_condition`) and `details.field` the release notes promise, so a refusal shows
  above the form instead of on its field. The console validates the same rules first, so it does
  not send such a condition.
- **Sessions**: the console marks this browser's session from 0.1.0a35's `is_current` (the access
  token's `sid`) and signs out other devices with `keep_current` (F-030). That request refuses an
  access token without `sid` (minted before 0.1.0a35) with a plain 400 and no reason code, so the
  console recognises it by status alone and renews once before asking again; a reason code (for
  example `details.reason = session_not_bound`) would make that unambiguous. Still open:
  blacklisting access tokens on revoke in the examples, a refresh grace window (F-157), and
  `keep_current` on the admin route (`DELETE /users/{id}/sessions` has none in 0.1.0a35), so user
  detail offers no sign out of other devices; an admin's own sessions are managed from Account.
- **Published policy and state** (0.1.0a35): the console reads the password policy and the
  registration mode in `/auth/config` and `has_password` on users. Every new-password form checks
  and states the published policy (F-097); sign-in and signup follow the registration mode; an
  account without a password gets Set a password on Account and Set password from an admin
  (F-098). Still open: whether messaging can deliver codes (F-099); an endpoint that sets a first
  password for the signed-in account (0.1.0a35 changes one only with the current password, so
  Account emails the reset link instead); and `has_password` after a password is set on an
  account created through OAuth sign-in, which stays false because neither the reset nor the
  admin route adds the password sign-in method (the password signs in regardless).
- **Self-service e-mail change** (0.1.0a35): opt-in per host (`self_service_email_change`) and
  re-authenticated (`PATCH /users/me` with `current_password`), which resolves F-193 on the
  server. Owner decision 2026-10-03: the console has no Change email form. With the opt-in on,
  0.1.0a35 changes the sign-in address at once on the current password alone, without confirming
  the new address or notifying the old one, so a mistyped address or a stolen password takes the
  account out of its owner's reach. Admins correct e-mails from Users › Edit profile
  (CAPABILITIES.md). Revisit only if outlabs-auth adds confirmation of the new address and a
  notice to the old one.
- **Integrity**: versions or ETags on writes (F-158), an atomic role permission-set change.
- **Audit coverage**: 0.1.0a35 adds entity lifecycle events (category `entity`), entity-type
  settings events (`config`) and role and permission history endpoints. The console lists the
  entity and settings events in Audit (Entities, Settings) and the entity's own on its Activity
  card (F-241), and shows each definition's history on its page (F-092). These events have no
  account (`subject_user_id` null, an empty e-mail snapshot), so the console names the entity
  from their metadata or says Settings; settings events have no organization, so only global
  admins find them. Still missing: machine-key and service-account events (F-092), and the
  history of an archived role or permission, which answers 404 like the definition itself, so an
  archive is recorded but cannot be read back.
- **Key inventory status**: the entity key inventory (`GET /admin/entities/{id}/api-keys?status=`)
  filters on the stored status only, and outlabs-auth never stores `expired` (a key past its
  expiry date stays `active`). The console therefore offers no Expired filter and labels the
  default "Active (includes expired)"; each row shows the effective state, but the count includes
  keys that can no longer authenticate. An effective-status filter (expired, not in effect) would
  let the inventory list working keys only (v-keys-audit-01).
- **OAuth**: an authorize variant reached by top-level navigation, so console and API need not
  be same-site (F-150). The associate error redirect of 0.1.0a35 is used (F-104): a failed link
  returns to the account landing with `?link_error=<code>&provider=<name>` and Connected
  accounts explains each documented code. It returns only where a landing is known (the frontend
  profile's association landing, else the router's `error_redirect_url`, else its
  `success_redirect_url`); without one the callback answers JSON on the API's own page. The
  codes are derived from the error's wording (`_associate_error_code`), so a reworded server
  error falls back to `provider`; the console's generic message covers codes it does not know.
- **Docs**: the backend's console-integration guide still describes the React console (port 5173,
  `VITE_*` settings); update it for this console (`bun run dev` on port 3000, `NUXT_PUBLIC_*` in
  development only, `app-config.json` in production, `frontendProfileKey`, same-site OAuth)
  (F-235).
- **Example seeds** (limit release-check coverage, not deployments): entity-scoped managers,
  subtree admins and a team lead as personas (F-037, F-041, F-243). The 0.1.0a35 seeds give the
  delegated admins `permission:check` (F-059) and hold every lifecycle state.
- **Grantable scopes for service accounts** (0.1.0a35, F-079): the direct-scope and machine-key
  pickers offer `…/integration-principals/grantable-scopes` and the account dialog checks the whole
  envelope against it, because the create and update 400 (`actor_scope_exceeded`) forwards only
  its message: the reason and the refused scope (`details.policy_reason`, `details.scope`) are
  dropped by the router. On EnterpriseRBAC the platform route is superuser-only, and the entity
  route needs `api_key:create` there even for an admin who may only edit the account; such a
  refusal is said in the dialog and the server stays the final word.
- **Contract additions** behind Partial and Missing rows in CAPABILITIES.md: grantable roles
  readable by delegated admins (F-079; the service-account grantable scopes are in use), role holder
  counts (F-112), role names aligned with the role ids on memberships (F-067: 0.1.0a35's
  `role_names` are system names sorted apart from `role_ids`, so several roles cannot always be
  told apart; entity names and F-103 are resolved), effective-permission
  sources with entity context (F-013, F-239), move-target validation (F-076), no rotation of a
  suspended key (F-080), resend and restore by delegated inviters (F-244), and failed sign-in data
  beyond wrong passwords (audit events for unknown e-mails, locked accounts and wrong one-time
  codes, so the dashboard's "Wrong passwords" tile could count every failed sign-in).

## 9. Per-deployment cutover checklist

Keep each deployment's answers in its own (private) records, not in this repository.

1. The backend runs outlabs-auth 0.1.0a35 or later (Settings shows the library version) and
   reports `api_contract_version` `outlabs-auth.api/v1`. The console requires 0.1.0a35: earlier
   releases leave entity, membership and orphaned-account routes unscoped for delegated admins
   and accept ABAC conditions the engine cannot evaluate. If it runs another release than the one
   in section 11, a live sign-in and the smoke in item 10 pass against it before cutover: the
   release check proves only the release it ran against.
2. The deployment's `app-config.json` lives outside this repository; `apiBaseUrl` is `https`;
   `frontendProfileKey` names a registered profile whose public origin is the console. Its
   branding (`appName`, `appSubtitle`, `signInDescription`, `authBrand`, the logo) speaks for the
   deployment: end users read the guest pages too (signup, invitations, password resets).
3. The console is served at the root of its own hostname; if OAuth is enabled, on the same site
   as the API.
4. The API's CORS allows the console origin exactly, with credentials; it sends
   `Access-Control-Max-Age` and exposes `Retry-After`.
5. `bun run deploy:cloudflare --config <file> --env <name>` succeeds from a clean `HEAD` that
   passed `bun run release:check` on this machine within the last 7 days, with
   `CLOUDFLARE_ACCOUNT_ID` set to the deployment's account. Push the commit first so it can be
   found again (the deploy warns otherwise).
6. On the live host: the response headers match docs/security-posture.md (an HTML page's
   `Cache-Control` is `public, max-age=0, must-revalidate, no-transform`), `connect-src` names
   the API origin, the served HTML has no script the console did not ship (no
   `static.cloudflareinsights.com` beacon; Rocket Loader is off on the zone), and sign-in shows
   no CSP violation in the browser console.
7. E-mailed links (reset, invitation, magic link, sign-in code) open the console.
8. OAuth (if enabled): one live sign-in and one account link succeed. Error redirects land on
   `/auth/login` (sign-in) and on the account landing, `/app/account` or another Account tab
   (linking, where the frontend profile declares an association landing or the associate router
   an error or success redirect), and a failed link shows on Connected accounts.
9. A session survives an access-token expiry (sign in, wait past the lifetime, act).
10. Smoke as a superuser and as the deployment's least-privileged admin: navigation matches what
    each may do; sign-out ends the session.
11. Any deployment-specific CSP or hosting settings of the old React console are replaced; the
    old console stays deployable for rollback from the source the deployment built it from (this
    repository keeps it only as of the initial public release, `a4d7e84`).
12. The gaps in CAPABILITIES.md and section 8 that matter to this deployment are accepted in the
    sign-off.

## 10. Sign-off

The cutover of a deployment is contingent on this gate (ARCHITECTURE.md, "Decisions",
2026-10-01). The owner records each sign-off here with the release commit; deployment names stay
in private records.

| Date | Release commit | Gate result (Open items accepted) | Owner |
|---|---|---|---|
| — | — | Not signed off | — |

## 11. Last verification

Recorded by `bun run release:check` (section 1) on 2026-10-03 at the commit that adds this record,
the documentation commit after `27d41b4`; refresh it whenever the gate is re-run. The record itself
(`.release/gate.json`) stays on the machine that ran it. It verifies the move to outlabs-auth
0.1.0a35, the release the console requires, and what the console took up from it (section 8). Run
against the outlabsAuth example backends on outlabs-auth 0.1.0a35 (API contract
`outlabs-auth.api/v1`), each reseeded before its suite (`RELEASE_RESEED_CMD`), in release mode:
one retry, `failOnFlakyTests`, `forbidOnly`, fresh persona sign-ins, Playwright's default workers
(8 here), Chromium only. Two release checks in a row passed at this commit. Before it, one passed
with the same results at `71e0b76`, and two failed strict mode on a test that passed only on retry
(below).

| Check | Result |
|---|---|
| Clean tree, `bun install --frozen-lockfile`, typecheck, typecheck:tests, lint (with guardrails), unit tests, check:api-types | green; 830 unit tests in 48 files |
| generate | green; 4 inline-script hashes across 24 HTML files |
| Dependency audit (`bun run audit`) | no vulnerabilities, 5 reviewed advisories ignored (the `audit` script in `package.json`) |
| Bundle budget (`bundle-budget` step, `.output/public/_nuxt`) | within budget, baseline unchanged: 201 JavaScript files, 2,373,613 bytes raw (1.3% over the 2,343,028-byte baseline; limit 2,577,330), about 753 KB gzip (sum per file); CSS 162 KB raw |
| Backend preflight | EnterpriseRBAC and SimpleRBAC each answer `/v1/auth/config` with their own preset, both on outlabs-auth 0.1.0a35 |
| EnterpriseRBAC, static build, release mode | 653 passed, 0 failed, 0 flaky, 10 skipped (all SimpleRBAC-only tests and personas); about 4 minutes |
| SimpleRBAC, static build, release mode | 434 passed, 0 failed, 0 flaky, 229 skipped (EnterpriseRBAC-only areas and personas, and sign-in methods and development capture routes the SimpleRBAC example does not offer); about 11 minutes, most of it disposable-session logins waiting for the login limiter's window |

Two failures surfaced, each a test that passed only on retry; both were test defects:

- **The login limiter on SimpleRBAC: a harness defect** (the first check, at `ed68541`, the last
  feature commit). An identity-switch test's fresh-session login was refused by the example
  backend's password-login limiter (20 per 5 minutes per IP), waited the 300 seconds the refusal
  names, and was refused again. The limiter's window is fixed (it opens with its first login) and
  every refusal names all of it, so one wait of that length can land after the next window has
  opened and filled with other workers' logins, and the session specs added for 0.1.0a35 raised
  the number of logins a SimpleRBAC run spends. A stress run of the session lane with the
  session-lifecycle, sessions-table and user-sessions specs (three repeats, four workers) failed
  three tests on the limiter, one of them a sessions-table spec whose bare login did not wait at
  all. The harness now tries a refused login every 15 seconds until it is admitted, for up to 11
  minutes (`e2e/support/login-limiter.ts`, `test/unit/login-limiter.test.ts`), and that spec's
  login goes through it; the same stress run with every account spec added passed on both
  presets, and the SimpleRBAC suite went from about 15 minutes to 11. No product code changed.
- **Advanced options still opening: a test that acted during an animation** (EnterpriseRBAC, in
  the first of two checks at `ba9eae3`, an earlier version of this record). "Add child preselects
  the parent and sends the advanced options" checked the Structural box of Allowed child classes
  5 ms after pressing Advanced options, inside the collapsible's 200 ms opening animation, and
  Playwright reported that the click did not change it. The trace shows why: while it opens the
  section clips its fields, so bringing the box into view scrolled the section itself (278 px),
  which scrolled back as it grew (to 240 px within 10 ms); the box moved 38 px down between being
  located and being pressed. The spec now waits for the section to finish opening
  (`27d41b4`), as a person does; the entities specs passed three times and the two Advanced
  options tests twenty times each. The animation is the stock collapsible's; no product code
  changed.

### Earlier verification: the cutover (2026-10-02)

Recorded by `bun run release:check` on 2026-10-02 at the cutover (`f8141f9`), the commit that made
this repository the Nuxt console, against the outlabsAuth example backends on outlabs-auth
0.1.0a34 (API contract `outlabs-auth.api/v1`), in release mode with Playwright's default workers
(8 there), Chromium only. Two release checks in a row passed at that commit.

| Check | Result |
|---|---|
| Clean tree, `bun install --frozen-lockfile`, typecheck, typecheck:tests, lint (with guardrails), unit tests, check:api-types | green; 747 unit tests in 42 files |
| generate | green; 4 inline-script hashes across 24 HTML files |
| Dependency audit (`bun run audit`) | no vulnerabilities, 4 reviewed advisories ignored (the `audit` script in `package.json`) |
| Backend preflight | EnterpriseRBAC and SimpleRBAC each answer `/v1/auth/config` with their own preset |
| EnterpriseRBAC, static build, release mode | 510 passed, 0 failed, 0 flaky, 10 skipped (all SimpleRBAC-only tests) |
| SimpleRBAC, static build, release mode | 330 passed, 0 failed, 0 flaky, 190 skipped (EnterpriseRBAC-only areas, and development capture routes the SimpleRBAC example does not mount) |
| Bundle baseline (`.output/public/_nuxt`) | 199 JavaScript chunks, 2.34 MB raw, about 740 KB gzip (sum per file); CSS 162 KB raw |

The verification before it passed, but two of its five release checks failed strict mode on tests
that passed only on retry. What each was, and what changed:

- **Service-account key edit (F-082), twice in five runs: a product defect.** The dialog refused a
  key edit that kept a scope the account no longer grants by setting the error on the Scopes field
  from the submit handler. UForm re-validates a field on its own (on blur, on change and 300 ms
  after typing) and replaces that field's errors with the result; the schema passes, so the
  refusal vanished about 70 ms after it appeared and Save seemed to do nothing. The test passed
  only when its first look fell inside that window. The refusal is now a rule of the form
  (`AppFormDialog` `validate`) in both key dialogs, derived again on every validation, and the
  scope picker reports a selection change to the form, so the refusal also lifts as soon as the
  flagged scope is removed. Both key specs make the field validate again after the refusal and
  failed without the fix, five runs in five.
- **Audit pager (F-090): a test that acted on the previous result.** It waited for the category's
  request, not its answer, and checked "Signed in" against the rows still on screen from before
  (`placeholderData`), then opened the page-size menu. When the new rows replaced the old ones, the
  browser's scroll anchoring followed a row both results share up the panel, carrying the open
  menu's trigger, and so the menu, out of view. Reproduced 3 times in 10 under parallel load. The
  test now waits for the category's own answer and asserts its rows and total before using the
  pager.
- **Entity activity raw payload: not reproduced.** It failed once on its first attempt ("After"
  did not appear after "Show raw payload"). It passed in every run since, more than 100: targeted repeats (some with the CPU
  slowed 4 to 8 times or every API answer delayed by up to 2 seconds), six full EnterpriseRBAC
  suites without retries (two with 16 workers) and every release check at the cutover. No path
  that recreates the event card or drops the click was found: the card's parents stay mounted
  for a superuser, and cards above it that finish loading later do not move the button under a
  press (scroll anchoring holds it; probed). It stays Open in section 1.
- **"New entity" on a selection still loading: a product defect** (seen in earlier runs and once
  in a stress run here). The parent was taken from the tree or the selection's path; while neither
  had loaded it fell back to the organisation in view, which for a superuser was none, so the
  dialog opened on "New organization" and kept it. The selection's own record (the key the detail
  panel reads) is now a source too, and an unresolved selection stays the parent. A spec that
  holds the tree and the path until the dialog is open fails without the fix, four runs in four.

Five more surfaced during that verification:

- **Accessibility sweep of the New service account dialog: a product defect.** It failed once on
  its first attempt in the release checks at the cutover, and in both of two stress runs with 16
  workers. The dialog sweep scans as soon as a dialog opens; when the role pool had not arrived,
  the role picker showed the palette with its empty message inside the listbox, which axe reports
  as `aria-required-children` (critical). The role, permission and scope pickers now say
  "Loading roles..." (or their empty text) in place of the palette. A spec holds the role pool
  and scans the dialog; it failed without the fix, three runs in three.
- **Dialog-kit "a partly typed date is flagged…": a test that reopened too early** (once in the
  release checks at the cutover; the "dialog-kit date flake" of an earlier verification). After
  saving a validity window it reopened Edit validity at once. The dialog is filled from the row,
  and the save refreshes the row by invalidation, which nothing awaits, so a reopen before the
  refetch landed showed an empty end date and the Backspaces had nothing to delete. Holding that
  refetch reproduced it in each of two runs. The test now waits for the row to show the saved date. (A
  save from such a stale dialog meets the dialog's conflict check, AppFormDialog `conflict` in
  ARCHITECTURE.md "Forms and dialogs", which `e2e/app/dialog-kit.spec.ts` covers for this dialog.)
- **Permissions list "true total": data isolation** (in stress runs only). It compared the list
  summary with a permission count read before the page loaded, while other tests add
  permissions. It now compares the summary with the total each page was served with.
- **Delete confirmation from a users row, focus return: a product defect** (both attempts of one
  SimpleRBAC run in the release checks at the cutover). The spec opened the row's menu before its
  search had answered; when the answer re-rendered the table, the rows, keyed by position, gave
  the target's row elements to another account, so Escape found the button that opened the
  dialog detached and focus fell to the page. The users table keys its rows by account now, and
  the spec waits for its search. A spec that answers a search only once a row's Delete dialog is
  open failed without the fix, three runs in three. (The other record tables still key rows by
  position: ARCHITECTURE.md "List views".)
- **Entity governance, a number typed as the only change: a test that relied on a stray blur**
  (both attempts of one EnterpriseRBAC run in the release checks at the cutover, and in stress
  runs). The Max members field (Nuxt UI's number input) commits what was typed when it loses the
  focus or on Enter. As the dialog's only change, Save stayed disabled until then, and Playwright
  waits for Save to be enabled before it presses it, so the spec passed only when something else
  took the focus after the typing. A person's single click on Save does commit and save (probed:
  the press takes the focus). The specs now leave the field with Tab, as a keyboard user does.

Stability after the fixes: the affected specs and the dialog sweep repeated 10 times each on the
static build against EnterpriseRBAC with 8 workers (180 runs, 0 failures); the date and
permissions-list specs 10 times each beside the specs that add permissions (0 failures); the
users list and confirmation specs 5 times each on both presets (0 failures); the governance and
entities workspace specs 10 times each (0 failures); the whole EnterpriseRBAC suite four times
without retries before the last five fixes (508 passed each); then the two consecutive release
checks above.

Fixed for earlier verifications and still in force:

- `bun run audit` failed on six devalue advisories (fixed in 5.9.3; the lockfile has 5.9.4) and on
  a node-forge advisory with no patched release; node-forge comes with the dev server's HTTPS
  helper, is not in the artifact, and is in the reviewed allowlist.
- A membership role chip whose names come from the membership history or the role catalog read
  "Unknown role" while both loaded, and its popover said "This role is outside the roles you can
  read". It reads "Loading role..." (with `aria-busy`), and a test that holds both responses fails
  without the fix.
- Delegated-admin and other reference-seed facts are assertions (`expectSeeded`), so a missing
  seed record fails instead of skipping; the resend-invite test runs on SimpleRBAC.
