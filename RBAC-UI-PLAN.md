# RBAC admin UI — design decisions and the shared kit

The locked decisions and the shared components behind every surface that shows or picks a role,
a permission or a validity window (roles, permissions, memberships, direct grants, API-key
scopes). Companion to [ARCHITECTURE.md](./ARCHITECTURE.md) (layers and patterns). What is built
and what is still open lives only in [CAPABILITIES.md](./CAPABILITIES.md); this file does not
keep its own status or backlog. When you change a decision or a kit piece, update this file in
the same commit.

Verify with the commands in [AGENTS.md](./AGENTS.md) and the E2E guide in
[e2e/README.md](./e2e/README.md).

**Dev gotcha: cached-module phantoms.** A long-lived dev tab that survived many hot reloads can
throw errors from stale cached modules (seen: `defaultPlaceholder.copy is not a function`,
`ENTITIES_ROOT is not defined`) that are not in the real code. Don't chase them; open a fresh tab.
typecheck, lint and a fresh-server E2E run (its error guard fails on any console error) are the
source of truth.

## Design decisions (locked)
- **Redesign, don't port** the React layouts — keep the functionality, not the screens.
- **One modal per action.**
- **Roles & permissions are shown/picked ONLY through the shared kit** (never ad-hoc badges or
  `USelectMenu`s) — see ARCHITECTURE "Roles & permissions — the shared kit".
- **Role assignment is two-column**: `AppRoleAccessEditor` = the selection as removable chips over
  `AppRolePicker` (left) + a live `AppEffectivePermissions` "will grant" panel (right), both fixed
  height (no splitter), so a dialog's validity and reason fields stay in view.
- **Role and permission pickers are built on `UCommandPalette`** (fuzzy search + groups +
  multi-select, bound via `value-key`); entity pickers are `AppEntityPicker`.
- **Dates use Nuxt UI** (`AppDateField` = `UInputDate` with a trailing `UPopover` + `UCalendar`) —
  never native `<input type="date">`. The popover closes on select via a macrotask (`setTimeout 0`)
  so a surrounding `UModal` isn't dismissed mid-click. (An earlier `UInputDate` attempt crashed with
  `defaultPlaceholder.copy is not a function`: UInputDate's `placeholder` prop is a DateValue, and a
  text placeholder was passed to it. Don't pass one; say "leave empty for no expiry" in help text.)
  A day means the whole day in the admin's time zone (`startOfDayIso` / `endOfDayIso`).
- **Role pools are exactly what the backend accepts** (`useAssignableRoles`): for a membership,
  the roles `GET /roles/entity/{id}` returns (active, assignable at the entity type, system-wide,
  the entity's organization's, or entity-local on the entity or an ancestor); for a direct grant,
  active non-entity-local roles (system-wide + the user's organization). Roles the actor cannot
  delegate are listed disabled with the missing permissions. Users stay scoped to the root.
  Actors without `role:read_tree` get the same rules applied client-side over the role catalog,
  which the backend scope-filters: without global scope they never see system-wide roles, so
  those roles are missing from their membership pools even when they could delegate them
  (backend dependency: a grantable-roles answer readable with `role:read`). A pool the console
  could not load in full says so in the picker footer.
- **Validity windows convert + validate identically everywhere** via `app/utils/validity.ts`
  (`startOfDayIso` / `endOfDayIso` / `toDateInput` / `validityWindowError`) and
  `schemas/common.ts` (`validityWindowShape` + `checkValidityWindow`) — every composable with a
  "valid from/until" pair uses these rather than re-deriving them.
- **A resource endpoint that's active-only by default needs an "include inactive" toggle** the moment
  the UI lets you deactivate something through it — otherwise suspending a row makes it vanish with no
  way to see or undo it. Hit twice (entity members, then direct role memberships); check for this
  whenever a new suspend/status-change action is added to an existing list.

## The kit (components + composables)
All under `app/components/app/` + `app/composables/`:
- **`usePermissionCatalog`** — single cached permissions query (`limit 1000`); `resolve` a permission
  NAME → rich definition, `groupByResource`, `all`. Always renderable (unknown names split on `:`).
- **`useRoleCatalog`** — cached role lookup by id (every page, gated on `canAccess('roles')`);
  `describe(ref)` gives the chip label (payload name, catalog name or "Unknown role").
- **`useAssignableRoles(target)`** — the role pool for a direct or entity grant (see above).
- **`AppRoleAccessEditor`** — chips + picker + preview; `grant="direct"` adds the cross-organization
  warning for system-wide roles.
- **`AppPermissionList`** — permission NAMES → grouped-by-resource; compact action badges or
  `detailed` rows. Badge shows the full sub-action (`create_tree`, not `create`).
- **`AppEffectivePermissions`** — what a set of roles grants (`:roles="Role[]"`), rendered via
  AppPermissionList; flags inactive, entity-only and ABAC-conditioned roles ("Grants up to").
- **`AppPermissionPicker`** — searchable grouped multi-select of permissions (v-model = names).
- **`AppRolePicker`** — searchable multi-select of roles with permission counts and type badges
  (v-model = ids; `:roles` = a `useAssignableRoles` pool; non-delegable roles disabled).
- **`AppRoleChip`** — a role chip (a button) whose popover lists that role's permissions; opens by
  click, tap or keyboard. Use this — never a bare `UBadge` — anywhere a role is displayed.
- **`AppDateField`** — Nuxt UI date field (`UInputDate` + calendar popover), v-model = `YYYY-MM-DD`
  string, `label` names it for assistive technology. See ARCHITECTURE.md, "Forms and dialogs".

Where it's used: role detail (`AppPermissionList`), role create/edit (`AppPermissionPicker`), every
member/role-assignment dialog (`AppRolePicker` + `AppEffectivePermissions`), every role/permission
display anywhere (`AppRoleChip`), every validity window (`AppDateField`). If you're about to add a
new surface that shows or picks a role/permission or a validity window, it should use one of these,
not something ad hoc.

## Open items

See [CAPABILITIES.md](./CAPABILITIES.md) (Access, Roles, Permissions). Backend-dependent gaps
there name their finding; console follow-ups are listed in its Notes column.

## History

Every milestone (the kit, user lifecycle, entity governance, role types and scope, permission
CRUD, API-key options, validity windows) is in `git log --oneline` with descriptive messages and
matching E2E specs; that is more reliable than a hand-kept roadmap.
