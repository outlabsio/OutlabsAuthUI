# Browser Testing

This repo uses Playwright for reusable browser automation.

Core pieces:

- `playwright.config.ts`: shared browser config and Bun-powered frontend server bootstrap
- `e2e/support/global-setup.ts`: backend reset, persona login bootstrap, and storage-state generation
- `e2e/support/auth-fixture.ts`: per-test persona fixture
- `e2e/support/reset-backend.ts`: reusable backend reseed entrypoint for deterministic runs
- `e2e/support/base-ui-select.ts`: reusable helper for Base UI `Select` controls
- `e2e/support/base-ui-text.ts`: reusable helper for Base UI text inputs and textareas
- `docs/testing/e2e-coverage.md`: current coverage matrix for enterprise and diverse fixtures

## Commands

Run the full suite:

```bash
bun run test:e2e
```

Run just the backend reseed:

```bash
bun run test:e2e:reset-backend
```

Run the auth flow suite only:

```bash
bun run test:e2e:auth
```

Run the app-shell and app access-control suites:

```bash
bun run test:e2e:app
```

Run the Roles workspace suite only:

```bash
bun run test:e2e:roles
```

Run the Permissions workspace suite only:

```bash
bun run test:e2e:permissions
```

Run the Users workspace suite only:

```bash
bun run test:e2e:users
```

Run the Entities workspace suite only:

```bash
bun run test:e2e:entities
```

Run headed:

```bash
bun run test:e2e:headed
```

Open the Playwright UI runner:

```bash
bun run test:e2e:ui
```

Run without resetting backend data first:

```bash
bun run test:e2e:no-reset
```

## Prerequisites

- frontend app reachable at `http://localhost:3000`
- auth backend reachable at `http://localhost:8004`
- `uv` available on `PATH` so the reset runner can reseed the backend example
- backend reset script available at:
  - `/Users/macbookm3/Documents/projects/outlabsAuth/examples/enterprise_rbac/reset_test_env.py`

Use `localhost` consistently for both frontend and backend. Mixing `127.0.0.1` and `localhost` will break browser-origin assumptions in the auth flow.

Playwright global setup will, by default:

- verify the frontend and backend are reachable
- reset the backend to the seeded review fixture
- log in seeded personas through the backend API
- generate per-persona storage states in `playwright/.auth`

This reset is important because the browser suite now intentionally exercises additive mutations like invites, temporary roles, and ABAC edits.

Available seeded personas:

- `admin`
- `orgAdmin`
- `permissionAdmin`
- `regionalAdmin`
- `officeAdmin`
- `eastAdmin`
- `auditor`
- `teamLead`
- `agent`
- `commercialAgent`
- `summitAdmin`

Example:

```ts
import { expect, test } from '../support/auth-fixture'

test.use({ persona: 'regionalAdmin' })
```

## Environment overrides

```bash
E2E_BASE_URL=http://localhost:3001
E2E_API_BASE_URL=http://localhost:8005
E2E_AUTH_API_PREFIX=/iam
E2E_RESET_BACKEND=0
E2E_PERSONAS=admin
E2E_ADMIN_EMAIL=admin@demo.com
E2E_ADMIN_PASSWORD=DiverseDemo123
E2E_BACKEND_REPO_DIR=/path/to/outlabsAuth
E2E_BACKEND_RESET_SCRIPT=/path/to/reset_test_env.py
```

These can be used when the frontend or backend run on non-default ports.

- `E2E_RESET_BACKEND=0` skips the automatic reseed step.
- `E2E_AUTH_API_PREFIX` points Playwright login/bootstrap calls at a non-default
  auth mount such as `/iam`.
- `E2E_PERSONAS` limits storage-state bootstrap to a comma-delimited subset such
  as `admin` when running against a live backend that does not have the full
  seeded enterprise persona set.
- `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` override the default admin persona
  credentials used for login bootstrap and local login-page hints.
- `E2E_BACKEND_REPO_DIR` overrides the backend repo root used for reseeding.
- `E2E_BACKEND_RESET_SCRIPT` overrides the exact reset script path.

Example: run the targeted Diverse local entity-discovery spec against the
mounted `/iam` auth backend without resetting data:

```bash
E2E_RESET_BACKEND=0 \
E2E_PERSONAS=admin \
E2E_ADMIN_EMAIL=admin@demo.com \
E2E_ADMIN_PASSWORD=DiverseDemo123 \
E2E_API_BASE_URL=http://localhost:8010 \
E2E_AUTH_API_PREFIX=/iam \
bunx playwright test e2e/entities/entities-diverse-discovery.spec.ts
```

## Authoring Guidance

- Prefer accessible roles and labels first.
- For Base UI text inputs and textareas, use `typeIntoBaseUiField(...)` instead of `fill()`.
- For Base UI select controls, use `selectBaseUiOption(...)` instead of brittle button-text selectors.
- Keep persona setup in `test.use(...)` rather than re-implementing login in specs.
- Start new feature suites under `e2e/<feature>/`.
- Prefer reversible mutations in seeded data: edit-and-restore beats one-way destructive setup.
