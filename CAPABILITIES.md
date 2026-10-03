# Capability matrix

What the console does with each capability an outlabsAuth backend offers. This is the one
source of truth for "is it built?": README and ARCHITECTURE link here instead of keeping their
own lists. It replaced a parity list against the former React console: the target
is the backend's capability, not the retired React screens.

**Status**

| Status | Meaning |
|---|---|
| Built | Works on every preset where the backend offers it, and a Playwright spec proves it. |
| Partial | Works, with the stated gap. The gap names its cause: a console follow-up, or a backend change (outlabsAuth) the console cannot make. |
| Missing | The backend offers it; the console does not. |
| Not supported | Deliberately out of scope (owner decision or hosting constraint). |

**Preset**: *Both* = EnterpriseRBAC and SimpleRBAC; *Enterprise* = only EnterpriseRBAC mounts it
(the console hides it elsewhere, proven by `e2e/app/simple-rbac-gating.spec.ts`).
**Evidence** paths are relative to the repository root. **F-** numbers are the finding
identifiers of the 2026-09 production audit, also used in code comments and spec titles. The
audit report is not published: each row states its gap in place, and ARCHITECTURE.md "Status"
explains the other labels found in comments.

Last verified: 2026-10-02 at the cutover by `bun run release:check`, the run recorded in
PRODUCTION.md section 11 with the suite results. Update this file in the same commit as any change
that makes a row untrue.

## Sign-in, recovery and invitations

| Capability | Preset | Status | Evidence | Notes |
|---|---|---|---|---|
| Password sign-in | Both | Built | `e2e/auth/auth-flow.spec.ts`, `e2e/static/static-build.spec.ts` | |
| Magic link | Both | Built | `e2e/auth/passwordless-verify.spec.ts`, `e2e/auth/link-landings.spec.ts`, `e2e/auth/sign-in-steps.spec.ts` | Verifies only on click (mail scanners). A used, expired or invalid link offers "Request a new link", which opens sign-in on the email form. |
| E-mail sign-in code | Both | Built | `e2e/auth/passwordless-verify.spec.ts`, `e2e/auth/sign-in-steps.spec.ts` | A wrong or expired code is said on the code field and stays there for the next try. |
| Phone sign-in code (WhatsApp, SMS) | Both | Partial | `e2e/auth/passwordless-verify.spec.ts`, `e2e/auth/auth-flows.spec.ts` | The backend does not advertise whether messaging can deliver, so the console can promise a code that never arrives (F-099, backend). |
| OAuth sign-in | Both | Partial | `e2e/app/session-lifecycle.spec.ts`, `e2e/auth/sign-in-steps.spec.ts` | Provider round trips are mocked; no live-provider smoke yet. Works only when console and API are same-site (F-150, docs/security-posture.md). The callback uses a session only in the tab that started the sign-in or signup, within 20 minutes; any other is revoked (login CSRF). |
| Self-signup | Both | Built | `e2e/auth/signup.spec.ts` | Off with `authUi.signup: false`; the backend's register route stays mounted (disable it there too). Mentions phone sign-in codes only where they are offered. |
| Recovery (e-mailed reset link; phone sign-in as recovery) | Both | Built | `e2e/auth/recovery.spec.ts`, `e2e/account/recovery-prompt.spec.ts` | |
| Accept an invitation | Both | Built | `e2e/auth/passwordless-verify.spec.ts`, `e2e/auth/link-landings.spec.ts`, `e2e/auth/auth-flows.spec.ts` | The full round trip (invite, open the link, set a password, signed in) is proven on EnterpriseRBAC only: it reads the invite token from the example backend's dev capture, which SimpleRBAC does not mount. On SimpleRBAC, `auth-flows` proves the page (set-password form, invalid link). |
| Frontend profile key (`app`) | Both | Built | `e2e/auth/frontend-profile.spec.ts` | A wrong key is explained on sign-in. |
| Rate limits and resend cooldowns | Both | Built | `e2e/auth/sign-in-steps.spec.ts`, `e2e/app/api-errors.spec.ts` | |
| Password policy | Both | Partial | `e2e/account/account-workspace.spec.ts` | Mirrors the library's default policy. 0.1.0a35 publishes the policy in `/auth/config` (`password_policy`); the console does not read it yet (F-097, console follow-up). |
| Sign-in for suspended and locked accounts | Both | Built | `e2e/auth/seeded-accounts.spec.ts` | Locked accounts get the backend's generic refusal by design. |

