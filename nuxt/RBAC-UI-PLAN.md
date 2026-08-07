# RBAC admin UI — plan & status

Living plan for the roles / permissions / membership / user-lifecycle admin UI on the Nuxt port.
Read this + `git log --oneline` on `nuxt` to know exactly where things stand. Companion to
[ARCHITECTURE.md](./ARCHITECTURE.md) (patterns/guardrails) and [PARITY.md](./PARITY.md) (the
React→Nuxt functionality gap list). **When you finish or change a piece here, update this file in the
same commit** — it is the hand-off surface if context is lost.

## Verify recipe
```
npm run typecheck && npm run lint
E2E_API_BASE_URL=http://localhost:8004 \
E2E_ADMIN_EMAIL=admin@acme.com E2E_ADMIN_PASSWORD=Testpass1! \
E2E_AGENT_EMAIL=agent@sf.acme.com E2E_AGENT_PASSWORD=Testpass1! \
npx playwright test --retries=1
```
Dev preview runs on :3001 (CORS allows 3000/3001); Playwright starts its own :3000. Backend on :8004.

**Dev gotcha — cached-module phantoms.** A long-lived preview browser tab that survived many HMR
edits can throw errors from stale cached modules (seen: `defaultPlaceholder.copy is not a function`,
`ENTITIES_ROOT is not defined`) that are NOT in the real code — different tabs show different phantoms
at different `?v=` hashes. Don't chase them; open a brand-new tab (or trust the fresh-server E2E,
which guards console errors in `user-roles.spec.ts`). typecheck/lint/E2E are the source of truth.

## Design decisions (locked)
- **Redesign, don't port** the React layouts — keep the functionality, not the screens.
- **One modal per action.**
- **Roles & permissions are shown/picked ONLY through the shared kit** (never ad-hoc badges or
  `USelectMenu`s) — see ARCHITECTURE "Roles & permissions — the shared kit".
- **Role assignment is two-column**: `AppRolePicker` (left) + a live `AppEffectivePermissions`
  "will grant" panel (right) showing the deduped union of what the selected roles grant.
- **Pickers are built on `UCommandPalette`** (fuzzy search + groups + multi-select, bound via
  `value-key`).
- **Dates use Nuxt UI** (`AppDateField` = `UPopover` + `UCalendar`) — never native
  `<input type="date">`. The popover closes on select via a macrotask (`setTimeout 0`) so a
  surrounding `UModal` isn't dismissed mid-click. (`UInputDate` was tried and rejected — it crashes
  with `defaultPlaceholder.copy is not a function` in this Reka/@internationalized/date combo.)
- **Member/role pools are scoped to the entity's org** (global roles + the entity's root-org roles;
  users scoped to the root). Memberships are org-scoped and the backend rejects cross-org adds.

## The kit (components)
All under `app/components/app/` + `app/composables/`:
- **`usePermissionCatalog`** — single cached permissions query (`limit 1000`); `resolve` a permission
  NAME → rich definition, `groupByResource`, `all`. Always renderable (unknown names split on `:`).
- **`AppPermissionList`** — permission NAMES → grouped-by-resource; compact action badges or
  `detailed` rows. Badge shows the full sub-action (`create_tree`, not `create`).
- **`AppEffectivePermissions`** — the deduped union a set of roles grants (`:roles="Role[]"`),
  rendered via AppPermissionList.
- **`AppPermissionPicker`** — searchable grouped multi-select of permissions (v-model = names).
- **`AppRolePicker`** — searchable multi-select of roles with permission-count chips (v-model =
  ids; `:roles` = the assignable pool the caller scopes).
- **`AppDateField`** — Nuxt UI date field (popover + calendar), v-model = `YYYY-MM-DD` string.

## Status

**Done (committed on `nuxt`):**
- Entity member management — add / edit-access / remove (`17dde11`)
- Kit step 1 — catalog + AppPermissionList; role detail (`a2e943a`)
- Kit step 2 — AppPermissionPicker; role→permission assignment (`4eff1b5`)
- Kit step 3 — AppRolePicker + AppEffectivePermissions; two-column member dialog (`596f232`)
- Kit guardrail in ARCHITECTURE.md (`5e0df0f`)
- Member-dialog internal scroll + AppDateField date pickers — *this pass*

Full E2E: **89/89**. E2E specs: `e2e/entities/entity-members.spec.ts`,
`e2e/roles/role-permissions.spec.ts`.

## Roadmap (remaining, in order)
1. **Kit step 4** — `AppRoleChip` (a role chip whose popover shows that role's permissions via
   AppPermissionList); retrofit the member-row roles and user-detail roles to use it.
2. **User lifecycle (task #11)** on the user-detail page — build order:
   1. ~~**Direct role assignment**~~ — DONE. `useUserDetail` + a manageable **Direct roles** card
      (assign via `AppRolePicker` + `AppEffectivePermissions` with a validity window; remove). Pool
      scoped to the user's org (global + `root_entity_id`). E2E: `e2e/users/user-roles.spec.ts`.
   2. **Invite user** (`invite-user`: email, first/last, entityId, roleIds, isSuperuser) — also
      covers "invite a new user into an entity" (entity-member-invite).
   3. **Change status** (suspend/ban + suspendedUntil + reason) and **admin reset-password**.
   4. **Membership management** (a user's memberships across entities).

## Open refinements (tracked, not yet done)
- **"Include inactive" toggle** on the entity Users card — the members-details endpoint is
  active-only, so a suspended member disappears and can't be un-suspended from the UI.
- **Assignable-at-type filtering** — the role pool is org-scoped but not filtered by a role's
  `assignable_at_types`.
- **Permission picker limit** — catalog fetches `limit 1000` (backend cap); paginate if a real
  deployment exceeds it.

## Where the kit plugs in (consistency map)
| Surface | State |
|---|---|
| Role detail — permissions | `AppPermissionList` (done) |
| Role create/edit — assign permissions | `AppPermissionPicker` (done) |
| Member add/edit — roles + preview | `AppRolePicker` + `AppEffectivePermissions` (done) |
| Member rows / user roles — display | `AppRoleChip` (step 4, todo) |
| User detail — direct role assignment | `AppRolePicker` + `AppEffectivePermissions` (task #11) |
| Any validity window (member/role/invite) | `AppDateField` (this pass) |
