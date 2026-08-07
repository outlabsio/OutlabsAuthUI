# React → Nuxt parity gaps (forms & management flows)

What the React app (`src/features/**`) can do that the Nuxt port (`nuxt/app/**`) can't yet —
focused on **forms and create/manage options**, since that's where the port is thinnest. This is a
planning list, not a spec: **we will redesign the layouts** (the React forms are functionally rich
but their layouts aren't the target), so treat each item as "functionality to add," not "port the
React screen."

Nearly everything here is **frontend-only work**: the React app already calls these backend
endpoints, so the API exists — the gap is the Nuxt form + wiring. Backend caveats are noted where
they matter.

Rough priority: **P1** = core admin can't do it at all today; **P2** = important option missing on
an existing form; **P3** = polish / edge.

---

## Already at parity (not gaps)
- **ABAC conditions + groups** — Nuxt role and permission detail pages render the editable
  `AppAbacConditions` (attribute/operator/valueType/value/description + AND/OR groups). Matches the
  React `role-condition` / `permission-condition` / `abac` schemas.
- **Auth flows** — login, magic-link, access-code, forgot/reset password, accept-invite, OAuth.
- **Users status filter** — active/invited/suspended/banned/deleted (just added).

---

## Entities — the biggest gap

**Create/edit entity form — missing fields** (React `entity-form.schema`):
- **P2 Validity window** — `validFrom` / `validUntil` (datetimes; "until ≥ from" validation). Both create + edit.
- **P2 `maxMembers`** — cap on entity membership. Both create + edit.
- **P3 `status` on create** — Nuxt sets status only on edit; React sets it at create too.
- **P3 `allowedChildTypes` as a tag input** — Nuxt uses a comma-separated text box; React uses tag chips (normalized). Same data, nicer input.

**Whole dialogs/flows missing:**
- **~~P1 Root governance~~ — DONE.** A dedicated **Governance** dialog on the entity detail: allowed
  child classes/types, **max members**, and **child naming rules** — `child_name_pattern`,
  `child_display_name_pattern`, `child_slug_pattern` (each regex-validated) + `child_naming_guidance`.
  Child governance moved out of Edit into this dialog. E2E: `e2e/entities/entity-governance.spec.ts`.
- **~~P1 Member management~~ — DONE.** The Users card now manages members: **Add member** (in-org
  user + roles + status + validity window + reason), **Edit access** (roles/status/validity/reason,
  PATCH), and **Remove** (DELETE), wired to `/memberships` with a root-org-scoped user picker.
  E2E: `e2e/entities/entity-members.spec.ts`. The role step now uses the shared kit:
  **`AppRolePicker`** (searchable, permission-count chips) beside a live **`AppEffectivePermissions`**
  two-column preview, with the pool scoped to **global + the entity's root-org roles**. Refinements:
  - **Assignable-at-type filtering** — the role pool is org-scoped but not yet filtered by a role's
    `assignable_at_types` (a role may be limited to certain entity types).
  - **No "include inactive" view** — the details endpoint is active-only, so a suspended member
    disappears from the card and can't be un-suspended from the UI. Add an include-inactive toggle
    (+ show `effective_status`) so suspend is reversible.
  - Still missing: **inviting a *new* user** into the entity (`entity-member-invite`) — folded into
    the user-lifecycle **invite** flow (P1, next).
- **P2 Entity activity panel** (`entity-activity-panel`) — per-entity audit/activity feed on the detail. Absent in Nuxt.

## Memberships — no management UI
- **P1** React has a membership-access form (entityId, roleIds, status, validity window, reason) to manage a user's memberships across entities. Nuxt only shows a read-only members card on an entity; there's no membership management surface.

## Users — many management flows missing

**Create form — missing fields** (`create-user.schema`): **P2 `confirmPassword`** (confirm), **P2 `rootEntityId`** (assign root org at creation).

**Whole dialogs/flows missing:**
- **~~P1 Invite user~~ — DONE.** An "Invite" action on the users page emails an invitation
  (`POST /auth/invite`): email, first/last, optional **entity** (attaches a membership) with roles
  (scoped to that entity's org via `AppRolePicker` + `AppEffectivePermissions`) or direct account
  roles when no entity, plus superuser. This also covers inviting a *new* user into an entity
  (the entity-member-invite gap). E2E: `e2e/users/user-invite.spec.ts`.
- **~~P1 Change status~~ — DONE.** User-detail **Actions -> Change status**: active/suspended/banned
  + `suspended_until` (shown for suspensions) + reason (`PATCH /users/{id}/status`).
- **~~P1 Reset password~~ — DONE.** User-detail **Actions -> Reset password**: new + confirm
  (`PATCH /users/{id}/password`). Both E2E: `e2e/users/user-status-password.spec.ts`.
- **~~P1 Direct role assignment~~ — DONE.** User detail now has a manageable **Direct roles** card:
  assign (via `AppRolePicker` + live `AppEffectivePermissions`, pool scoped to the user's org) with a
  validity window, and remove. E2E: `e2e/users/user-roles.spec.ts`. (Editing an existing assignment's
  validity — `role-memberships` PATCH — is a later refinement.)
- **~~P1 Membership management~~ — DONE.** A **Memberships** card on the user detail lists the
  entities the user belongs to and manages them: add membership (entity picker scoped to the user's
  org + `AppRolePicker` + `AppEffectivePermissions` + status + validity + reason), edit access,
  remove. Reuses the `/memberships` mutations. E2E: `e2e/users/user-memberships.spec.ts`.
- **P2 Permission check** (`permission-check-dialog`) — "does this user have permission X (here)?" debugging tool. Absent.
- **P3 Delete confirmation** — React requires typing the user's email to confirm; Nuxt is a plain confirm.

**List** (`users-search.schema`): React adds an **orphaned users** view + rootEntity filter; Nuxt has the status filter only. (P2 orphaned view, P3 rootEntity filter.)

**Detail page**: React is tabbed — **details / access / history**. Nuxt = Profile + read-only Roles + Sessions. Missing: **P1 access tab** (role + membership management), **P2 history tab** (per-user audit).

**Profile edit**: React edits email too (P3); Nuxt edits first/last/phone.

## Roles — the create/edit form is very limited

**Create/edit form — missing fields** (`role-form.schema`):
- **~~P1 `permissionNames`~~ — DONE.** Role create/edit now assigns permissions via
  **`AppPermissionPicker`** (searchable, grouped-by-resource CommandPalette multi-select); role
  detail renders them through **`AppPermissionList`**. E2E: `e2e/roles/role-permissions.spec.ts`.
- **~~P1 `roleType`~~ (global / root / entity) — DONE.** A Type selector on the create form drives
  `is_global` + the required entity picker (root organization for `root`, entity for `entity`).
- **~~P2 `rootEntityId` / `scopeEntityId`~~ — DONE.** Conditional pickers (roots-only for root roles,
  all entities for entity-local), required per type. Set at create (not editable, per backend).
- **~~P2 `scope` / `isAutoAssigned` / `assignableAtTypes`~~ — DONE.** Scope select + auto-assign
  (entity-local only) + comma-separated assignable-at types, on create and edit.
- **~~P3 `status`~~ (active/inactive) — DONE** on both forms.

E2E: `e2e/roles/role-type-scope.spec.ts` (root-scoped create).

**List** (`roles-search.schema`): React filters by roleType, scope mode, root, assignable-type, usage (auto/manual), system; Nuxt = search only. (P2)

## Permissions

**Create form** (`permission-form.schema`): React splits **`resource` + `action`** (regex-validated) and adds **`tagsText`** + **isSystem** / **isActive** toggles. Nuxt takes a single combined `name` (resource:action) + display_name + description. (P2 resource/action split + tags; P3 isSystem/isActive.)

**List** (`permissions-search.schema`): React filters by resource, system (all/system/custom), status, tag; Nuxt = client-side search only. (P2)

## API keys

- **Personal key mint** (`api-key-form.schema`): React adds **`ipWhitelistText`** (IP allowlist), **`prefixType`**, `status`, `inheritFromTree`, and an `entityId` scope. Nuxt has name/description/scopes/rateLimit/expiry/unlimited. (P2 IP allowlist + prefix type; P3 the rest.)
- **Machine key** (`system-integration-api-key-form.schema`): React adds **`accessMode`** (full/restricted), **`ipWhitelistText`**, **`prefixType`**, description, status. Nuxt has name/scopes/rateLimit/expiry. (P2)
- **Service account** (`integration-principal-form.schema`): React has a `status` (active/inactive) field; minor. (P3)
- **No key edit** in Nuxt (rotate/revoke only); React can edit a key's status (suspend). (P3)

## Settings
- **~~P1 Entity-type config editor~~ — DONE.** Settings now has a superuser **Edit** on the Entity
  types card: allowed **root** + default **child** types per class (structural / access-group), with
  the at-least-one rules (a child type per class, a root type across classes). `PUT /config/entity-types`.
  E2E: `e2e/settings/settings-config.spec.ts`.

**All P1 gaps are now closed.** What remains is P2 polish + kit step 4 (`AppRoleChip`).

## Account
- **P2 Phone verification** (`verify-phone.schema`) — request + verify a phone code. Absent in Nuxt.
- **P3** React account profile edits email; Nuxt edits first/last/phone.

## Auth
- **P3 Access-code channels** — React supports email / **whatsapp** / **sms** (`access-code.schema` discriminated union); Nuxt is email-only. (Depends on backend channel support.)

---

## Suggested shape of the work
Once we pick targets, each is the now-standard slice: a `queries/` mutation (most endpoints already
exist) → feature composable (`useApiAction` for the mutation) → a redesigned form in the SFC →
typecheck/lint/E2E. Biggest-bang-first order would be: **entity member management + role
permission assignment + user status/reset/invite** (P1 admin can't-do-it-at-all), then the
missing form fields (validity windows, maxMembers, resource/action split, key IP allowlist), then
the list filters and detail tabs.
