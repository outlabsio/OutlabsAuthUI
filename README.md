# OutlabsAuthUI

OutlabsAuthUI is a SPA frontend for OutlabsAuth built with Vite, React, TypeScript, Tailwind, shadcn/ui, TanStack Router, TanStack Query, Zustand, and Bun.

## API Key Workspaces

- `/app/api-keys` is the auth-owned self-service workspace for `personal` API keys.
- `/app/users/api-keys` is the EnterpriseRBAC admin workspace for `system_integration` keys, integration principals, and entity inventory.
- Both surfaces talk directly to mounted OutlabsAuth routes. The UI does not rely on host-owned auth wrappers for API-key management.

## Docs

- Docs index: [`docs/README.md`](./docs/README.md)
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
