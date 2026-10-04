# Security and session posture (ADR)

## Status

Accepted. It carries the bearer-token decision of the former React console over to this
console's code paths and adds what this build does differently: a hash-based
Content-Security-Policy, deployment-pinned `connect-src`, and the hosting constraints below.

## Context

The console is a static single-page app (`ssr: false`, `nitro.preset: 'static'`). It has no
server runtime, so it cannot hold an `HttpOnly` session cookie on behalf of the API. One build
serves any outlabsAuth backend, often on another origin than the console. The backend is the
only authorization boundary.

## Decision: bearer tokens in browser storage

- Access and refresh tokens live in `localStorage`, owned by `app/auth/tokens.ts`; nothing
  else reads or writes those keys. Sign-in steps and post-sign-in destinations use
  `sessionStorage` (this tab only).
- `app/api/client.ts` sends `Authorization: Bearer <access token>` on every authenticated
  request. Requests time out after 15 seconds.
- A 401 that refuses the bearer token is renewed once through `/auth/refresh` and replayed.
  Renewals are single-flight per tab and serialized across tabs (`app/auth/refresh-lock.ts`,
  Web Locks with a `localStorage` lease fallback), because the backend revokes every session
  when a rotated refresh token is presented twice.
- Only a refused refresh ends a session (`endSession(reason)`); network failures, timeouts and
  5xx keep the tokens and offer Retry. Other tabs follow sign-in, sign-out and identity
  changes through the `storage` event (`app/plugins/01.session-sync.client.ts`). A tab never
  replays a refused request with another account's token, and reloads into a new identity
  without a prompt the user could cancel.
- Sign-out clears local state first, then revokes the session on the server in the background.

ARCHITECTURE.md, "Session lifecycle", is the detailed protocol.

### Why not cookie sessions

A same-site `HttpOnly`, `Secure`, `SameSite` session cookie set by the API is the stronger
model, but a generic console cannot assume the API shares its site or sits behind the same
origin. Cookie sessions stay a future, per-deployment option for deployments that can
guarantee same-site hosting; adopting them would touch `app/auth/tokens.ts` and the client's
auth header only.

### Accepted risk and mitigations

Any script running in the page can read `localStorage`, so an XSS bug exposes the tokens. The
mitigations:

- **No inline script execution.** `script-src` allows `'self'` and the SHA-256 hashes of the
  generated HTML's own inline scripts; never `'unsafe-inline'` or `'unsafe-eval'` (below).
- **No HTML rendering of API data.** Vue's text interpolation escapes everything; `v-html` is
  not used on backend data.
- **No third-party origins.** Icons are bundled (no runtime icon API), fonts and images are
  same-origin or the deployment's own logo host, and there is no analytics or error-reporting
  script (owner decision). OAuth provider pictures (`avatar_url`) are never loaded: the console
  binds an avatar only for a same-origin or `data:` URL (`app/utils/avatar.ts`) and otherwise
  shows the provider's icon (Connected accounts) or the initials (Users). Keep it that way rather
  than widening `img-src`; `e2e/static/static-build.spec.ts` fails on the violation.
- **Short-lived access tokens.** Recommended for console deployments: an access-token lifetime
  of 15 minutes or less (the library default is 15) and refresh-token rotation with reuse
  detection (the library default). Shorten the refresh-token lifetime (default 30 days) for
  high-privilege consoles; the console renews transparently either way.
- **One-time secrets are not kept.** API-key secrets are shown once in `AppSecretReveal`, and
  `useSecretMutation` evicts the response from the mutation cache. Audit payloads and exports
  redact secret-like fields (`utils/audit-redaction.ts`).

### OAuth callback: no session swapping

