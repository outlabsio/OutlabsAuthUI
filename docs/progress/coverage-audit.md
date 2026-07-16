# OutlabsAuthUI Coverage Audit

This document is the restart point for sidecar completeness against the OutlabsAuth
backend. Update it whenever a major management surface lands or a backend router
gains capabilities the UI does not yet expose.

## Product intent

This SPA is the **generic OutlabsAuth management console** (sidecar UI):

- Admin and operator workflows for users, roles, permissions, entities, and keys
- Passwordless auth entry flows needed to reach that console
- Invite-based account provisioning (not open self-registration)

Self-registration (`POST /auth/register`) and OAuth provider UIs are backend
capabilities that host apps may expose separately. They are tracked below as
optional product gaps, not required console parity unless a mount depends on them.

## Current coverage

| Domain | Status | Notes |
|---|---|---|
| Password login / forgot / reset | Covered | |
| Magic link / access code | Covered | Feature-flagged from `/auth/config` |
| Accept invite | Covered | UI covered; live token round-trip blocked on fixture capture |
| Server logout | Covered | `POST /auth/logout` with refresh revoke + local clear |
| Account self-service | Covered | Profile + password |
| Users admin | Covered | Invite, create-with-password, status, roles, memberships, orphaned discovery, history, audit, permission check |
| Roles / permissions / ABAC | Covered | |
| Entities hierarchy + members | Covered | Create/edit/status/move/promote-to-root/archive-delete |
| Personal API keys | Covered | Self-service + admin list/revoke on user details |
| System / integration API keys | Covered | Managed in System API Keys workspace |
| Settings | Narrow | Entity type config only (full mutable `/config` surface) |

## Known gaps

### P0 / security

- [x] Wire `POST /auth/logout` into Sign out (refresh revoke; local session always cleared)

### P1 / admin parity

- [x] Entity move (`POST /entities/{id}/move`)
- [x] Entity delete (`DELETE /entities/{id}`)
- [x] Admin create-user with password (`POST /users/`)
- [x] Patch direct role membership validity windows (`PATCH /users/{id}/role-memberships/{membership_id}`)
- [x] Admin manage another user’s personal API keys from user details (list + revoke)
- [x] Orphaned users discovery (`GET /users/orphaned`) in the Users workspace
- [x] Entity-context permission check (`POST /permissions/check`) on user details

### P2 / optional auth shell

- [x] Self-registration UI deferred — dead `/auth/register` route constant removed; console is invite-only (admin create-user covers password provisioning)
- [ ] OAuth login + account associate UI — deferred until a mount requires console OAuth

### Ops validation

- [ ] Live invite-accept E2E — **blocked** on enterprise fixture invite-token capture (`/dev/auth/invite/latest` mirroring magic-link capture). Do not depend on live mail.
- [ ] Real invite email E2E against a live mail path (optional ops; prefer fixture capture above)
- [x] Live membership lifecycle round-trip (`status`, `valid_from`, `valid_until`)
- [ ] Live passwordless E2E via `/dev/auth/magic-link/latest` and `/dev/auth/access-code/latest`

## Architecture follow-ups

- [x] Align `/app/api-keys` with `redirectIfWorkspaceHidden`
- [x] Split `integration-principals.ts` into verb-based API files + shared path helpers
- [x] Extract system API key / integration-principal mutations into feature hooks
- [x] Deduplicate actor-permission helpers across workspace pages (`useActorPermissions` + `hasAnyPermission`)
- [x] E2E matrix hygiene (settings + API-key persona suites documented)
- [ ] Unify membership access dialogs (`MembershipAccessDialog` / `EntityMemberAccessDialog`)
- [ ] Split mega workspace pages (`user-details-page`, `api-keys-page`) into section components

## Remaining work (priority order)

1. Live passwordless E2E via fixture capture endpoints
2. Unify membership access dialogs into a shared form shell
3. Split mega workspace pages into tab/section components
4. Invite-accept live E2E after backend fixture adds `/dev/auth/invite/latest`
5. Deferred/blocked: OAuth UI, admin sessions/devices, entity/cross-user audit

## Related docs

- User management details: [`user-management-and-details.md`](./user-management-and-details.md)
- E2E matrix: [`../testing/e2e-coverage.md`](../testing/e2e-coverage.md)
- Runtime config: [`../runtime-configuration.md`](../runtime-configuration.md)
