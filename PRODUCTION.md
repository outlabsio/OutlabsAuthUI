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
| No flaky E2E test hides a product defect | Open | Fixed, each with a spec that fails without the fix: a scope refusal in the key dialogs that the field's own re-validation erased a moment after it appeared, so Save seemed to do nothing (product, F-082; `e2e/service-accounts/service-accounts.spec.ts` and `e2e/api-keys/api-keys-workspace.spec.ts` "…refused on the field…"); "New entity" used before the tree and the selection's path loaded opening Create entity on "New organization" (product; `e2e/entities/entities-workspace.spec.ts` "New entity opened before the tree…"); the F-090 audit spec working the pager while the previous result was still on screen (test; it now waits for the category's own answer and rows); a role, permission or scope picker still loading its options showing the palette's empty message inside its listbox, invalid ARIA the dialog sweep caught only when it scanned before the pool arrived (product; `e2e/a11y/a11y-smoke.spec.ts` "a role picker still loading its roles"); the dialog-kit date spec reopening Edit validity before the row's refetch after a save had landed (test); the permissions list spec comparing the summary with a total that other tests change (test, data isolation); users list rows keyed by position, so closing a row dialog after the list changed lost the keyboard focus (product; `e2e/users/users-list.spec.ts` "closing a row dialog after the list changed…"); the governance specs pressing Save before the number they typed was committed (test). Earlier: Enter in a Tags field submitting a form dialog (`e2e/app/dialog-kit.spec.ts` "Enter in a tags field"); a role chip reading "Unknown role" while its names load (`e2e/roles/role-access-kit.spec.ts` "a membership chip says it is loading…"). Open: the entity-activity raw payload failed once on its first attempt and has not been reproduced since (section 11) |
| Releases deploy only a clean `HEAD` that passed the release check, with a token for the deployment's Cloudflare account | Met | `scripts/deploy-with-env.sh` passes `--require-release-gate` to `scripts/deploy-preflight.mjs`, which refuses a dirty tree and any record that is for another commit, ran on uncommitted changes (`--allow-dirty`), failed, lacks either preset or is older than 7 days (`--release-gate-max-age-days`); a `HEAD` on no remote branch only warns. `DEPLOY_SKIP_RELEASE_GATE=1` drops only the release-gate requirement, with a warning. Before building, the script requires `CLOUDFLARE_ACCOUNT_ID` with `--env` and stops when `wrangler whoami --json` fails or does not list that account (`test/unit/release-gate.test.ts`, `test/unit/deploy-account.test.ts`) |

## 2. Security

| Requirement | Status | Evidence |
|---|---|---|
| Written security and session posture | Met | [docs/security-posture.md](docs/security-posture.md) |
| Security headers on every response, CSP without `'unsafe-inline'`/`'unsafe-eval'` scripts, `connect-src` pinned to the deployment's API | Met | `public/_headers`, `scripts/csp-hashes.mjs`, the deploy preflight; `e2e/static/static-build.spec.ts` fails on any CSP violation or third-party request |
| Production config fails closed (missing or invalid `app-config.json`, plain-`http` remote API) | Met | `e2e/app/config-fail-closed.spec.ts`, `e2e/static/static-build.spec.ts` |
| One-time secrets never cached; audit payloads and exports redacted | Met | `e2e/api-keys/secret-reveal.spec.ts`, `e2e/audit/audit-workspace.spec.ts`, `test/unit/audit.test.ts` |
| Delegated (non-superuser) admins cannot reach other organizations' data | Backend | The console scopes what it shows (`e2e/app/persona-matrix.spec.ts`), but the backend's entity, membership and account-creation routes are not scoped to the admin's organization (F-020, F-039, F-040, F-012). Until outlabsAuth fixes this, a deployment either gives console access only to global admins or accepts the risk in its sign-off. |
| OAuth works only same-site | Accepted with a check | Documented constraint (docs/security-posture.md); each OAuth deployment runs the live check in section 9 (F-150) |
| The OAuth callback cannot sign a browser into someone else's account (login CSRF) | Met | A one-time `sessionStorage` marker set right before the provider redirect (sign-in and signup only); without one from the last 20 minutes the callback revokes the pair and stores nothing (docs/security-posture.md). `e2e/app/session-lifecycle.spec.ts` "an OAuth callback this tab did not start…" fails without it |

## 3. Accessibility

| Requirement | Status | Evidence |
|---|---|---|
| No axe WCAG 2.1 A/AA violations on every route, record page, the main dialogs and the guest pages, in light and dark mode, at 1440px and 390px | Met, except colour contrast (accepted, next row) | `e2e/a11y/a11y-smoke.spec.ts` (including a dialog whose role picker is still loading), `e2e/auth/auth-a11y.spec.ts` |
| Colour contrast (WCAG AA) in light mode | Accepted | Owner decision 2026-10-02 (F-032): a known limitation. Primary buttons and some status text (the stock subtle amber badges) fall below AA on light backgrounds; the only fix overrides the theme's CSS variables, which the stock-theme rule forbids (AGENTS.md non-negotiable 5), so the stock theme stays. Consequence: colour contrast is not checked by the gate; the axe `color-contrast` rule stays off in both modes (`e2e/support/a11y.ts`), and every other WCAG A/AA rule is checked. |
| Keyboard use: skip link, landmarks, titles, focus return from dialogs and menus, reduced motion | Met | `e2e/app/shell-navigation.spec.ts`, `e2e/app/dialog-kit.spec.ts` |
| Every dialog swept by axe | Open | About 22 less central dialogs are not in the sweep yet |

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
| A bundle-size budget enforced by the release check | Met | `bundle-budget.json` holds the baseline (2,343,028 bytes of JavaScript under `.output/public/_nuxt`, measured at `018b6d6`) and a 10% allowance. `release:check` runs the `bundle-budget` step after `generate`, records the size in `.release/gate.json` (`bundle`) and fails past the limit; `bun run check:bundle` runs it alone (`scripts/lib/bundle-budget.mjs`, `test/unit/bundle-budget.test.ts`). Raising the baseline is a reviewed change to that file |

## 7. Capability and documentation

| Requirement | Status | Evidence |
|---|---|---|
| Every capability the deployment relies on is Built in CAPABILITIES.md, or its gap accepted in the sign-off | Per deployment | [CAPABILITIES.md](CAPABILITIES.md) |
| Delegated admins and SimpleRBAC are tested, not only the superuser | Met | `e2e/app/nav-parity.spec.ts`, `e2e/app/persona-matrix.spec.ts`; the whole suite runs on SimpleRBAC in every release check |
| README, ARCHITECTURE, AGENTS, CAPABILITIES and this gate describe the release truthfully | Met at the release commit | Reviewed in the change that last touched them |

## 8. Backend dependencies (outlabsAuth)

The console requires outlabs-auth 0.1.0a35 or later. That release closed the scoping gap that
blocked delegated admins; the items below are what remains, and what it added that the console
does not use yet.

- **Authorization scoping** (resolved in 0.1.0a35, DD-061): entity, membership, permission-check
  and orphaned-account routes and account creation are scoped to the admin's organization (F-020,
  F-039, F-040, F-012, F-161, F-162). Another tenant's entity answers 404 like a nonexistent one,
  which the entity detail says; a delegated admin gets their organization's orphans. The console
  still anchors delegated admins on their organization in the tree and pickers.
