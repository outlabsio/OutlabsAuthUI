# Browser Testing

This repo uses Playwright for reusable browser automation.

Core pieces:

- `playwright.config.ts`: shared browser config and Bun-powered frontend server bootstrap
- `e2e/support/global-setup.ts`: persona login bootstrap and storage-state generation
- `e2e/support/auth-fixture.ts`: per-test persona fixture
- `e2e/support/base-ui-select.ts`: reusable helper for Base UI `Select` controls
- `e2e/support/base-ui-text.ts`: reusable helper for Base UI text inputs and textareas

## Commands

Run the full suite:

```bash
bun run test:e2e
```

Run the Roles workspace suite only:

```bash
bun run test:e2e:roles
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

## Prerequisites

- frontend app reachable at `http://localhost:3000`
- auth backend reachable at `http://localhost:8004`
- enterprise example seeded with the review personas from:
  - `/Users/macbookm3/Documents/projects/outlabsAuth/examples/enterprise_rbac/reset_test_env.py`

Use `localhost` consistently for both frontend and backend. Mixing `127.0.0.1` and `localhost` will break browser-origin assumptions in the auth flow.

Playwright global setup will:

- verify the frontend and backend are reachable
- log in seeded personas through the backend API
- generate per-persona storage states in `playwright/.auth`

Available seeded personas:

- `admin`
- `orgAdmin`
- `regionalAdmin`
- `officeAdmin`
- `auditor`
- `teamLead`
- `agent`
- `commercialAgent`

Example:

```ts
import { expect, test } from '../support/auth-fixture'

test.use({ persona: 'regionalAdmin' })
```

## Environment overrides

```bash
E2E_BASE_URL=http://localhost:3001
E2E_API_BASE_URL=http://localhost:8005
```

These can be used when the frontend or backend run on non-default ports.

## Authoring Guidance

- Prefer accessible roles and labels first.
- For Base UI text inputs and textareas, use `typeIntoBaseUiField(...)` instead of `fill()`.
- For Base UI select controls, use `selectBaseUiOption(...)` instead of brittle button-text selectors.
- Keep persona setup in `test.use(...)` rather than re-implementing login in specs.
- Start new feature suites under `e2e/<feature>/`.
- Prefer reversible mutations in seeded data: edit-and-restore beats one-way destructive setup.