## Session lifecycle

| Capability | Preset | Status | Evidence | Notes |
|---|---|---|---|---|
| Token renewal, one refresh across tabs, refused-refresh sign-out with reason | Both | Built | `e2e/session/session-lifecycle.spec.ts`, `e2e/app/session-lifecycle.spec.ts`, `e2e/app/session-refresh.spec.ts` | |
| Another account signing in in another tab: no replay as that account, reload into it even with a dirty dialog | Both | Built | `e2e/session/identity-switch.spec.ts` | Opaque (non-JWT) access tokens cannot be compared before a replay. |
| Sign-out revokes the server session (also after expiry) | Both | Built | `e2e/session/session-lifecycle.spec.ts` | Needs two requests after expiry (backend: logout accepts no refresh token alone). |
| Unreachable or slow API at boot (Retry, Sign out) | Both | Built | `e2e/app/session-lifecycle.spec.ts` | |
| Lost refresh answer | Both | Partial | — | A refresh lost after the API rotated the token signs the browser out as reuse; needs a backend grace window (ARCHITECTURE.md, "Session lifecycle"). |

## Account (self-service)

| Capability | Preset | Status | Evidence | Notes |
|---|---|---|---|---|
| Profile: name and phone | Both | Built | `e2e/account/account-workspace.spec.ts` | |
| E-mail change | Both | Not supported | `e2e/users/user-profile.spec.ts` | Read-only by owner decision: the backend changes e-mail without re-authentication (F-193). Users › Edit profile shows an admin's own sign-in e-mail read-only and never sends it. |
| Phone verification | Both | Built | `e2e/account/phone-verify.spec.ts`, `e2e/auth/signup.spec.ts` | |
| Password change | Both | Partial | `e2e/session/session-lifecycle.spec.ts`, `e2e/account/account-workspace.spec.ts` | Accounts without a password see a form they cannot complete. 0.1.0a35 says whether one is set (`has_password`); the console does not use it yet (F-098, console follow-up). |
| Own sessions: list, revoke one, sign out other devices, sign out everywhere | Both | Built | `e2e/account/sessions-table.spec.ts`, `e2e/session/session-lifecycle.spec.ts` | "This browser" is the server's `is_current`; Sign out other devices sends `keep_current` and renews once when an access token from before 0.1.0a35 names no session (F-030). Other devices keep their access tokens until expiry (F-157, backend). |
| Connected accounts (link, unlink) | Both | Partial | `e2e/account/social-accounts.spec.ts`, `e2e/static/static-build.spec.ts` | Mocked provider; a failed link lands on the API's own error page: 0.1.0a35 can redirect it back with `link_error`, which the console does not handle yet (F-104, console follow-up). Rows show the provider's icon: a provider picture (`avatar_url`) on another host is never loaded, as the CSP allows same-origin and `data:` images only. |
| My access (effective permissions, memberships) | Both | Partial | `e2e/account/my-access.spec.ts` | Entity and role names are missing for accounts that cannot read them; 0.1.0a35 memberships carry them (`entity_name`, `role_names`), which the console does not use yet (F-103, console follow-up). |

## Users

