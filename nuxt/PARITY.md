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
- **P1 Root governance** (`root-governance-form.schema`, `entity-root-governance-dialog`) — for root entities: allowed child classes/types, maxMembers, and **naming rules**: `childNamePattern`, `childDisplayNamePattern`, `childSlugPattern` (regex, validated) + `childNamingGuidance` text. Nothing like it in Nuxt.
- **~~P1 Member management~~ — DONE.** The Users card now manages members: **Add member** (in-org
  user + roles + status + validity window + reason), **Edit access** (roles/status/validity/reason,
  PATCH), and **Remove** (DELETE), wired to `/memberships` with a root-org-scoped user picker.
  E2E: `e2e/entities/entity-members.spec.ts`. Two refinements remain:
  - **Role picker isn't scoped to "assignable at this entity"** — it offers all roles; a cross-org
    role is rejected by the backend (with a clear message) rather than hidden. (User picker *is*
    scoped to the entity's root org.)
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
- **P1 Invite user** (`invite-user`: email, first/last, entityId, roleIds, isSuperuser) — invite vs create-with-password. Absent.
- **P1 Change status** (`update-user-status`: active/suspended/banned + `suspendedUntil` + reason) — suspend/ban a user. Nuxt only soft-deletes.
- **P1 Reset password** (`reset-user-password`: new + confirm) — admin resets a user's password. Absent.
- **P1 Direct role assignment** (`direct-role-assignment`: roleIds + validity window) + edit assignment validity — Nuxt user detail lists roles **read-only**; can't assign.
- **P1 Membership management** (`membership-access-dialog`) — manage a user's entity memberships. Absent.
- **P2 Permission check** (`permission-check-dialog`) — "does this user have permission X (here)?" debugging tool. Absent.
- **P3 Delete confirmation** — React requires typing the user's email to confirm; Nuxt is a plain confirm.

**List** (`users-search.schema`): React adds an **orphaned users** view + rootEntity filter; Nuxt has the status filter only. (P2 orphaned view, P3 rootEntity filter.)

**Detail page**: React is tabbed — **details / access / history**. Nuxt = Profile + read-only Roles + Sessions. Missing: **P1 access tab** (role + membership management), **P2 history tab** (per-user audit).

**Profile edit**: React edits email too (P3); Nuxt edits first/last/phone.

## Roles — the create/edit form is very limited

**Create/edit form — missing fields** (`role-form.schema`):
- **P1 `permissionNames`** — assign permissions to the role. Nuxt **always sends `permissions: []`**; the detail page shows a role's permissions **read-only**, with no way to change them. This is the biggest single role gap.
- **P1 `roleType`** (global / root / entity) — Nuxt only has an `is_global` boolean; can't create root- or entity-scoped roles.
- **P2 `rootEntityId` / `scopeEntityId`** — the owning root / defining entity (required for root/entity roles).
- **P2 `scope`** (hierarchy / entity_only), **`isAutoAssigned`**, **`assignableAtTypes`** — Nuxt detail *shows* auto-assigned + assignable-at read-only, but the form can't set them.
- **P3 `status`** (active/inactive) on the form.

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
- **P1 Entity-type config editor** (`entity-type-config-form.schema`) — edit the allowed structural/access-group **root** and **child** types (tag arrays, with "at least one" rules). Nuxt settings shows this config **read-only**.

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
