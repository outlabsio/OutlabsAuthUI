# OutlabsAuthUI

OutlabsAuthUI is a SPA frontend for OutlabsAuth built with Vite, React, TypeScript, Tailwind, shadcn/ui, TanStack Router, TanStack Query, Zustand, and Bun.

## Strategy

This repo is a shared auth admin console. Consumer-specific backend targets, branding, and deployment names should not be committed here.

- The backend target is selected by runtime config first, then Vite env fallback.
- Backend capabilities still come from the mounted auth API itself through `/auth/config`.
- Project-specific `app-config.json` files stay untracked or live in private deployment infrastructure.

## Local Development

Install dependencies:

```bash
bun install
```

For local runtime config, copy the template to an untracked file and edit it for the backend you want to target:

```bash
cp public/app-config.template.json public/app-config.json
```

Then run the app:

```bash
bun run dev
```

Config precedence is:

1. `window.__OUTLABS_AUTH_UI_CONFIG__`
2. `/app-config.json`
3. Vite env vars such as `VITE_API_BASE_URL` and `VITE_AUTH_API_PREFIX`
4. built-in localhost defaults

Runtime config file shape:

```json
{
  "apiBaseUrl": "http://localhost:8050",
  "authApiPrefix": "/iam",
  "appName": "OutlabsAuth UI",
  "appSubtitle": "Shared auth admin console",
  "authBrand": "OutlabsAuth",
  "signInDescription": "Sign in against the configured auth backend to access this console."
}
```

## Deployment

Build the app:

```bash
bun run build
```

If you deploy to Cloudflare Workers, the repo now expects a generic `wrangler.toml`:

```bash
bun run deploy:cloudflare
```

The preferred deployment model is to publish one generic build and provide `app-config.json` at deploy time, instead of creating committed project-specific build presets in this repo.

## API Key Workspaces

- `/app/api-keys` is the auth-owned self-service workspace for `personal` API keys.
- `/app/users/api-keys` is the EnterpriseRBAC admin workspace for `system_integration` keys, integration principals, and entity inventory.
- Both surfaces talk directly to mounted OutlabsAuth routes. The UI does not rely on host-owned auth wrappers for API-key management.

## Docs

- Docs index: [`docs/README.md`](./docs/README.md)
- Runtime configuration: [`docs/runtime-configuration.md`](./docs/runtime-configuration.md)
- Project rules index: [`docs/rules/README.md`](./docs/rules/README.md)
- Progress index: [`docs/progress/README.md`](./docs/progress/README.md)
- Agent instructions: [`agents.md`](./agents.md)

## Rule Sets

- Architecture: [`docs/rules/architecture.md`](./docs/rules/architecture.md)
- Frontend structure: [`docs/rules/frontend_structure.md`](./docs/rules/frontend_structure.md)
- Naming conventions: [`docs/rules/naming_conventions.md`](./docs/rules/naming_conventions.md)
- State rules: [`docs/rules/state_rules.md`](./docs/rules/state_rules.md)
- Component rules: [`docs/rules/component_rules.md`](./docs/rules/component_rules.md)
- API integration rules: [`docs/rules/api_integration_rules.md`](./docs/rules/api_integration_rules.md)
- Query rules: [`docs/rules/query_rules.md`](./docs/rules/query_rules.md)
- Form rules: [`docs/rules/form_rules.md`](./docs/rules/form_rules.md)
- Styling rules: [`docs/rules/styling_rules.md`](./docs/rules/styling_rules.md)
- Routing rules: [`docs/rules/routing_rules.md`](./docs/rules/routing_rules.md)
- Baseline architecture reference: [`docs/rules/spa_frontend_architecture_baseline.md`](./docs/rules/spa_frontend_architecture_baseline.md)
