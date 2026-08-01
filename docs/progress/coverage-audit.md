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
| Magic link / access code | Covered | Feature-flagged from `/auth/config`; live capture E2E against enterprise fixture |
| Accept invite | Covered | UI covered; live token round-trip blocked on fixture capture |
| Server logout | Covered | `POST /auth/logout` with refresh revoke + local clear |
| Account self-service | Covered | Profile + password + WhatsApp phone register/verify OTP |
| Users admin | Covered | Invite, create-with-password, status, roles, memberships, orphaned discovery, history, audit, permission check |
| Roles / permissions / ABAC | Covered | |
| Entities hierarchy + members | Covered | Create/edit/status/move/promote-to-root/archive-delete + Activity tab |
| Personal API keys | Covered | Self-service + admin list/revoke on user details |
| System / integration API keys | Covered | Managed in System API Keys workspace |
| Settings | Covered | Read-only Runtime capabilities from `/auth/config` + mutable entity-types |
| Audit search | Covered | Filters + expandable before/after/metadata event inspector |

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
- [x] OAuth linked-accounts list/unlink on Account (`GET/DELETE /users/me/social-accounts`)
- [x] OAuth associate mount (Google) + Account “Link Google” (`GET /oauth-associate/google/authorize` → provider → callback → `/app/account?linked=google`)
- [x] Invite-only console Google OAuth login (`GET /oauth/google/authorize` → callback → `/auth/oauth/callback#tokens`; unknown emails rejected)
- [x] Separate `whatsapp_otp` / `sms_otp` challenge types (+ `delivery_channel`); WhatsApp + SMS enterprise host recipes (Twilio when configured)

### Ops validation

- [x] Live invite-accept E2E via `/dev/auth/invite/latest` (fixture token capture; not live mail)
- [x] Opt-in live invite-mail E2E against Mailgun (`E2E_LIVE_MAIL=1` + Mailgun env + `MAIL_RECIPIENT_OVERRIDE`; polls Events API then accepts via fixture token)
- [x] Live membership lifecycle round-trip (`status`, `valid_from`, `valid_until`)
- [x] Live passwordless E2E via `/dev/auth/magic-link/latest` and `/dev/auth/access-code/latest`

## Architecture follow-ups

- [x] Align `/app/api-keys` with `redirectIfWorkspaceHidden`
- [x] Split `integration-principals.ts` into verb-based API files + shared path helpers
- [x] Extract system API key / integration-principal mutations into feature hooks
- [x] Deduplicate actor-permission helpers across workspace pages (`useActorPermissions` + `hasAnyPermission`)
- [x] E2E matrix hygiene (settings + API-key persona suites documented)
- [x] Unify membership access dialogs (`MembershipAccessDialog` / `EntityMemberAccessDialog` shared actions/footer/roles panel)
- [x] Split mega workspace pages (`user-details-page`, `api-keys-page`) into section/tab components

## Milestone status

**Sidecar console completeness: closed** for the current OutlabsAuth backend surface.

All P0/P1 admin parity, P2 auth-shell, ops validation, and architecture follow-ups
above are shipped. Form/shell hygiene and Settings honesty (Runtime capabilities +
entity-types) are in place. See the shipped chronology in git history and the E2E
matrix for regression coverage.

### Explicitly out of scope (closed decisions)

These were the last open “remaining” items. They are **not** unfinished UI work:

1. **Typed runtime allowlist / feature-flag CRUD** — Won’t build.  
   Backend `/config` only exposes typed `entity-types` today; `ConfigKeys.FEATURE_FLAGS`
   is reserved “for future use” with no router. Free-form KV flags in this SPA would
   violate [`auth-config-layers.md`](../auth-config-layers.md). Reopen only if the
   backend ships a typed `/config/<key>` allowlist with precedence + audit.

2. **Full live Google consent / account UI automation** — Won’t build.  
   Flaky third-party UI automation. Covered by mocked login/associate flows plus
   opt-in authorize-boundary checks (`E2E_LIVE_GOOGLE=1`). Manual provider smoke
   when credentials are configured is enough.

### Optional host ops (not console gaps)

- Run live Mailgun invite E2E when Mailgun env is available (`E2E_LIVE_MAIL=1`)
- Run live Google authorize E2E when Google env is mounted (`E2E_LIVE_GOOGLE=1`)

## Related docs

- Auth config layers: [`../auth-config-layers.md`](../auth-config-layers.md)
- User management details: [`user-management-and-details.md`](./user-management-and-details.md)
- E2E matrix: [`../testing/e2e-coverage.md`](../testing/e2e-coverage.md)
- Runtime config (SPA target): [`../runtime-configuration.md`](../runtime-configuration.md)
