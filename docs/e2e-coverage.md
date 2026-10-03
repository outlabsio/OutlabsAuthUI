# E2E coverage

What the Playwright suite proves, and what it does not. How to run it is in
[`e2e/README.md`](../e2e/README.md); which spec proves each capability is the Evidence column of
[`CAPABILITIES.md`](../CAPABILITIES.md). This page covers the lanes, the persona matrix, the
known coverage gaps and the checklist of the retired React suite. Update it in the same change
as a spec that closes or opens a gap.

## Lanes

"Every release check" is `bun run release:check` (README "Releasing"; e2e/README.md "Release
check"): the whole suite on the static build against both presets, before every deploy.

| Lane | Playwright project / setting | Proves | Runs |
|---|---|---|---|
| Guest pages | `chromium-guest` (`e2e/auth/`) | sign-in, recovery, signup, invitation, link landings, `authUi` config; the backend-free smoke runs with no API at all | every release check, both presets |
| Console | `chromium` (everything else) | every workspace as each persona | every release check, both presets |
| Static build | `E2E_TARGET=static`, plus `chromium-static` (`e2e/static/`) | the generated artifact under its own `_headers`: no CSP violation, no third-party request, no blank icon, Workers asset semantics | every release check (it uses the static target) |
| Session lifecycle | `session` (`e2e/session/`) | renewal, rotation, sign-out and password changes after an access token expires (expiry simulated client-side); another account signing in in another tab (no replay as that account, reload without a leave prompt) | every release check, both presets |
| Accessibility | `e2e/a11y/`, `e2e/auth/auth-a11y.spec.ts`, axe calls inside area specs | WCAG 2.1 A/AA via axe in light and dark mode at 1440px and 390px; colour contrast off (F-032, an accepted limitation) | every release check |
| Other browsers | `E2E_BROWSERS=firefox,webkit,mobile-chrome` | the same specs in Firefox, WebKit and a phone-sized Chromium | `release:check --browsers firefox,webkit,mobile-chrome`, on demand (PRODUCTION.md section 1) |

## Persona × preset matrix

Personas come from the example backends' seeds (`e2e/support/personas.ts`); the global admin is
provisioned by the harness. `e2e/app/nav-parity.spec.ts` pins the exact navigation of every
persona on its preset, and `e2e/app/persona-matrix.spec.ts` holds the scenarios.

| Persona | Preset | What the suite asserts |
|---|---|---|
| `admin` (superuser) | Both | Full create, edit and lifecycle baseline in every area; the static build |
| `globalAdmin` (provisioned, non-superuser with a system-wide role) | Both | Admin dashboard and users toolbar of an admin who sees every organization; row menus follow its role; on EnterpriseRBAC another organization's user (membership names, the Add membership pool), the entities organization switcher and deep link, and Service accounts at any entity. The seed's system-wide admin role lacks `membership:create_tree`, so a cross-organization membership add itself is not exercised |
| `orgAdmin` (organization admin) | Enterprise | Scoped tree, pickers and lists; organization required on create; delegable roles only; organization service accounts; no actions without the permission; no refused change offered on an account holding a system-wide role (the seeded permissions admin, a revoked grant), nothing offered while that is unknown and a failed check said with Retry, with the archived-role gap shown as the server's refusal; a failed permissions load shows Retry, not the denial (`app/permissions-fail-closed.spec.ts`, also as `globalAdmin` on both presets) |
| `summitAdmin` (second organization) | Enterprise | Lists hold only its organization; deep links into the first organization render not found or denied, never data |
| `auditor` | Enterprise | Read-only sweep: no list, detail or row menu offers a change |
| `permissionsAdmin` | Enterprise | Permission create and edit, ABAC on a custom permission; Audit without the entity filter |
| `agent` (low privilege) | Both | Minimal navigation, in-place denials, personal keys limited to grantable scopes |
| `writer` | Simple | Minimal navigation on SimpleRBAC |
| Seeded account states (suspended, locked, invited, unverified) | Enterprise | Sign-in refusals and account badges (`e2e/auth/seeded-accounts.spec.ts`) |

Not covered, because the example seeds lack them (backend, F-037, F-041, F-243): entity-only
managers, regional and branch admins whose grants stop at a subtree, a team lead, a seeded
non-superuser SimpleRBAC admin, and keys and memberships in every lifecycle state.

## Known coverage gaps

- A minted API key is never used against the API (`X-API-Key`).
- An access token without a session id (`sid`, minted before outlabs-auth 0.1.0a35) is simulated:
  the example backends issue only session-bound tokens, so `account/sessions-table.spec.ts`
  answers Sign out other devices with outlabs-auth's 400 to cover the renewal and the notice.
- No live OAuth provider: provider round trips are mocked (F-150; checked per deployment in
  PRODUCTION.md). So is an account created through OAuth sign-in, which has no password.
- The example backends run outlabs-auth's default password policy with registration open, so a
  stricter or laxer policy, the `invite_only` and `closed` registration modes and a registration
  refused as turned off are served (`withPasswordPolicy`, `patchAuthConfig`). The default
  policy, including a backslash as the only symbol, is checked against the live server.
- The example backends' superuser may grant every allowed scope, so a narrower answer from
  `…/integration-principals/grantable-scopes` (and its failures) is served to the service-account
  dialogs; the delegated admin's real, narrower answer is checked live on EnterpriseRBAC.
- A membership role a delegated admin cannot read is also named by the membership history, so
  `users/user-memberships.spec.ts` serves that history empty to show the membership's own
  `role_names`; the low-privilege persona's memberships (`account/my-access.spec.ts`) are live.
- Account › Security for an account without a password is served (`has_password` false on
  `GET /users/me`, the emailed link's request answered, no mail sent); the admin's Set password
  runs on a real one (an invitation an admin activated instead of accepting it).
- An archived role or permission's history is not readable (404), so no spec shows an
  Archived event; the label is unit-tested only. Every role and permission a run creates has its
  creation recorded, so the History card's empty state is shown by serving an empty page for one
  of them (`serveEmptyHistory`), never by finding a definition without history on the backend.
- A failed read of an account's direct roles (which decide whether a delegated admin may change
  it) is served as a 500 in `users/org-admin-users.spec.ts`; Retry then reads the live answer.
- Moving an entity to the top level (a new organization) has no spec.
- Inviting a user as a superuser has no spec; invitations with roles on SimpleRBAC are covered
  only through the role picker.
- A non-superuser admin cannot save the entity-type configuration: not asserted.
- Colour contrast is off in the axe sweep, a known limitation the owner accepted on 2026-10-02
  (F-032, PRODUCTION.md section 3).
- No screenshot baselines (F-148): they need one fixed rendering environment for every machine
  that runs the release check.
- The rows marked Missing (test) or with no evidence in CAPABILITIES.md.

## The retired React suite

The former React console's Playwright suite (106 tests, removed with that console) was the
behavioural reference for this console. Each of its tests is accounted for below: **Ported** (a Nuxt spec covers the same
behaviour), **Replaced** (the Nuxt design changed the behaviour and its spec covers the new
one), **Partial**, **Not ported** (a gap, with the reason) or **Out of scope**.

### Account

| React test | Status | Nuxt coverage |
|---|---|---|
| admin can open account and update self profile details | Ported | `account/account-workspace.spec.ts` |
| account password form validates confirmation before submit | Ported | `account/account-workspace.spec.ts` |
| admin can view active sessions and linked accounts on account page | Ported | `account/sessions-table.spec.ts`, `account/social-accounts.spec.ts` |
| Link Google completes via mocked associate authorize + linked callback | Ported | `account/social-accounts.spec.ts` |
| live phone verification completes via fixture code capture | Ported | `auth/signup.spec.ts` (full loop), `account/phone-verify.spec.ts` |

### API keys and service accounts

| React test | Status | Nuxt coverage |
|---|---|---|
| agent can create, rotate, list, and revoke a personal API key | Partial | `api-keys/api-keys-workspace.spec.ts` runs the lifecycle as admin; the agent's grantable scopes are asserted |
| org admin can create, use, inventory, and revoke a root-scoped system integration key | Partial | `service-accounts/org-admin-service-accounts.spec.ts`; the key is never used against the API |
| regional admin can create West Coast integrations but not cross into East Coast | Not ported | Needs subtree-scoped admins in the seed (F-037, backend) |
| office admin cannot mint system keys without tree-scoped API key authority | Not ported | Same |
| east admin can manage East Coast keys but is denied for West Coast entities | Not ported | Same |
| auditor stays denied in both UI and direct API | Partial | `app/persona-matrix.spec.ts` (UI); the direct API denial is the backend's to test |
| team lead stays denied in both UI and direct API | Not ported | No team-lead persona in the seed (F-243, backend) |
| superuser can create platform-global integrations and revoke their runtime access | Partial | `service-accounts/service-accounts.spec.ts`; runtime access is not exercised |
| admin can create, rotate, and revoke a platform-global machine key (SimpleRBAC) | Ported | `service-accounts/service-accounts.spec.ts` on SimpleRBAC |
| admin can self-manage a personal API key from the API Keys workspace | Ported | `api-keys/api-keys-workspace.spec.ts` |
| personal API key form exposes grantable permissions and sends the policy payload | Ported | `api-keys/api-keys-workspace.spec.ts` |
| service account forms expose role-backed access and send scoped machine-key payloads | Ported | `service-accounts/service-accounts.spec.ts` |
| admin can manage an entity service account and revoke its restricted machine key from inventory | Ported | `service-accounts/service-accounts.spec.ts` |
| admin can create a platform-global service account and inherited machine key | Ported | `service-accounts/service-accounts.spec.ts` |

### Shell, access and pagination

| React test | Status | Nuxt coverage |
|---|---|---|
| agent can use account while API keys and admin catalogs stay denied | Ported | `app/access-control.spec.ts` |
| dashboard auto-detects SimpleRBAC and hides enterprise-only workspaces | Ported | `app/simple-rbac-gating.spec.ts`, `app/nav-parity.spec.ts` |
| shared workspaces stay readable against the SimpleRBAC backend contract | Ported | the whole suite gates on SimpleRBAC |
| invite assigns selected roles as direct account roles in SimpleRBAC | Partial | `roles/role-access-kit.spec.ts` (direct-role pool on SimpleRBAC); no invite-with-roles payload test there |
| admin can navigate the shell with only live workspace routes | Ported | `app/app-shell.spec.ts`, `app/nav-parity.spec.ts` |
| admin can sign out and protected routes redirect back to login | Ported | `app/shell-navigation.spec.ts`, `auth/auth-flow.spec.ts` |
| api-keys deep link redirects to dashboard when the feature is disabled | Replaced | Capability-absent routes redirect (`app/simple-rbac-gating.spec.ts`, `app/config-fail-closed.spec.ts`) |
| admin can page Users list and sees pagination chrome in Audit | Ported | `users/users-list.spec.ts`, `audit/audit-workspace.spec.ts`, `permissions/permissions-list-state.spec.ts`, `roles/roles-workspace.spec.ts` |

### Audit

| React test | Status | Nuxt coverage |
|---|---|---|
| admin can open audit search workspace | Ported | `audit/audit-workspace.spec.ts` |
| admin can filter by actor and clear with reset | Ported | `audit/audit-workspace.spec.ts` (actor picker, removable chips) |
| admin can apply a date-range filter without crashing | Ported | `audit/audit-workspace.spec.ts` (presets and calendar days) |
| audit deep-link prefills entity / subject / actor filter (3 tests) | Ported | `audit/audit-workspace.spec.ts` ("deep links prefill the filters as named chips") |
| admin can filter Audit by clicking an actor id on an event card | Replaced | Pivots in the expanded event link into a filtered Audit (`audit/audit-workspace.spec.ts`) |
| admin can expand audit event details when payload is present | Ported | `audit/audit-workspace.spec.ts` |
| unknown actor filter yields empty state | Replaced | Malformed ids are warned and never sent; failures show the error (`audit/audit-workspace.spec.ts`) |

### Sign-in and OAuth

| React test | Status | Nuxt coverage |
|---|---|---|
| unauthenticated entrypoints redirect to the login page | Ported | `auth/auth-flow.spec.ts` |
| invalid credentials stay on login and surface an error | Ported | `auth/auth-flow.spec.ts` |
| configured frontend profile is sent with password login | Ported | `test/unit/frontend-profile.test.ts`, `auth/frontend-profile.spec.ts` |
| successful sign-in lands on the dashboard | Ported | `auth/auth-flow.spec.ts` |
| expired access token refreshes once and keeps the user in the app | Ported | `app/session-refresh.spec.ts`, `session/session-lifecycle.spec.ts` |
| failed refresh clears stored tokens and returns to login | Ported | `app/session-refresh.spec.ts` |
| magic link method is surfaced and requests an email link | Ported | `auth/auth-flows.spec.ts`, `auth/passwordless-verify.spec.ts` |
| magic link request cooldown persists across reloads | Ported | `auth/sign-in-steps.spec.ts` |
| password reset cooldown honors server retry metadata | Ported | `auth/sign-in-steps.spec.ts` |
| magic link token exchange lands on the dashboard | Ported | `auth/link-landings.spec.ts`, `auth/passwordless-verify.spec.ts` |
| access code method requests a code and signs in with it | Ported | `auth/passwordless-verify.spec.ts` |
| access code entry is reachable after the original tab is closed | Ported | `auth/link-landings.spec.ts` |
| access code route reports when the method is disabled | Replaced | `auth/capability-degradation.spec.ts` (methods follow the backend) |
| live magic-link request completes via fixture token capture | Ported | `auth/passwordless-verify.spec.ts` |
| live access-code request completes via fixture code capture | Ported | `auth/passwordless-verify.spec.ts` |
| live WhatsApp access-code login completes via verified phone | Ported | `auth/passwordless-verify.spec.ts` (WhatsApp and SMS) |
| login shows invite-only Google error from oauth_error search param | Ported | `auth/sign-in-steps.spec.ts`, `auth/auth-flows.spec.ts` |
| Continue with Google completes via mocked authorize + hash callback | Ported | `app/session-lifecycle.spec.ts`, `auth/sign-in-steps.spec.ts` |
| oauth callback without tokens shows recovery link | Ported | `app/session-lifecycle.spec.ts`, `auth/sign-in-steps.spec.ts` |
| backend Google authorize returns a Google authorization URL | Not ported | The example backends configure no provider; live check per deployment (PRODUCTION.md) |
| Continue with Google navigates to the live Google authorize URL | Not ported | Same |

### Entities

| React test | Status | Nuxt coverage |
|---|---|---|
| superuser defaults to the current root and can search-select another root scope | Ported | `entities/entities-workspace.spec.ts` |
| agent roots show the migrated agent name and friendly Agent type label | Out of scope | Data of one consumer's backend, not of the example seeds |
| entity membership dialog uses the shared role table and lifecycle panel | Replaced | `roles/role-access-kit.spec.ts`, `entities/entity-members.spec.ts` |
| admin can create a configured root and descendant entities with constrained child options | Ported | `entities/entities-workspace.spec.ts` |
| entity creation validates lifecycle windows and max members before submit | Ported | `entities/entities-workspace.spec.ts`, `entities/entity-governance.spec.ts` |
| admin can add a user to a new child entity and manage that access from the user workspace | Ported | `entities/entity-members.spec.ts`, `users/user-memberships.spec.ts` |
| admin can inspect the hierarchy and edit an entity description before restoring it | Ported | `entities/entities-workspace.spec.ts` |
| entity members open the canonical user access workspace | Ported | `entities/entities-workspace.spec.ts` |
| admin can switch root scope and inspect the second organization hierarchy | Ported | `entities/entities-workspace.spec.ts` |
| admin can create and edit an entity-scoped role from the roles tab | Replaced | Entity roles are created in Roles (`roles/role-type-scope.spec.ts`); entities have no Roles tab |
| admin can archive a root entity | Ported | `entities/entities-workspace.spec.ts` |
| admin can move a child entity under a new parent | Ported | `entities/entities-workspace.spec.ts` |
| admin can promote a child entity to an organization root | Not ported | Built ("Top level", superusers); no spec yet |
| admin can invite a member from members and access and verify it in users | Partial | Invitations with an entity are covered from Users (`users/user-invite.spec.ts`, `auth/passwordless-verify.spec.ts`) |
| admin can inspect entity activity and open filtered Audit | Ported | `entities/entity-activity.spec.ts` |
| root-scoped admin is locked to one root scope and can inspect nested entities | Ported | `entities/entity-scope.spec.ts` |
| east coast admin stays locked to ACME and cannot manage structure or memberships | Not ported | Needs subtree-scoped admins in the seed (F-037, backend) |
| summit admin stays locked to the second root and cannot discover ACME entities | Ported | `app/persona-matrix.spec.ts`, `entities/entity-scope.spec.ts` |

### Roles, permissions and settings

| React test | Status | Nuxt coverage |
|---|---|---|
| admin can inspect seeded custom permission and ABAC details | Ported | `app/abac-conditions.spec.ts` |
| admin can create, edit, and delete a custom permission | Ported | `permissions/permissions-workspace.spec.ts` (archive) |
| admin can create, edit, and delete permission ABAC artifacts | Ported | `app/abac-conditions.spec.ts` |
| permission admin can manage custom permissions without superuser access | Ported | `app/persona-matrix.spec.ts`, `app/abac-conditions.spec.ts` |
| superuser can read the roles workspace and open a role details page | Ported | `app/detail-navigation.spec.ts` |
| admin can inspect seeded role types and ABAC details | Ported | `roles/roles-workspace.spec.ts`, `app/abac-conditions.spec.ts` |
| admin can create and delete a root-scoped role | Ported | `roles/role-type-scope.spec.ts`, `roles/roles-workspace.spec.ts` |
| admin can create, edit, and delete ABAC artifacts on a custom role | Partial | The editor is shared; create, edit and delete run on a permission, the role editor's rendering on a role (`app/abac-conditions.spec.ts`) |
| regional admin can manage ACME-scoped roles but cannot create globals or cross-root roles | Replaced | The organization admin (`roles/org-admin-roles.spec.ts`); the seeded regional admin is global (F-041, backend) |
| auditor can inspect roles but not mutate them | Ported | `app/persona-matrix.spec.ts` |
| admin can update entity type defaults | Ported | `settings/settings-config.spec.ts` (saved to the backend and restored) |
| non-superuser can inspect but not save entity type configuration | Not ported | No spec yet |

### Users

| React test | Status | Nuxt coverage |
|---|---|---|
| admin can inspect users and edit a profile field before restoring it | Ported | `users/user-profile.spec.ts`, `users/users-workspace.spec.ts` |
| admin can filter invited users and resend an invitation | Ported | `users/users-list.spec.ts`, `users/user-lifecycle.spec.ts` |
| admin sees an error toast when inviting an existing user | Replaced | The taken e-mail lands on its field (`app/api-errors.spec.ts`) |
| admin can create a user with a password and land on user details | Ported | `users/users-workspace.spec.ts` |
| admin can invite a user with superuser access | Not ported | No spec yet |
| live invite-accept completes via fixture token capture | Ported | `auth/passwordless-verify.spec.ts` |
| live invite mail is accepted by the mail provider, then invite-accept works | Out of scope | Needs a real mail provider |
| admin can grant and revoke superuser access from user details | Ported | `users/user-lifecycle.spec.ts` |
| admin can assign and remove a direct account role | Ported | `users/user-roles.spec.ts` |
| admin can edit a direct role membership validity window | Ported | `users/user-roles.spec.ts` |
| admin can revoke another user's personal API key from user details | Ported | `users/user-api-keys.spec.ts` |
| admin can list and revoke another user's active sessions | Ported | `users/user-sessions.spec.ts` |
| admin can check a user permission in entity context | Partial | `users/user-access.spec.ts` (Check access); the backend ignores the entity (F-239) |
| admin can discover orphaned users and open them for reassignment | Ported | `users/users-list.spec.ts`, `users/user-memberships.spec.ts` |
| admin can open Audit from user History with subject filter | Ported | `users/user-history.spec.ts` |
| admin can open Audit from user History as actor | Ported | `users/user-history.spec.ts` |
| admin can retained-delete a user, review lifecycle history, and restore identity-only | Ported | `users/users-workspace.spec.ts`, `users/user-lifecycle.spec.ts` |
| auditor can inspect user detail but cannot mutate it | Ported | `app/persona-matrix.spec.ts` |
| team lead can inspect users but cannot invite or mutate them | Not ported | No team-lead persona in the seed (F-243, backend) |

Spec paths in these tables are relative to `e2e/`, except `test/unit/…`.