| Capability | Preset | Status | Evidence | Notes |
|---|---|---|---|---|
| List: search, status and type filters, server paging, URL state | Both | Built | `e2e/users/users-list.spec.ts`, `e2e/list-filters.spec.ts` | |
| Orphaned accounts | Enterprise | Built | `e2e/users/users-list.spec.ts`, `e2e/users/org-admin-users.spec.ts`, `e2e/app/dashboard.spec.ts` | A delegated admin gets the orphans rooted in their organization (the backend scopes `GET /users/orphaned`); deleted accounts are left out (F-161, F-240). |
| Create (with organization) | Both | Built | `e2e/users/users-workspace.spec.ts`, `e2e/users/org-admin-users.spec.ts` | Delegated admins create accounts in their own organization, which the backend enforces (F-012, F-040). |
| Invite (with entity and roles, or direct roles), resend an invitation | Both | Built | `e2e/users/user-invite.spec.ts`, `e2e/users/user-lifecycle.spec.ts`, `e2e/users/user-dialogs.spec.ts`, `e2e/auth/passwordless-verify.spec.ts` | Resend runs on both presets; that it replaces the earlier link is checked only where the dev invite capture is mounted (EnterpriseRBAC). Resend and restore by delegated inviters need backend support (F-244). |
| Edit profile (including e-mail) | Both | Built | `e2e/users/user-profile.spec.ts`, `e2e/users/users-workspace.spec.ts` | A name the account has can be changed but not removed (the backend refuses to clear it); one's own sign-in e-mail is read-only (F-193). |
| Status: suspend (timed), ban, reactivate | Both | Built | `e2e/users/user-status-password.spec.ts` | The backend treats a suspension end as advisory. |
| Reset password (ends every session) | Both | Built | `e2e/users/user-status-password.spec.ts`, `e2e/users/user-dialogs.spec.ts` | |
| Superuser grant and revoke (reason, typed e-mail) | Both | Built | `e2e/users/user-lifecycle.spec.ts` | |
| Delete (retained) and restore | Both | Built | `e2e/users/users-workspace.spec.ts`, `e2e/users/user-lifecycle.spec.ts` | |
| Sessions of a user: revoke one, sign out everywhere | Both | Built | `e2e/users/user-sessions.spec.ts`, `e2e/account/sessions-table.spec.ts` | Issued access tokens stay valid until expiry unless the backend turns blacklisting on. Only the admin's own account marks "This browser" (managed from Account); 0.1.0a35 has no keep-current option for another account, so there is no sign out other devices here. |
| Personal API keys of a user: list, revoke | Both | Built | `e2e/users/user-api-keys.spec.ts` | |
| Audit timeline | Both | Built | `e2e/users/user-history.spec.ts` | |
| Membership history | Enterprise | Built | `e2e/users/user-history.spec.ts` | |

## Access: roles and memberships of an account

| Capability | Preset | Status | Evidence | Notes |
|---|---|---|---|---|
| Direct roles: assign, edit window, suspend, reactivate, remove | Both | Built | `e2e/users/user-roles.spec.ts`, `e2e/users/user-access.spec.ts` | |
| Delegation limits (roles an admin may grant) | Both | Built | `e2e/roles/role-access-kit.spec.ts`, `e2e/app/api-errors.spec.ts` | Non-delegable roles are listed disabled with the reason. |
| Entity memberships: add, edit, reactivate, remove, include ended | Enterprise | Built | `e2e/users/user-memberships.spec.ts`, `e2e/entities/entity-members.spec.ts` | |
| Effective permissions with their source role | Both | Partial | `e2e/users/user-access.spec.ts` | The backend names one source role per permission and no entity context (F-013, backend). |
| Check access (`POST /permissions/check`) | Both | Partial | `e2e/users/user-access.spec.ts` | `permission:check` is missing from the example seed, so only superusers get it there (F-059, backend seed). |
| Role names on grants the admin cannot read | Both | Partial | — | Read "Unknown role"; 0.1.0a35 membership responses carry `role_names`, which the console does not use yet (F-067, console follow-up); no spec. |

## Entities (EnterpriseRBAC)

