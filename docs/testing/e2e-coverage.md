# E2E Coverage Matrix

This document tracks the browser coverage we expect from Playwright against the
seeded auth fixtures.

The goal is not to list every assertion line-by-line. The goal is to make sure
the suite covers:

- CRUD flows for the major workspaces
- destructive actions and recovery paths
- scoped access restrictions across personas
- canonical navigation between related workspaces
- enterprise fixture behavior and mounted-backend behavior separately

## Enterprise Fixture Coverage

These suites target the seeded Enterprise RBAC example at `http://localhost:8004`
with auth routes under `/v1`.

### Workspace coverage

- `e2e/auth/auth-flow.spec.ts`
  - login flow
  - passwordless magic-link and access-code flows (mocked UI + live fixture capture)
  - auth bootstrap and route transitions
- `e2e/auth/oauth-flow.spec.ts`
  - invite-only `oauth_error` banner on login
  - Continue with Google via mocked authorize → hash callback session finalize
  - oauth callback recovery when tokens are missing
  - opt-in live Google authorize boundary (`E2E_LIVE_GOOGLE=1`; backend must mount Google credentials; does not automate Google account UI)
- `e2e/app/app-shell.spec.ts`
  - shell layout and persistent navigation
  - sign-out calls `POST /auth/logout` (204) and clears protected-route access
- `e2e/app/workspace-pagination.spec.ts`
  - Users list Next/Previous after seeding enough rows for page 2
  - Audit pagination chrome present; Roles/Permissions workspace loads
- `e2e/app/access-control.spec.ts`
  - low-privilege operational-user access boundaries across dashboard, account, API keys, users, roles, permissions, and entities
- `e2e/account/account-workspace.spec.ts`
  - self profile update
  - password validation
  - Link Google via mocked associate authorize → `?linked=google` toast + URL cleanup
  - live WhatsApp phone verify via `/dev/auth/phone-verify/latest`
- `e2e/audit/audit-workspace.spec.ts`
  - open Audit workspace (toolbar shell + page guide)
  - filter by actor user ID + Reset
  - date-range filters via URL deep-link (`occurred_from` / `occurred_to`)
  - deep-link prefills `entityId` / `subjectUserId` / `actorUserId` from search params
  - clickable actor/subject/entity IDs on event cards apply Audit filters
  - expandable event details (before/after/metadata/context)
  - empty state for unknown actor
- `e2e/api-keys/api-keys-workspace.spec.ts`
  - create
  - edit lifecycle
  - rotate
  - revoke
- `e2e/api-keys/api-keys-persona-access.spec.ts`
  - auditor and low-privilege denial of system/integration API key management
  - scoped persona boundaries for entity vs platform principals
- `e2e/settings/settings-workspace.spec.ts`
  - entity type defaults update
  - read-only auditor cannot mutate settings
- `e2e/permissions/permissions-workspace.spec.ts`
  - inspect system and custom permissions
  - create/edit/delete custom permissions
  - create/edit/delete permission ABAC artifacts
  - permission-admin scoped mutation coverage
- `e2e/roles/roles-workspace.spec.ts`
  - inspect seeded role types
  - create/edit/delete root-scoped roles
  - create/edit/delete role ABAC artifacts
  - scoped admin role restrictions
  - read-only auditor coverage
- `e2e/users/users-workspace.spec.ts`
  - inspect and update profile details
  - invite and resend invite
  - live invite-accept via `/dev/auth/invite/latest` fixture capture
  - opt-in live Mailgun invite acceptance (`E2E_LIVE_MAIL=1`) then accept-invite
  - admin create-user with password
  - direct account role assignment/removal
  - orphaned users discovery after membership revoke
  - entity-context permission check on user details
  - History → Open in Audit (`subjectUserId`) and Open as actor (`actorUserId`)
  - retained delete and restore
  - read-only auditor coverage
  - read-only team-lead coverage with invite/create gating
- `e2e/entities/entities-workspace.spec.ts`
  - create root and nested child entities with constrained child types
  - validate lifecycle and governance inputs
  - edit entity details
  - archive root entities via soft-delete
  - move children to a new parent
  - switch root scope
  - create entity-scoped role from entity context
  - invite members from entity context
  - add a seeded user to a newly created child entity and manage that membership from the canonical user workspace
  - root-scoped and second-root persona isolation
  - east-admin read-only entity and membership boundaries inside the ACME root
  - selectors match current Base UI controls (Status toggle group, child-class checkboxes, locale-aware calendar caption)
  - entity Activity tab loads `entity_id` audit events and deep-links into Audit