The provider hands the session back in the fragment of `/auth/oauth/callback`, and anyone with
an account can link a signed-out browser to that page with a token pair of their own (login
CSRF). The backend's state cookie protects the provider round trip, not this hand-off. So the
sign-in and signup pages write a one-time nonce and timestamp to `sessionStorage` right before
the provider redirect (`app/auth/pending-oauth.ts`), and the callback consumes it in the same
synchronous step that strips the fragment, before any request. Without a marker from the last
20 minutes (long enough for the provider's own MFA) the callback revokes the presented pair,
stores nothing and shows an inline error. An `oauth_error` landing drops the marker. Linking a
provider from Account returns no tokens and sets no marker; a failed link returns to Account with
`?link_error=<code>&provider=<name>`, which carries no secret, is removed from the address at
once, and names the provider only when it reads as a provider key, so a crafted link cannot put
its own words into the message. Proven by `e2e/app/session-lifecycle.spec.ts`,
`e2e/auth/sign-in-steps.spec.ts`, `e2e/account/social-accounts.spec.ts` and
`test/unit/auth-messages.test.ts`.

## Headers

Static hosting sets every header; the application cannot. `public/_headers` (copied into
`.output/public/_headers` by `nuxt generate`) is the source, applied by Cloudflare Workers
static assets and reproduced by `scripts/serve-static.mjs` for local previews and the static
E2E target.

| Header | Value | Why |
|---|---|---|
| `Content-Security-Policy` | see below | restrict where scripts, styles, images and requests may come from |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | HTTPS only |
| `X-Content-Type-Options` | `nosniff` | no MIME sniffing of assets |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | no full URLs (record ids, filters) to other origins |
| `X-Frame-Options` | `DENY` | legacy clickjacking protection, with `frame-ancestors 'none'` |
| `Cross-Origin-Opener-Policy` | `same-origin` | no window references from other origins |
| `X-Robots-Tag` | `noindex, nofollow` | an admin console is never indexed (`robots.txt` disallows all too) |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | unused browser capabilities off |
| `Cache-Control` | `public, max-age=0, must-revalidate, no-transform` for HTML pages, the SPA fallback, redirects and public files; `public, max-age=31536000, immutable` for `/_nuxt/*`; `no-cache, no-transform` for `/_nuxt/builds/*` and `/app-config.json` | pages, manifests and config revalidate, hashed assets cache forever; `no-transform` keeps the edge from rewriting responses ("Edge rewriting", below) |

Responses produced by the Worker in `cloudflare/not-found-worker.js` (404s for missing assets)
do not get `_headers`; they carry no HTML and set `Cache-Control: no-store, no-transform`
themselves.

Rules apply top to bottom, and a header that two matching rules set is joined with `, `: had
`/_nuxt/*` simply set its own `Cache-Control`, a chunk would get `public, max-age=0,
must-revalidate, no-transform, public, max-age=31536000, immutable`. Every rule after `/*` that
sets `Cache-Control` therefore starts with `! Cache-Control`, which removes the earlier value.
`test/unit/static-site.test.ts` ("the shipped public/_headers") and
`e2e/static/static-build.spec.ts` assert exactly one value per class.

### Content-Security-Policy: how it is built

```text
default-src 'self'; script-src 'self' 'sha256-…'; style-src 'self' 'unsafe-inline';
img-src 'self' data: <logo origin>; font-src 'self' data:; connect-src 'self' <API origin>;
frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'
```

1. `public/_headers` ships a fail-closed policy: `script-src 'self'` and `connect-src 'self'`.
   An artifact that skipped the next steps renders nothing and reaches no API.
2. `bun run generate` runs `scripts/csp-hashes.mjs`: it hashes every inline script in the
   generated HTML (import map, colour-mode bootstrap, runtime-config global, the Zod jitless
   setting) into `script-src`, removes files that must not ship (`200.html`, `404.html`, the
   config template, any local `app-config.json`) and fails the build if build-time deployment
   values leaked into the HTML or if `script-src` contains `'unsafe-inline'` or
   `'unsafe-eval'`.
3. The deploy preflight (`scripts/deploy-preflight.mjs`) validates the deployment's
   `app-config.json` with the console's production rules (an `https` API that is not
   localhost), verifies the hashes, pins `connect-src` to the console plus the API origin and
   adds a hosted logo's origin to `img-src`, then stages the config.

`style-src 'unsafe-inline'` stays: Vue style bindings and the positioning of Nuxt UI popovers,
menus and tooltips (Reka UI / Floating UI) write inline styles at runtime. Style injection
cannot run script; tightening it would need nonces, which a static host cannot issue.

A host that injects `window.__OUTLABS_AUTH_UI_CONFIG__` inline must add that script's hash to
`script-src`. The static E2E target (`e2e/static/static-build.spec.ts`) fails on any
`securitypolicyviolation`, any request to a third origin and any icon missing from the bundle.