| Capability | Preset | Status | Evidence | Notes |
|---|---|---|---|---|
| Tree: selection, inactive and detached entities, deep links, organizations | Enterprise | Built | `e2e/entities/entities-workspace.spec.ts`, `e2e/entities/entity-mobile.spec.ts` | |
| Create organization or child (types, advanced options) | Enterprise | Built | `e2e/entities/entities-workspace.spec.ts` | A child of an access group starts on Access group. A root's Python-only naming patterns are checked by the server on submit; its refusal lands on the field. |
| Governance: child limits and naming rules | Enterprise | Built | `e2e/entities/entity-governance.spec.ts` | Patterns are Python regular expressions; Python-only syntax is accepted and checked by the server, and only changed patterns are validated. |
| Edit: status (Active, Inactive) and validity | Enterprise | Built | `e2e/entities/entities-workspace.spec.ts` | Entity status and validity do not change member permissions on the backend; the copy says so (F-156). |
| Move within the organization | Enterprise | Partial | `e2e/entities/entities-workspace.spec.ts` | Invalid targets are filtered client-side; the backend does not validate them (F-076, backend). Moving to the top level (superusers) has no spec. |
| Archive with cascade; finish archiving | Enterprise | Built | `e2e/entities/entities-workspace.spec.ts` | |
| Members: paged, true count, capacity | Enterprise | Built | `e2e/entities/entity-members.spec.ts`, `e2e/entities/entities-workspace.spec.ts` | |
| Activity | Enterprise | Partial | `e2e/entities/entity-activity.spec.ts` | The backend audits entity create, update, move and archive since 0.1.0a35; the spec checks membership events only (F-241, console follow-up). |
| Scope for delegated admins | Enterprise | Built | `e2e/entities/entity-scope.spec.ts`, `e2e/app/persona-matrix.spec.ts` | Delegated admins are anchored on their organization; superusers and system-wide admins browse every organization (one rule for entities, users and roles). The backend scopes the entity and membership routes too: another organization's entity reads as not found (F-020, F-039). |
| Entity type configuration | Enterprise | Built | `e2e/settings/settings-config.spec.ts` | Superusers. |

## Roles

| Capability | Preset | Status | Evidence | Notes |
|---|---|---|---|---|
| List: type, origin, organization filters, server paging | Both | Built | `e2e/roles/roles-workspace.spec.ts`, `e2e/list-filters.spec.ts` | Organization filter loads at most 100 organizations. |
| Create: system-wide, organization or entity role; assignable-at types; permissions | Both | Built | `e2e/roles/role-type-scope.spec.ts`, `e2e/roles/role-permissions.spec.ts`, `e2e/roles/org-admin-roles.spec.ts` | Organization and entity types on EnterpriseRBAC only. |
| Edit, including the permission set as a diff | Both | Partial | `e2e/roles/role-permissions.spec.ts` | Up to three requests, not atomic, no version check: a concurrent edit can be overwritten (F-158, backend). |
| Archive (typed name, effects, own-access warning) | Both | Partial | `e2e/roles/roles-workspace.spec.ts`, `e2e/roles/org-admin-roles.spec.ts` | Holder count needs the backend (F-112). |
| Duplicate a system role as a custom role | Both | Built | `e2e/roles/roles-workspace.spec.ts` | |
| ABAC conditions and groups | Both | Built | `e2e/app/abac-conditions.spec.ts` | |
| Role definition history | Both | Missing | — | 0.1.0a35 exposes it (`GET /roles/{id}/history`); the console does not show it yet (F-092, console follow-up). |

## Permissions

| Capability | Preset | Status | Evidence | Notes |
|---|---|---|---|---|
| List: server paging, resource filter, search | Both | Built | `e2e/permissions/permissions-list-state.spec.ts` | Search walks the whole catalogue (the API has no search parameter). |
| Create, edit, archive custom permissions | Both | Built | `e2e/permissions/permissions-workspace.spec.ts` | System permissions are read-only. |
| ABAC conditions and groups | Both | Built | `e2e/app/abac-conditions.spec.ts` | |
| Resource picked from existing resources | Both | Missing | — | Validated text input (F-073). |
| Permission definition history | Both | Missing | — | 0.1.0a35 exposes it (`GET /permissions/{id}/history`); the console does not show it yet (F-092, console follow-up). |

