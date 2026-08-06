# OutlabsAuthUI — Nuxt port

Port of the React/Vite/shadcn admin console to **Nuxt 4 + Nuxt UI v4**, and the eventual
Outlabs dashboard **reference implementation**. Started from the official
[`nuxt-ui-templates/dashboard`](https://github.com/nuxt-ui-templates/dashboard) template.

Lives in the `nuxt/` subfolder on the `nuxt` branch alongside the React app (the parity
reference) until the P4 cutover. Plan of record: `OutlabsAuthUI Nuxt Port Plan` in the vault.

## Non-negotiables

1. **Full E2E testing** — Playwright, React suites carried over as the behavioral spec. Parity is the acceptance gate.
2. **Pinia** for client state only.
3. **Pinia Colada** for all server state (queries + mutations). Never cache API data in a Pinia store.
4. **Vanilla Nuxt UI, no custom styling** — semantic colors only, **primary = amber**. Theme is the two lines in `app/app.config.ts`; `app/assets/css/main.css` is only its two `@import`s.
5. **Zod + stock UForm** — `UForm` + Zod via Standard Schema, default validation behavior.

## Stack

Nuxt 4 (`ssr: false`, static SPA) · @nuxt/ui v4 · Pinia · @pinia/colada · Zod 4 · Bun · Playwright · Wrangler → Cloudflare Workers.

## Runtime-targeted backend (A1)

One build, any backend. On boot, `app/plugins/00.runtime-config.client.ts` resolves the API
target from `public/app-config.json` (per-deployment, untracked) merged with `NUXT_PUBLIC_*`
env and an optional inline global, validated with Zod (`app/utils/runtime-config.ts`).
Production fails hard on invalid config; dev falls back to `localhost:8004` `/v1`. Capabilities
are then discovered from the mounted backend's `/auth/config`, and the UI adapts.

Copy `public/app-config.template.json` → `public/app-config.json` to point at a backend, or
set `NUXT_PUBLIC_API_BASE_URL` / `NUXT_PUBLIC_AUTH_API_PREFIX` (see `.env.example`).

## Commands

```bash
bun install
bun run dev          # http://localhost:3000
bun run typecheck    # nuxt typecheck (vue-tsc)
bun run lint         # eslint
bun run generate     # static SPA → .output/public
bun run test:e2e     # Playwright (guest smoke runs with no backend)
```

E2E backend: set `E2E_API_BASE_URL` (+ `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`) to a
disposable outlabsAuth instance to run the seeded, authenticated suites. Without it, the
guest render/validation smoke still runs; backend-gated specs self-skip.

## Structure

```
app/
  app.config.ts              # the entire theme (amber / zinc)
  assets/css/main.css        # two @imports, nothing else
  plugins/00.runtime-config.client.ts   # boot: resolve config + hydrate session
  utils/runtime-config.ts    # A1 config resolution (Zod)
  utils/api.ts               # the one API client (bearer, 401 refresh, errors)
  utils/auth-token.ts        # localStorage token storage
  stores/session.ts, ui.ts   # the two Pinia stores (A3)
  queries/<resource>.ts      # Pinia Colada per resource (users = reference)
  schemas/<resource>.ts      # Zod per resource/form
  types/                     # wire types
  middleware/auth.global.ts  # /app guard
  layouts/default.vue        # dashboard shell (from the template)
  layouts/auth.vue           # unauthenticated shell
  pages/                     # mirrors the React route tree
e2e/                         # Playwright — auth (guest) + app (authenticated)
```

## Adding a resource vertical (P2)

Copy the **users** vertical — it is the reference: `queries/users.ts` (list query +
mutations that invalidate the resource root key), `schemas/user.ts`, `pages/app/users/`. Each
vertical is one PR and does not start until the previous suite is green.

## Port status

- **P0 — spec freeze**: done (React route tree + E2E suite inventoried; contract ported).
- **P1 — scaffold**: done. Boots, amber vanilla Nuxt UI, runtime-config + capability boot,
  api client, two Pinia stores, users vertical, auth guard, Playwright skeleton. typecheck +
  lint + guest E2E green. Login/logout E2E pending a seeded backend.
- **P2 — resource verticals**: next (users done as the pattern; roles → permissions →
  api-keys → entities → settings → account are stubs).
- P3 parity close · P4 Cloudflare cutover · P5 extract boilerplate — see the vault plan.