### Persona coverage

- `admin`
  - full CRUD across roles, permissions, users, API keys, and entities
- `permissionAdmin`
  - permission catalog mutation without superuser powers
- `regionalAdmin`
  - scoped role-management restrictions
- `orgAdmin`
  - root-locked entity scope
- `eastAdmin`
  - ACME-root entity visibility with read-only structure and membership boundaries
- `summitAdmin`
  - second-root isolation
- `auditor`
  - read-only roles, users, settings, and API-key workspace denial
- `teamLead`
  - users workspace read-only access without invite or mutation controls
- `agent`
  - self-service-only access while admin catalogs stay denied

## Mounted Backend Specific Coverage

These suites are intended for mounted backend variants beyond the default
enterprise fixture and should not be treated as part of the default
enterprise-only validation pass.

- `e2e/entities/entities-mounted-backend-discovery.spec.ts`
  - root discovery against a mounted backend
  - agent root naming
  - entity membership dialog layout and shared role table behavior
- `e2e/roles/roles-mounted-backend-access.spec.ts`
  - role details surface against a mounted backend
- `e2e/app/app-shell-simple-rbac.spec.ts`
  - dashboard `/auth/config` auto-detection for `SimpleRBAC`
  - enterprise-only workspace hiding driven by backend feature flags
  - direct-route redirects for settings, entities, personal API keys, and system API keys
  - shared workspace smoke coverage for account, personal API keys, users, roles, and permissions
  - user-details degradation coverage when entity hierarchy is unavailable

## Validation Expectations

For a healthy enterprise pass, run:

```bash
E2E_API_BASE_URL=http://localhost:8004 \
E2E_AUTH_API_PREFIX=/v1 \
E2E_RESET_BACKEND=0 \
bunx playwright test \
  e2e/auth/auth-flow.spec.ts \
  e2e/api-keys/api-keys-workspace.spec.ts \
  e2e/api-keys/api-keys-persona-access.spec.ts \
  e2e/settings/settings-workspace.spec.ts \
  e2e/permissions/permissions-workspace.spec.ts \
  e2e/roles/roles-workspace.spec.ts \
  e2e/users/users-workspace.spec.ts \
  e2e/entities/entities-workspace.spec.ts \
  --workers=1
```

Use single-worker execution when the run intentionally mutates shared seeded data.

For the mounted SimpleRBAC smoke pass, run:

```bash
E2E_API_BASE_URL=http://localhost:8003 \
E2E_BACKEND_RESET_SCRIPT=/Users/macbookm3/Documents/projects/outlabsAuth/examples/simple_rbac/reset_test_env.py \
E2E_PERSONAS=admin \
E2E_ADMIN_EMAIL=admin@test.com \
E2E_ADMIN_PASSWORD=Test123!! \
bunx playwright test e2e/app/app-shell-simple-rbac.spec.ts
```

## Fixture orchestration

Default `bun run test:e2e` targets the **enterprise** fixture and ignores
`*simple-rbac*` / `*mounted-backend*` specs (`E2E_FIXTURE=enterprise`).

Run both local example fixtures in one command (requires `:8004` and `:8003`):

```bash
bun run test:e2e:fixtures
```

That script runs the enterprise suite, then the SimpleRBAC suite on frontend
port `3001` so Vite can start without colliding with an existing `:3000` server.

- `bun run test:e2e:simple` — SimpleRBAC only (`E2E_FIXTURE=simple`)
- `E2E_FIXTURE=all` — disable fixture path filtering (debug only)

Mounted `/iam` discovery specs stay opt-in via explicit path + env overrides
(see [`browser-testing.md`](./browser-testing.md)).

## Remaining Gaps

The suite is broad, but still not mathematically exhaustive. Intentional limits:

- full live Google account UI / consent automation (won’t automate; use mocked flows + opt-in `E2E_LIVE_GOOGLE=1` authorize boundary)
- pagination smoke covers Users + Audit chrome; not every workspace table under load

Opt-in live paths (skip when unset; not console gaps):

- invite-accept via fixture token capture (`/dev/auth/invite/latest`)
- Mailgun invite: `E2E_LIVE_MAIL=1` plus `MAILGUN_API_KEY` / `MAILGUN_DOMAIN` / `MAIL_RECIPIENT_OVERRIDE`
- Google authorize: `E2E_LIVE_GOOGLE=1` plus enterprise `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`

When adding new browser tests, update this matrix so the repo keeps an explicit
record of what is covered and what is still intentionally missing.