## Personal API keys

| Capability | Preset | Status | Evidence | Notes |
|---|---|---|---|---|
| List with real status, filters, detail | Both | Built | `e2e/api-keys/api-keys-workspace.spec.ts`, `e2e/api-keys/key-status.spec.ts` | |
| Create: scopes, entity restriction, IP allowlist, rate limit, expiry | Both | Partial | `e2e/api-keys/api-keys-workspace.spec.ts` | Restriction only to the admin's own membership entities (F-083). |
| Edit scopes, IP allowlist, rate limit | Both | Built | `e2e/api-keys/api-keys-workspace.spec.ts` | |
| Suspend, reactivate, rotate, revoke | Both | Partial | `e2e/api-keys/api-keys-workspace.spec.ts` | Rotate offered only on keys in effect; the backend itself still rotates a suspended key (F-080, backend). |
| One-time secret display | Both | Built | `e2e/api-keys/secret-reveal.spec.ts`, `e2e/app/dialog-kit.spec.ts` | |
| A minted key authenticates against the API | Both | Missing (test) | — | Works in the backend; no spec sends `X-API-Key` yet. |

## Service accounts and machine keys

| Capability | Preset | Status | Evidence | Notes |
|---|---|---|---|---|
| List, search, status filter; account page | Both | Built | `e2e/service-accounts/service-accounts.spec.ts` | `/app/users/api-keys` redirects to `/app/service-accounts`. |
| Create (role-backed), edit, deactivate, reactivate, archive | Both | Built | `e2e/service-accounts/service-accounts.spec.ts`, `e2e/service-accounts/org-admin-service-accounts.spec.ts` | Platform scope for superusers only on EnterpriseRBAC. |
| Direct scopes | Both | Partial | `e2e/service-accounts/service-accounts.spec.ts` | A client mirror of the backend's default allowlist; 0.1.0a35 adds the grantable-scopes endpoints, which the console does not use yet (F-079, console follow-up). |
| Keys: create, edit, suspend, reactivate, rotate, revoke | Both | Built | `e2e/service-accounts/service-accounts.spec.ts` | |
| Replace an expired machine key | Both | Missing | — | Personal keys have "Create replacement"; machine keys do not. |
| Key inventory: search, kind and status filters, owner in rows and detail, revoke | Enterprise | Partial | `e2e/service-accounts/service-accounts.spec.ts`, `e2e/api-keys/key-status.spec.ts` | No owner filter yet. The status filter is the stored status, so "Active (includes expired)" lists keys past their expiry (each badged Expired) and there is no Expired filter: the server cannot filter on the effective state (backend). |

## Audit

| Capability | Preset | Status | Evidence | Notes |
|---|---|---|---|---|
| Search: category, event type, actor, subject, entity, date range, paging in the URL | Enterprise | Built | `e2e/audit/audit-workspace.spec.ts` | |
| Event detail: changes, context, pivots, redacted payload | Enterprise | Built | `e2e/audit/audit-workspace.spec.ts` | |
| Export | Enterprise | Partial | `e2e/audit/audit-workspace.spec.ts` | Client-side, up to 5,000 events, redacted (F-190). |
| What the log covers | Enterprise | Partial | `e2e/audit/audit-workspace.spec.ts` | Stated in the UI; role, permission and machine-key events are not recorded by the backend (F-092). |

## Dashboard and settings