- **Accounts holding a system-wide role** (0.1.0a35): a tenant admin may not change any account
  with a direct system-wide role row, whatever its status (403). Nothing on a user row says so, so
  the console still offers the change and shows the refusal; a field on the user record (or the
  list) would let it hide those actions as it does for superusers.
- **ABAC write refusals** (0.1.0a35): the condition routes refuse an invalid condition with 400
  but forward only the message (`details.detail`), not the `details.reason`
  (`invalid_abac_condition`) and `details.field` the release notes promise, so a refusal shows
  above the form instead of on its field. The console validates the same rules first, so it does
  not send such a condition.
- **Sessions**: 0.1.0a35 marks the current session (`sid`, `is_current`) and keeps it on "sign out
  others" (`keep_current`); the console does not use them yet. Still open: blacklisting access
  tokens on revoke in the examples, a refresh grace window (F-030, F-157).
- **Published policy and state**: 0.1.0a35 publishes the password policy and registration mode
  in `/auth/config` and `has_password` on users; the console does not read them yet. Still open:
  whether messaging can deliver codes (F-097, F-098, F-099).
- **Integrity**: versions or ETags on writes (F-158), an atomic role permission-set change.
- **Audit coverage**: 0.1.0a35 adds entity lifecycle events and role and permission history
  endpoints (the console does not show the histories yet); machine-key events are still missing
  (F-092, F-241).