### Edge rewriting

A Cloudflare zone can rewrite the HTML it serves. Web Analytics, enabled on the zone with its
automatic setup (the default for a proxied site), injects its beacon,
`<script src="https://static.cloudflareinsights.com/beacon.min.js/…">`, which the hashed
`script-src` blocks, as it should: every page load logs a CSP violation. E-mail obfuscation and
JavaScript detections inject scripts of their own, and Rocket Loader rewrites the page's scripts
and loads them itself. Allowing such scripts is not an option (a third-party origin, or
`'unsafe-inline'`), and only the bytes the console ships are the ones its hashes and the static
E2E target have verified. The zone's settings are outside this repository: they belong to
whoever runs the zone and can change at any time.

Cloudflare documents that Web Analytics (no beacon), e-mail obfuscation, JavaScript detections,
Polish and compression leave a response alone when its `Cache-Control` includes
`no-transform`. So every response the console serves carries it, except the content-hashed
`/_nuxt/*` chunks: the rewriting features change HTML (Polish, images), not scripts and
stylesheets, so on the chunks `no-transform` would only turn off edge compression, for the bulk
of the bytes. With it, the boot of `/auth/login` would transfer about 1.4 MB of JavaScript and
CSS instead of about 0.36 MB with Brotli. The HTML pages give up compression (about 8.6 KB each instead of about 2 KB), the cost
of serving them unmodified. Rocket Loader is not documented to honour `no-transform` and, by
Cloudflare's own account, needs a CSP changed for it, so a zone serving the console keeps it
off. Each deployment checks on its live host that the HTML arrives without an injected script
(PRODUCTION.md section 9).

## Hosting constraints

- **Root of a hostname.** The console is built for `baseURL` `/` and boots from
  `/app-config.json`; serving it under a sub-path is not supported.
- **CORS.** The API must allow the console's exact origin with credentials, should send
  `Access-Control-Max-Age` (for example `600`; every authenticated call is preflighted) and
  should expose `Retry-After` so rate-limited requests can say how long to wait.
- **Same-site for OAuth.** OAuth sign-in and account linking need the console and the API on
  the same site (one registrable domain, for example `console.example.com` and
  `auth.example.com`). The console fetches the provider's authorize URL from the API with
  credentials; the API answers with a `SameSite=Lax` state cookie that its callback requires.
  Browsers do not store a `SameSite=Lax` cookie from a cross-site `fetch` response, so with the
  console and the API on different sites every OAuth attempt ends in `invalid_state`. This is
  inferred from the cookie attributes and browser rules, not reproduced against a live
  provider: every deployment that enables OAuth runs one live sign-in and one account link
  before cutover (PRODUCTION.md). A backend authorize variant reached by top-level navigation
  would remove the constraint (backend change).
- **`frontendProfileKey`** must name a profile the backend registers, whose public origin is
  the console, so e-mailed links point at the console and sessions are bound to it.

## Route guards are not security

`app/middleware/auth.global.ts`, the navigation filter and every hidden or disabled button are
user experience. They run in the browser and anyone can bypass them. The backend must check
every request. outlabs-auth 0.1.0a35, the release the console requires, scopes the entity and
membership routes and account creation to the admin's organization; wherever the console still
limits a delegated admin and the backend does not (CAPABILITIES.md, PRODUCTION.md section 8),
the gap is a backend defect, not a console guarantee.

## Review checklist for changes in this area

- Token storage stays in `app/auth/tokens.ts`; no new code reads the token keys.
- Renewal stays single-flight and serialized across tabs; only a refused refresh ends a
  session.
- No `'unsafe-inline'` or `'unsafe-eval'` in `script-src`; any new inline script is generated
  by Nuxt and hashed, and `bun run generate` and the static E2E target stay green.
- No new third-party origin (fonts, icons, scripts, analytics) without updating this document
  and the CSP.
- New hosting targets ship the header table above, including `no-transform` on everything but
  the hashed chunks. A new `_headers` rule that sets `Cache-Control` starts with
  `! Cache-Control`.
- No `v-html` on API data; secrets are never cached or logged.