| Capability | Preset | Status | Evidence | Notes |
|---|---|---|---|---|
| Admin dashboard: counts linking to filtered lists, recent activity | Both | Built | `e2e/app/dashboard.spec.ts` | The security tile counts wrong passwords on existing accounts: the backend audits no other failed sign-in (PRODUCTION.md section 8). |
| Non-admin dashboard: own access and launcher | Both | Built | `e2e/app/dashboard.spec.ts` | |
| Settings: contract, library, routers, sign-in methods, audit log, features (admins) | Both | Built | `e2e/settings/settings-workspace.spec.ts` | Flags the backend reports as always on are not listed. |
| API contract version check | Both | Built | `e2e/auth/api-contract.spec.ts`, `e2e/settings/settings-workspace.spec.ts` | |

## Shell, navigation and accessibility

| Capability | Preset | Status | Evidence | Notes |
|---|---|---|---|---|
| Navigation equals page access for every persona | Both | Built | `e2e/app/nav-parity.spec.ts`, `e2e/app/access-control.spec.ts`, `e2e/app/persona-matrix.spec.ts` | |
| Capabilities or permissions that fail to load: fail closed with Retry, never a denial | Both | Built | `e2e/app/config-fail-closed.spec.ts`, `e2e/app/permissions-fail-closed.spec.ts` | |
| Global search (command palette) | Both | Built | `e2e/app/shell-navigation.spec.ts` | |
| Titles, landmarks, skip link, focus return, Back and Forward | Both | Built | `e2e/app/shell-navigation.spec.ts`, `e2e/app/browser-lifecycle.spec.ts`, `e2e/app/dialog-kit.spec.ts` | |
| Phone width (390px) | Both | Built | `e2e/a11y/a11y-smoke.spec.ts`, `e2e/app/shell-navigation.spec.ts` | |
| WCAG 2.1 AA (axe) | Both | Partial | `e2e/a11y/a11y-smoke.spec.ts`, `e2e/a11y/a11y-dialogs.spec.ts`, `e2e/auth/auth-a11y.spec.ts` | The colour-contrast rule is off: light mode fails AA on primary buttons and some status text, a known limitation the owner accepted on 2026-10-02 to keep the stock theme (F-032, PRODUCTION.md section 3). Every dialog is swept. |
| Visual regression baselines | Both | Missing | — | Need one fixed rendering environment for every machine that runs the release check (F-148). |
| Firefox, WebKit, phone-sized Chromium | Both | Built | `playwright.config.ts` (`E2E_BROWSERS`) | On demand: `bun run release:check --browsers firefox,webkit,mobile-chrome`; the default release check runs Chromium only (PRODUCTION.md section 1). |
| Languages other than English | Both | Not supported | — | Owner decision (F-225). |

## Hosting, build and configuration

| Capability | Status | Evidence | Notes |
|---|---|---|---|
| Runtime configuration (`app-config.json`), fail closed in production | Built | `e2e/app/config-fail-closed.spec.ts`, `e2e/static/static-build.spec.ts`, `test/unit/runtime-config*.test.ts` | |
| CSP with script hashes and the security headers | Built | `e2e/static/static-build.spec.ts`, `test/unit/static-site.test.ts` | docs/security-posture.md |
| Workers static-asset semantics (SPA fallback, real 404s) | Built | `e2e/static/static-build.spec.ts` | |
| Deploy preflight (config rules, `connect-src` pin, a passing release check for `HEAD`, the token's Cloudflare account) | Built | `test/unit/deploy-preflight.test.ts`, `test/unit/release-gate.test.ts`, `test/unit/deploy-account.test.ts` | |
| Release check (every gate on both presets, recorded for the deploy) | Built | `scripts/release-check.mjs`, `test/unit/release-gate.test.ts` | README "Releasing"; run on the releasing machine, no hosted CI. |
| Hosting under a sub-path | Not supported | — | Serve the console at the root of its own hostname. |
| OAuth with console and API on different sites | Not supported | — | Same-site hosting required (docs/security-posture.md). |
| Error reporting and telemetry | Not supported | — | Owner decision: no external error reporting. |
| Bundle size budget | Missing | — | PRODUCTION.md gate item. |
