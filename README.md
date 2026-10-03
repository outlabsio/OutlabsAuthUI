# OutlabsAuthUI

The admin console for [outlabs-auth](https://github.com/outlabsio/outlabsAuth), the FastAPI
authentication and authorization library. It is a static single-page app built on
**Nuxt 4 + Nuxt UI v4**, started from the official
[`nuxt-ui-templates/dashboard`](https://github.com/nuxt-ui-templates/dashboard) template.

One build serves any outlabs-auth backend. Each deployment names its API in a runtime
`app-config.json`; the console then reads the backend's `/auth/config` and adapts to what it
mounts: the EnterpriseRBAC or SimpleRBAC preset, its features, sign-in methods and surfaces. Pages,
navigation and actions follow the signed-in admin's permissions, evaluated with the backend's own
permission algebra, so a delegated admin sees what they may do and nothing else.

What it covers:

- **Sign-in** for every method the backend offers: password, magic link, e-mail and phone codes
  (WhatsApp, SMS), OAuth providers, self-signup, recovery, invitations.
- **Directory and access**: users (lifecycle, sessions, personal API keys, memberships, direct
  roles, effective permissions), the entity hierarchy, roles and permissions with ABAC conditions,
  service accounts and their keys, the audit log, and settings.
- **Production hardening**: a hash-based Content-Security-Policy on the static build, a session
  lifecycle that survives token expiry and multiple tabs, fail-closed configuration, and a
  Playwright suite run against both presets and every seeded persona before each release.

## Quick start

You need [Bun](https://bun.sh) 1.3.3 or later and Node.js 22.18 or later, and a running
outlabs-auth backend: the console requires outlabs-auth 0.1.0a35 or later (its tenant-scoped
routes, ABAC write validation and example seeds are what the console and its suite are built
against). The public outlabsAuth repository ships two seeded example apps, EnterpriseRBAC and
SimpleRBAC; its
[examples quick start](https://github.com/outlabsio/outlabsAuth/tree/v0.1.0a35/examples#quick-start)
sets them up (PostgreSQL, optionally Redis): migrate and seed with `reset_test_env.py`, then
`uvicorn main:app --port 8004` (any free port; the guides here use 8004 for EnterpriseRBAC and
8003 for SimpleRBAC). Both examples allow the console on `http://localhost:3000`.

```bash
bun install
cp public/app-config.template.json public/app-config.json   # untracked; points at http://localhost:8004/v1
bun run dev                                                 # http://localhost:3000
```

Sign in with an account from the example's seed ([e2e/README.md](e2e/README.md) "Personas" lists
them). Point `apiBaseUrl` (and `authApiPrefix`) in
`public/app-config.json` at another backend to switch; `frontendProfileKey` must name a frontend
profile that backend registers, or be removed for a backend without profiles
([configuration](#configuration)).

## Documentation

| Document | Purpose |
|---|---|
| [AGENTS.md](AGENTS.md) | Rules for contributors and AI agents (short; read first) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layers, session lifecycle, shared kits, per-area notes, decisions |
| [CAPABILITIES.md](CAPABILITIES.md) | What is built, partial or missing, with the specs that prove it |
| [PRODUCTION.md](PRODUCTION.md) | The production gate and the per-deployment cutover checklist |
| [docs/security-posture.md](docs/security-posture.md) | Token storage, headers, CSP, hosting and OAuth constraints |
| [e2e/README.md](e2e/README.md), [docs/e2e-coverage.md](docs/e2e-coverage.md) | Running the E2E suite; what it covers |

## Non-negotiables

1. **Playwright E2E is the acceptance gate.** Every behaviour change ships with a spec, run
   against both example presets (EnterpriseRBAC and SimpleRBAC).
2. **Pinia** for client state only.
3. **Pinia Colada** for all server state (queries + mutations, `app/queries/<resource>.ts`).
   Pages and components never call queries or the API client; lint enforces it.
4. **Vanilla Nuxt UI, no custom styling** — semantic colours and stock utilities only, no
   arbitrary values, no inline styles; `:ui` only on the allowlisted dialog and dashboard
   slots (AGENTS.md, "Styling"; lint enforces it). The theme is `app/app.config.ts`: primary
   amber, neutral zinc and seven more semantic aliases mapped to Tailwind palettes (an owner
   decision, ARCHITECTURE.md "Decisions"); `app/assets/css/main.css` is only its two `@import`s.
5. **Nuxt UI's form system only** — `UForm` + Zod (Standard Schema) + `UFormField`, through
   `AppFormDialog` / `AppConfirmDialog`; server 422 issues land on their fields.

## Stack

Nuxt 4 (`ssr: false`, static SPA) · @nuxt/ui v4 · Pinia · @pinia/colada · Zod 4 · Bun · Playwright · Vitest · Wrangler → Cloudflare Workers.

## Configuration

### Runtime-targeted backend

One build, any backend. On boot, `app/plugins/00.runtime-config.client.ts` resolves the API
target from `/app-config.json` and an optional inline global (`window.__OUTLABS_AUTH_UI_CONFIG__`),
validated with Zod (`app/utils/runtime-config.ts`). Production fails hard on missing or invalid
config (the API must be https, except on localhost); dev also layers `NUXT_PUBLIC_*` env under
the file and falls back to `localhost:8004` `/v1`. Production builds never read `NUXT_PUBLIC_*`:
the keys only exist in `nuxt.config.ts` under `$development`, so a build machine's settings
cannot be baked into the artifact. Capabilities are then discovered from the mounted
backend's `/auth/config`, and the UI adapts.

For local dev, copy `public/app-config.template.json` → `public/app-config.json` (untracked)
or set `NUXT_PUBLIC_API_BASE_URL` / `NUXT_PUBLIC_AUTH_API_PREFIX` (see `.env.example`). The
generated artifact never ships that file; each deployment's config is staged by the deploy
preflight (see [Building and deploying](#building-and-deploying)).

`frontendProfileKey` is the non-secret frontend-profile key the console sends as `app` on
sign-in, invite, recovery, passwordless and OAuth requests, so the backend can route emailed
links and bind the session to this console. It must equal a profile the backend registers
(the enterprise example registers `console` and `portal`; the template uses `console`). Omit
it for a backend without frontend profiles. An unknown key makes every sign-in fail with
`wrong_application` (the sign-in page says so and names the key) and emailed links are not
delivered.

**Hosting constraints.** Serve the console at the root of its own hostname (sub-paths are not
supported: the build uses `baseURL: '/'` and boots from `/app-config.json`). For OAuth sign-in
and account linking, the console and the API must be **same-site** (one registrable domain,
e.g. `console.example.com` and `auth.example.com`): the backend binds the OAuth state to a
`SameSite=Lax` cookie set on the console's cross-origin `fetch` of the authorize URL, which
browsers drop across sites, so every OAuth attempt would end in `invalid_state` (inferred from
the cookie attributes, so each OAuth deployment verifies a live sign-in before cutover). Details
in [docs/security-posture.md](docs/security-posture.md).

The API must allow the console's origin (CORS, with credentials) and the console's
Content-Security-Policy `connect-src` must include the API origin; when either is missing the
sign-in page shows "Can't reach the auth API" rather than failing vaguely. Every authenticated
call is preflighted, so API hosts should send `Access-Control-Max-Age` (e.g. `600`) to let
browsers cache preflights, and should list `Retry-After` in `Access-Control-Expose-Headers` so a
rate-limited request can say how long to wait (the console also reads `retry_after_seconds`
from the error body). Requests time out after 15 seconds. A stored session whose API does
not answer at boot is kept and the console offers Retry or Sign out; only a refused token
refresh signs the admin out (see ARCHITECTURE.md, "Session lifecycle").

Auth branding is runtime-configurable too: set `authLogoUrl` to a public asset path or hosted
SVG URL to replace the default `/brand/outlabs-auth-logo.svg`, and optionally `authLogoDarkUrl`
for dark mode (the sign-in layout renders both with `UColorModeImage`). Leave
`authLogoDarkUrl` unset unless you have a dark variant (the template leaves it out): the
default logo then uses its bundled light-ink variant, and a custom `authLogoUrl` is used in
both modes. `signInDescription` is the line under the sign-in heading and `appSubtitle` the line
under the card on every guest page; both are read by end users too (signup, invitations), so set
them in the deployment's own words. The accessible brand name is controlled separately by
`authBrand`.

Phone country data and masks live in `app/data/phone-codes.ts`, bundled only with the lazily
loaded phone fields (`AppAuthPhoneInput`), so email-only screens never download them. The
dataset follows the official Nuxt UI example, with the complete 245-territory selector
retained; Argentina uses two mobile masks (`## ####-####` and `### #### ####`) so users can
enter either the familiar 10-digit national form or the international-mobile form with the
`9`. The mobile OTP flow canonicalizes both to `+54 9 …` before sending the request.

### `authUi` — sign-in surface config

What the sign-in/recovery/signup screens **offer** is declared by the deployment (the product
choice); what the backend **supports** is discovered from `/auth/config` (the hard gate). A
method renders only when both allow it. The `authUi` object works in `app-config.json`, as
`NUXT_PUBLIC_AUTH_UI_*` env vars, in `nuxt.config.ts` `runtimeConfig.public.authUi`, or the
inline global — resolution and normalization live in `app/utils/runtime-config.ts`, and
`useAuthUiConfig()` is the read surface for components.

| Key | Default | Meaning |
|---|---|---|
| `signup` | `true` | Show "Create an account" + enable `/auth/signup`. `false` = invite-only deployment: the link is hidden and the page redirects to sign-in before rendering. The backend's `POST /auth/register` is still mounted; disable registration on the server too. With `true`, the backend's `registration_mode` still decides: `invite_only` or `closed` hides the link and the page explains how accounts are made there. |
| `identifier` | `'email-or-phone'` | `'email-only'` hides the dial-code picker and requires an email. |
| `defaultCountry` | `'AR'` | Preselected dial code of the phone sign-in field: any ISO 3166-1 alpha-2 code in `app/data/phone-codes.ts` (245 territories, e.g. `AR`, `US`, `GB`, `DE`), in either case. A code that is not in that list falls back to `US` (+1). |
| `channels` | `['whatsapp', 'sms']` | Phone OTP channels offered, in preference order (first = primary button). |
| `oauthProviders` | `[]` | "Continue with …" buttons (replaces the deprecated flat `oauthProviders` key, which still works as a fallback). |
| `magicLink` | `true` | Offer the magic-link alternate when the backend enables `magic_link`. |
| `otpLength` | unset | Digits in a one-time code (4–12) while the backend's `access_code_length` is unknown (its `/auth/config` failed to load); otherwise the advertised value, else 6. |

## Auth flows

All flows live under `/auth/` in the `auth` layout, are vanilla Nuxt UI, and funnel every
token-returning path through `finalizeAuth()` (`app/queries/session.ts`).

- **Sign in** (`/auth/login`) — method-buttons pattern: OAuth
  providers, email, and phone as **peer buttons** that unfold in place (`UCollapsible`,
  `useSignInFlow`). The email method unfolds into the combined email+password form (with
  magic-link / email-code alternates beneath, capability-gated); the phone method unfolds a
  phone-only identifier → channel choice (WhatsApp/SMS per `authUi.channels`) → `UPinInput`
  OTP. **Email-only deployments skip the buttons entirely** and render the form directly.
  The layout waits on capability resolution (`capabilitiesResolved` in `useAuth`) so buttons
  never flicker in after first paint. Steps live in the URL (`?step=channel|code|link-sent`)
  and what they show in sessionStorage, so Back/Forward move between steps and a reload keeps
  the code step without a new request. Every code or link request starts a per-identifier
  cooldown (`useRequestCooldown`); a 429 waits the seconds the API asked for. Each
  `?oauth_error` code has its own dismissible explanation. `?redirect` is sent as
  `redirect_url` on code and link requests and honoured after sign-in, together with the
  backend's `next_url`.
- **Enter a sign-in code** (`/auth/access-code`, "I already have a code") — for a code the user
  already has (the link in a code email, a reloaded tab): where it was sent, then the shared
  code step.
- **Magic link** (`/auth/magic-link?token=…`) — verifies only when the person clicks "Continue
  signing in", so mail scanners cannot use the single-use link first; expired, used and invalid
  links each explain themselves and offer a new one.
- **Signup** (`/auth/signup`) — register + auto-login (`useSignupForm`), gated on
  `authUi.signup` in route middleware, then on the backend's `registration_mode` (an invite-only
  or closed backend, or a registration it refuses as turned off, gets an explanation instead of
  the form). Phone is added + verified afterwards from **Account →
  Profile → Phone number** (a verified number unlocks OTP sign-in where the server has access
  codes on).
- **Recovery** (`/auth/recovery`, linked as "Can't sign in?") — `useRecoveryFlow`: email →
  reset link; phone → OTP sign-in *is* the recovery — it lands on Account and emails a reset
  link (change-password needs the *current* password, which a recovering user doesn't have;
  the emailed token link is the password-reset path). Account says whether that email went
  out (`?reset=sent|failed|none`) and can send it again; Account › Security offers the same
  link to anyone who forgot their current password, and as "Set a password" to an account that
  has none (`has_password` false). A reset signs a signed-in browser out, since
  the server ended its session. `/auth/forgot-password` redirects here.
- **Auth guard exemptions** — a signed-in browser may open `/auth/reset-password` (the token is
  the authorization; phone recovery depends on it), and `/auth/magic-link` or
  `/auth/accept-invite` with a token, which ask "You're signed in as …" before switching
  accounts (`authRouteAllowsSignedIn`, `middleware/auth.global.ts`).

Feature logic lives in composables (`useSignInFlow`, `useSignupForm`, `useRecoveryFlow`,
`useMagicLinkForm`, `useAcceptInviteForm`, `useResetPasswordForm`); shared steps are components
(`app/components/app/Auth{StepHeading,Identifier,PhoneInput,EmailForm,Otp,OauthButtons,SignedInPrompt,Loading}.vue`).
New-password fields check and state the password policy the backend publishes in `/auth/config`
(`usePasswordPolicy`, outlabs-auth's default until it loads) and show the server's own refusal on
the field.

## Commands

```bash
bun install
bun run dev              # http://localhost:3000
bun run typecheck        # nuxt typecheck (vue-tsc)
bun run typecheck:tests  # E2E harness + unit tests
bun run lint             # eslint, including the layer and styling guardrails
bun run lint:guardrails  # the guardrails' negative fixtures (also part of test:unit)
bun run test:unit        # Vitest (pure logic, incl. the API contract test)
bun run gen:api-types    # app/types/api.gen.ts from openapi/outlabs-auth.openapi.json (check:api-types verifies)
bun run generate         # static SPA → .output/public, then CSP script hashes (scripts/csp-hashes.mjs)
bun run preview:static   # after generate: stage public/app-config.json (--local) and serve the artifact on :3000
bun run test:e2e         # Playwright against the dev server (guest smoke runs with no backend)
bun run test:e2e:static  # Playwright against the generated artifact (needs E2E_API_BASE_URL)
bun run audit            # dependency advisories (reviewed allowlist)
bun run release:check    # every release gate on this machine, recorded for the deploy ("Releasing")
```

`bun run build` and `bun run preview` are Nuxt's stock scripts: `build` skips the CSP hashing
(`scripts/csp-hashes.mjs`) and `preview` stages no `app-config.json` and applies no `_headers`.
Build with `generate` and preview with `preview:static`.

## Building and deploying

`bun run generate` produces `.output/public` and then runs `scripts/csp-hashes.mjs`, which:

- hashes every inline script in the generated HTML (Nuxt boots through an import map, the
  colour-mode bootstrap, the runtime-config global and a Zod setting) and writes
  `script-src 'self' 'sha256-…'` into `.output/public/_headers`. `'unsafe-inline'` and
  `'unsafe-eval'` are never allowed: session tokens live in `localStorage`;
- removes files that must not ship (`200.html`, `404.html`, `app-config.template.json`, and
  any local `app-config.json` copied from `public/`);
- fails the build if deployment values were baked into the HTML.

`public/_headers` holds every other header: HSTS, `X-Robots-Tag: noindex, nofollow`
(`public/robots.txt` disallows everything too), COOP, frame and content-type protections,
immutable caching for content-hashed `/_nuxt/*` and `no-cache` for `/_nuxt/builds/*`.

`wrangler.toml` serves the artifact as Workers static assets: `/app/users` is served directly
(`html_handling = "drop-trailing-slash"`), browser navigations that match no file get
`index.html`, and every other miss (a chunk removed by a newer deployment, an old build
manifest, an absent `app-config.json`) reaches `cloudflare/not-found-worker.js` and gets a real
404, which Nuxt's newer-deployment check relies on.

### Releasing

There is no hosted CI. A release is checked on the releasing machine with `bun run release:check`
(`scripts/release-check.mjs`), and the deploy accepts only a commit that passed there.

1. Start the two seeded example backends from the public outlabsAuth repository, EnterpriseRBAC
   and SimpleRBAC, each with its own database and port, as its
   [examples quick start](https://github.com/outlabsio/outlabsAuth/tree/v0.1.0a35/examples#quick-start)
   describes: migrate and seed with `reset_test_env.py`, then `uvicorn main:app --port <port>`
   (e2e/README.md "Backends"). Both examples allow the console on port 3000.
2. Commit your changes: the check refuses uncommitted changes.
3. Run the check:

   ```bash
   export RELEASE_ENTERPRISE_API_BASE_URL=http://localhost:8004   # or --enterprise <url>
   export RELEASE_SIMPLE_API_BASE_URL=http://localhost:8003       # or --simple <url>
   export RELEASE_RESEED_CMD='<a command that reseeds both backends>'   # optional
   bun run release:check
   ```

4. Deploy (below) from the same commit within 7 days.

The check stops at the first failure. In order: no uncommitted changes; `bun install
--frozen-lockfile`; `typecheck`; `typecheck:tests`; `lint`; `test:unit`; `check:api-types`;
`audit`; `generate`; the shipped JavaScript within `bundle-budget.json` (also `bun run
check:bundle` after a `generate`; raising its baseline is a reviewed change); each backend answers
`GET <url>/v1/auth/config` with its own preset (another prefix with `--auth-prefix`); then the
whole Playwright suite on the generated static build against each backend in release mode
(`E2E_RELEASE=1`: one retry, a test that passes only on retry fails, `.only` fails), with
`E2E_ALLOW_DESTRUCTIVE_CLEANUP=1`, so point it at disposable backends only. Both presets gate a
release.

- `--browsers firefox,webkit,mobile-chrome` adds the cross-browser smoke and the phone-sized
  lane (`E2E_BROWSERS`; install them once with `bunx playwright install firefox webkit`).
- `--port <n>` serves the console on another port (default 3000; both backends' CORS allowlists
  must accept it). The check stops at once if something already answers there.
- The reseed command, `RELEASE_RESEED_CMD` for both presets or `RELEASE_ENTERPRISE_RESEED_CMD` /
  `RELEASE_SIMPLE_RESEED_CMD` for one, reaches the harness as `E2E_RESEED_CMD` and runs before
  that preset's suite. Other `E2E_*` variables in your environment are ignored, so a local
  setting cannot weaken the run.
- `--allow-dirty` runs on uncommitted changes; its record is marked dirty and never deploys.

The outcome is written to `.release/gate.json` (gitignored): the commit, whether the tree was
clean, start and finish times, the Node, Bun and Playwright versions, each backend's
`library_version` and `api_contract_version`, every step's result and duration, and each preset's
passed, failed, flaky and skipped counts with the browsers run. Each preset's HTML report, JSON
results and failure traces are under `.release/e2e-<preset>/`. A failed or interrupted run still
writes its record, with `passed: false`, and exits non-zero.

### Deploy

Deploy one deployment with its own config file, kept outside this repository:

```bash
cp .env.deploy.example .env.deploy   # CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID only
bun run deploy:cloudflare --config /path/to/deployments/<name>/app-config.json --env <name>
```

`scripts/deploy-with-env.sh` first checks that the token reaches `CLOUDFLARE_ACCOUNT_ID`
(`wrangler whoami --json` must list it; required with `--env`, and a workers.dev preview without
it is deployed with a warning that nothing was checked). It then builds a fresh artifact and
runs `scripts/deploy-preflight.mjs`, which validates the config with the console's own
production rules (https API that is not localhost), verifies the artifact's hashes and
exclusions, pins `connect-src` to the API origin (and `img-src` to a hosted `authLogoUrl`), stages the file as `app-config.json`, and
requires the release record for `HEAD` (`--require-release-gate`): a clean tree, and a record
from `bun run release:check` for this exact commit that ran on a clean tree, passed on both
presets and finished at most 7 days ago (`--release-gate-max-age-days`). A `HEAD` that is on no
remote branch only warns: push it so the deployed commit can be found again.
`DEPLOY_SKIP_RELEASE_GATE=1` bypasses only the release-record requirement, loudly. Each deployment gets an `[env.<name>]` in `wrangler.toml` (or
the consumer's own file via `--wrangler-config`) with its custom domain and
`workers_dev = false`; the top level is a workers.dev preview. A host that injects
`window.__OUTLABS_AUTH_UI_CONFIG__` inline must add that script's hash to `script-src`.

Before the first cutover of a deployment, check on the backend:

- CORS allows the console origin exactly (scheme, host, port).
- `frontendProfileKey` names a registered profile whose public origin is the console origin,
  so emailed reset, invite, magic-link and code links point at it.
- OAuth success, error and associate redirect URLs point at the console
  (`/auth/oauth/callback`, `/auth/login`, `/app/account`), the console and the API are
  same-site, and a live OAuth sign-in and account link work.
- A short access-token lifetime session survives a refresh (sign in, wait past expiry, act).

The complete per-deployment checklist is in [PRODUCTION.md](PRODUCTION.md).

### Static preview

The shipped artifact, served locally (a local backend is fine here, never in a deploy):

```bash
bun run generate
node scripts/deploy-preflight.mjs --local --config public/app-config.json
node scripts/serve-static.mjs --dir .output/public --port 3000
```

`bun run preview:static` runs the last two steps with `public/app-config.json` and stops with
a message when that file is missing. Staging a config is required: the production build
ignores `NUXT_PUBLIC_*`, so an artifact without `app-config.json` shows the configuration
error, and the preflight is also what adds the API origin to `connect-src`.

`scripts/serve-static.mjs` applies `_headers` and the `wrangler.toml` asset rules exactly
(Node built-ins only), so a CSP or routing problem shows up locally. `E2E_TARGET=static`
makes Playwright do all three steps with a config built from `E2E_API_BASE_URL`, and
`e2e/static/static-build.spec.ts` fails on any `securitypolicyviolation`, any request to an
origin other than the console and its API, and any icon that renders blank because it is
missing from the client bundle.

## Testing

Playwright is the acceptance gate: `E2E_API_BASE_URL=<backend> bunx playwright test` runs the
suite against a seeded outlabsAuth example, detecting its preset and signing each persona in
once through the API. Targets (dev server or the shipped static build), personas, variables,
cleanup rules, the session-lifecycle lane and release mode are documented in
[`e2e/README.md`](e2e/README.md), the canonical guide; [docs/e2e-coverage.md](docs/e2e-coverage.md)
maps the specs to the capabilities they prove.

## Structure

```
app/
  app.config.ts              # the entire theme (amber / zinc + badge aliases)
  assets/css/main.css        # two @imports, nothing else
  plugins/00.runtime-config.client.ts   # boot: resolve config + hydrate session
  utils/runtime-config.ts    # boot config resolution (Zod; authUi normalization)
  api/client.ts              # the one API client (bearer, 401 refresh)
  api/errors.ts              # the error model (normalizeApiError: kind, code, field issues, copy)
  auth/tokens.ts             # localStorage token storage (only client auth state)
  composables/               # one use<Feature>() per view — ALL feature logic
  queries/<resource>.ts      # Pinia Colada per resource (server state; session/auth-config keys)
  queries/invalidation.ts    # which views each write makes stale (never awaited)
  schemas/<resource>.ts      # Zod per resource/form
  types/                     # domain types, derived from types/api.gen.ts (generated)
  middleware/auth.global.ts  # /app guard (+ /auth/reset-password exemption)
  layouts/default.vue        # dashboard shell (from the template)
  layouts/auth.vue           # unauthenticated shell
  components/app/            # shared compositions (Auth*.vue = the sign-in family)
  pages/                     # /app workspaces + /auth flows
e2e/                         # Playwright — auth (guest) + app (authenticated)
test/unit/                   # Vitest — pure logic, including the lint guardrail fixtures
openapi/                     # checked-in OpenAPI snapshot of the outlabs-auth routes targeted
scripts/                     # release check, deploy preflight, wrapper and account check, CSP hashes, static server, API type generation
cloudflare/                  # the Worker that answers real 404s for missing assets
public/                      # _headers, robots.txt, brand assets, app-config.template.json
wrangler.toml                # Workers static-asset rules and a commented example deployment environment
colada.options.ts            # global Pinia Colada defaults (freshness, transient read retry)
eslint.config.mjs            # lint, including the layer and styling guardrails
eslint-rules/                # the local `console` lint rules (styling)
eslint-fixtures/             # negative fixtures that pin every guardrail rule
docs/                        # security posture, E2E coverage
```

`ARCHITECTURE.md` is the authority on the composable layering (server state = Colada cache;
no per-domain Pinia stores).

## Adding a resource vertical

Copy the **users** vertical — it is the reference: `queries/users.ts` (list query +
mutations that call `invalidateAfter(domain)`), `schemas/user.ts`, the feature composables and
`pages/app/users/`. Follow the definition of done in [AGENTS.md](AGENTS.md).

## Status and resuming work

Active development paused on 2026-10-02 at a releasable state. On 2026-10-03 the console moved
to outlabs-auth 0.1.0a35, the release it now requires, and took up what that release added for
consoles (PRODUCTION.md section 8). Whoever picks it up next starts here.

- **Last release check:** passed twice in a row on 2026-10-03 at the documentation commit after
  `71e0b76` that records it, against the outlabsAuth examples on outlabs-auth 0.1.0a35, both
  presets, Chromium only; the shipped JavaScript is within its budget, 1.3% over the baseline
  where 10% is allowed ([PRODUCTION.md](PRODUCTION.md) section 11). The record (`.release/gate.json`) stays on the
  machine that ran it and is valid for 7 days; any later commit, documentation included, needs
  its own `bun run release:check` before it can deploy.
- **Deployments:** none has cut over and no sign-off is recorded (PRODUCTION.md section 10). A
  deployment still on the earlier React console cuts over with the checklist in PRODUCTION.md
  section 9. This repository keeps the React console only as it was at the initial public
  release (`a4d7e84`); a deployment running a later React build rolls back from that build's own
  source.
- **What works:** [CAPABILITIES.md](CAPABILITIES.md), per backend capability.

Open work, in the order it matters for a first cutover:

1. **Backend changes in outlabsAuth** (PRODUCTION.md section 8). outlabs-auth 0.1.0a35, the
   release the console requires, scopes the entity, membership, permission-check and
   orphaned-account routes and account creation to the admin's organization (DD-061); what is
   still open (write versioning, key status, OAuth navigation, the console-integration guide,
   contract additions) and what 0.1.0a35 added that the console does not use yet are recorded
   there.
2. **Per-deployment checks** (PRODUCTION.md section 9), notably that the deployment's backend
   runs outlabs-auth 0.1.0a35 or later, a live sign-in against it when it is not the release the
   last check ran against, and same-site hosting where OAuth is on.
3. **Open gate items** (PRODUCTION.md section 1): Firefox, WebKit and phone-sized Chromium were
   not run at the last release; one flaky spec was never reproduced.
4. **Not started:** extracting the console as a reusable dashboard starting point.

Decided: light-mode colour contrast (F-032) is a known limitation the owner accepted on
2026-10-02 to keep the stock theme (PRODUCTION.md section 3), and the low-severity console
follow-ups of the 2026-10-02 QA pass are fixed, each with a spec.

To resume: read [AGENTS.md](AGENTS.md); start both seeded example backends
([e2e/README.md](e2e/README.md) "Backends"); run `bun run release:check --enterprise <url>
--simple <url>` on a clean tree to confirm the baseline still passes; then take the next item
above, with a spec for every behaviour change.

## License

MIT, see [LICENSE](LICENSE). Copyright OUTLABS LLC; portions derive from the MIT-licensed Nuxt UI dashboard template, whose notice is retained.
