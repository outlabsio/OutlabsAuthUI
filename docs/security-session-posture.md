# Security & Session Posture (ADR)

## Status

Accepted. This is the production baseline posture for `OutlabsAuthUI` as a
**sidecar SPA** that can be mounted in front of any `outlabsAuth`-compatible
backend, frequently on a different origin than the API.

## Context

`OutlabsAuthUI` is a Vite/React SPA only. It has no server runtime of its own,
so it cannot issue or read same-site cookies on behalf of a backend that lives
on a different origin. Backends are mounted independently and may be deployed
on entirely different hosts/ports than the console (see
[`runtime-configuration.md`](./runtime-configuration.md) and
[`auth-config-layers.md`](./auth-config-layers.md)).

## Decision: cross-origin bearer exception

This SPA uses a **cross-origin bearer token exception** instead of the
preferred same-site `HttpOnly` cookie session model:

- Access and refresh tokens are stored in `window.localStorage`, owned
  exclusively by [`src/lib/api/auth-token.ts`](../src/lib/api/auth-token.ts).
  No other module reads or writes those storage keys directly.
- The access token is short-lived. It is attached as an `Authorization:
  Bearer <token>` header by [`src/lib/api/client.ts`](../src/lib/api/client.ts)
  on every authenticated request.
- On a `401`, the client refreshes the session through a **single-flight**
  refresh (`refreshAccessTokenOnce` in `lib/api/client.ts`): concurrent 401s
  share one in-flight `POST /auth/refresh` call instead of firing a refresh
  storm, and the original request is retried exactly once with the new
  access token.
- If refresh fails (or there is no stored refresh token), the client clears
  storage and emits `outlabs-auth:session-expired`
  (`src/lib/api/auth-session.ts`), which the router provider listens for to
  redirect to `/auth/login` and clear the Query cache.
- Multi-tab logout/expiry is propagated via the `storage` event on the same
  keys (`isAuthTokenStorageKey`), not a custom broadcast channel.

### Why not the preferred cookie profile (yet)

The preferred posture — same-site, `HttpOnly`, `Secure`, `SameSite=Strict`
(or `Lax`) session cookies set by the backend — is explicitly **out of scope
for this baseline** wherever a mount puts the UI and the API on different
origins/eTLDs. That profile requires either:

- a shared parent domain (e.g. `app.example.com` + `api.example.com`) plus
  `SameSite=None; Secure` cookies with CORS credentials, or
- the SPA being served by the same origin as the API (reverse proxy /
  same-domain deployment).

Neither is guaranteed for a generic sidecar console that any `outlabsAuth`
consumer can point at their own backend URL. Adopting cookie sessions is a
**future decision**, not a rejection — it should be revisited per-mount once
a consumer can guarantee same-site hosting, and it would let that specific
deployment drop localStorage tokens entirely. Until then, the bearer
exception is the documented, intentional trade-off, not an oversight.

### Accepted risk and mitigations

Storing bearer tokens in `localStorage` is XSS-exposed: any script that runs
in the page can read the tokens. We accept this risk for the cross-origin
case and mitigate it by:

- keeping the access token short-lived so a stolen token has a small window,
- never rendering unsanitized third-party HTML/markdown from backend data,
- restricting `script-src` via CSP (see below) to reduce injectable script
  surface,
- scoping all token reads/writes to one module (`auth-token.ts`) so a future
  migration to cookies only touches one file plus the client's auth header
  logic.

## Required hosting headers

Because this is a static SPA, security headers must be set by the **hosting
layer** (CDN / edge worker / reverse proxy), not by application code. Any
deployment of this build must send:

| Header | Value | Why |
| --- | --- | --- |
| `Content-Security-Policy` | see below | restrict script/style/connect origins |
| `X-Content-Type-Options` | `nosniff` | stop MIME-sniffing of static assets |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | avoid leaking full URLs to third parties |
| `X-Frame-Options` | `DENY` (belt-and-suspenders with `frame-ancestors`) | legacy clickjacking protection |
| `Permissions-Policy` | disable unused capabilities (camera/microphone/geolocation at minimum) | reduce API attack surface |

### CSP baseline

```txt
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self' data:;
connect-src 'self' <your-api-origin>;
frame-ancestors 'none';
object-src 'none';
base-uri 'self';
form-action 'self';
```

Non-negotiable directives for every mount:

- `frame-ancestors 'none'` — this console must never be embeddable in a
  frame (clickjacking).
- `object-src 'none'` — no plugin content.
- `base-uri 'self'` — stop base-tag injection redirecting relative URLs.
- `form-action 'self'` — forms may only submit back to this origin.

`connect-src` is the one directive that **cannot ship as a fixed default**:
`apiBaseUrl` is resolved at runtime (see `runtime-configuration.md`) so the
backend origin is not known at build time. The shipped
[`public/_headers`](../public/_headers) file ships a permissive
`connect-src *` as a generic starting point; **every real deployment should
override `_headers` (or the equivalent host header config) to pin
`connect-src` to its actual configured `apiBaseUrl`** once that is known.
`style-src 'unsafe-inline'` is required today because Tailwind/shadcn inject
some inline styles at runtime; tightening this later would need a nonce or
hash strategy.

### Cloudflare Workers static assets

`wrangler.toml` deploys this build as Workers static assets
(`[assets] directory = "dist"`, no user Worker script). Cloudflare natively
reads a `_headers` file from the asset directory and applies it to every
static asset response — see
[`public/_headers`](../public/_headers). Because there is no Worker script
in front of the assets, these headers apply to all responses without extra
wiring. If a future deployment adds `run_worker_first` or a custom Worker,
that Worker becomes responsible for re-attaching these headers itself
(Cloudflare does not apply `_headers` to Worker-generated responses).

## SPA route guards are UX only

`src/app/router/routes/app.tsx` (and the workspace-level guard in
`src/app/router/workspace-route-guard.ts`) redirect unauthenticated or
unauthorized users away from protected routes. These guards exist purely to
give a good user experience (no flash of protected UI, no dead-end screens)
— **they are not a security boundary**. They run entirely in the browser and
can be bypassed by anyone who controls their own client.

The backend (`outlabsAuth`) is the only authorization boundary. Every
protected endpoint must independently verify the bearer token and enforce
RBAC/ABAC server-side regardless of what the SPA router allows the user to
navigate to. If the frontend ever renders data before the backend has
confirmed the caller is allowed to see it, that is a backend bug, not a
router bug.

## Review checklist for future changes

Before changing anything in this area, confirm:

- token storage still lives only in `auth-token.ts`
- refresh is still single-flight in `client.ts` (no per-request refresh races)
- `401` still triggers `expireAuthSession()` exactly once per expiry, not a
  retry loop
- any new hosting target ships the headers table above (adapt the mechanism,
  keep the directives)
- no route guard is ever treated as sufficient authorization by itself