- **Key inventory status**: the entity key inventory (`GET /admin/entities/{id}/api-keys?status=`)
  filters on the stored status only, and outlabs-auth never stores `expired` (a key past its
  expiry date stays `active`). The console therefore offers no Expired filter and labels the
  default "Active (includes expired)"; each row shows the effective state, but the count includes
  keys that can no longer authenticate. An effective-status filter (expired, not in effect) would
  let the inventory list working keys only (v-keys-audit-01).
- **OAuth**: an authorize variant reached by top-level navigation, so console and API need not
  be same-site (F-150). 0.1.0a35 adds the associate error redirect (F-104), which the console
  does not use yet.
- **Docs**: the backend's console-integration guide still describes the React console (port 5173,
  `VITE_*` settings); update it for this console (`bun run dev` on port 3000, `NUXT_PUBLIC_*` in
  development only, `app-config.json` in production, `frontendProfileKey`, same-site OAuth)
  (F-235).
- **Example seeds** (limit release-check coverage, not deployments): entity-scoped managers,
  subtree admins and a team lead as personas (F-037, F-041, F-243). The 0.1.0a35 seeds give the
  delegated admins `permission:check` (F-059) and hold every lifecycle state.
- **Contract additions** behind Partial and Missing rows in CAPABILITIES.md: grantable roles
  readable by delegated admins (F-079; 0.1.0a35 adds the service-account grantable scopes, which
  the console does not use yet: its direct-scope picker applies the default policy), role holder
  counts (F-112), names on grants the admin cannot read (F-067, F-103), effective-permission
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
6. On the live host: the response headers match docs/security-posture.md, `connect-src` names
   the API origin, and sign-in shows no CSP violation in the browser console.
7. E-mailed links (reset, invitation, magic link, sign-in code) open the console.
8. OAuth (if enabled): one live sign-in and one account link succeed; error redirects land on
   `/auth/login` and `/app/account`.
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

Recorded by `bun run release:check` (section 1) on 2026-10-02 at the cutover, the commit that made
this repository the Nuxt console; refresh it whenever the gate is re-run. The record itself
(`.release/gate.json`) stays on the machine that ran it. Run against the outlabsAuth example
backends (outlabs-auth 0.1.0a34, API contract `outlabs-auth.api/v1`), each reseeded before its
suite (`RELEASE_RESEED_CMD`), in release mode: one retry, `failOnFlakyTests`, `forbidOnly`, fresh
persona sign-ins, Playwright's default workers (8 here), Chromium only. Two release checks in a
row passed at this commit.

| Check | Result |
|---|---|
| Clean tree, `bun install --frozen-lockfile`, typecheck, typecheck:tests, lint (with guardrails), unit tests, check:api-types | green; 747 unit tests in 42 files |
| generate | green; 4 inline-script hashes across 24 HTML files |
| Dependency audit (`bun run audit`) | no vulnerabilities, 4 reviewed advisories ignored (the `audit` script in `package.json`) |
| Backend preflight | EnterpriseRBAC and SimpleRBAC each answer `/v1/auth/config` with their own preset |
| EnterpriseRBAC, static build, release mode | 510 passed, 0 failed, 0 flaky, 10 skipped (all SimpleRBAC-only tests) |
| SimpleRBAC, static build, release mode | 330 passed, 0 failed, 0 flaky, 190 skipped (EnterpriseRBAC-only areas, and development capture routes the SimpleRBAC example does not mount) |
| Bundle baseline (`.output/public/_nuxt`) | 199 JavaScript chunks, 2.34 MB raw, about 740 KB gzip (sum per file); CSS 162 KB raw |

The previous verification passed, but two of its five release checks failed strict mode on tests
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

Five more surfaced during this verification:

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
