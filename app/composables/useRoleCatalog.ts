import { useQuery } from '@pinia/colada'
import { rolesCatalogQuery } from '~/queries/roles'
import type { Role, RoleReference } from '~/types/role'

export type DescribedRole = {
  id: string
  // Never a raw id: the payload's or catalog's name; 'Loading role...' while a source that may
  // name it is still loading; else 'Unknown role'.
  label: string
  // False when neither the payload nor the catalog names the role.
  known: boolean
  // Null when the permissions are not visible to this actor (or not loaded yet: see `loading`).
  permissions: string[] | null
  role: Role | null
  // True while the name or the permissions are missing and a source that may supply them (the
  // catalog, or the caller's namePending) is still loading. Until then the role is neither
  // "Unknown" nor "outside the roles you can read".
  loading: boolean
}

// Shared catalog of the roles the actor may read — id -> Role (with its permission names), so a
// role summary that carries only an id (a membership's role_ids) can be resolved to its display
// name + permissions. One cached Colada query (every page), deduped across every AppRoleChip.
//
// Gated on the Roles section's requirement (role:read + the roles surface): an actor without it
// never fires a denied request, and callers fall back to names from their own payloads. The
// backend scope-filters the list, so delegated admins do not see system-wide roles here.
export function useRoleCatalog() {
  const { canAccess } = useAuth()
  const available = computed(() => canAccess('roles'))
  const { data, status, error } = useQuery(() => ({ ...rolesCatalogQuery(), enabled: available.value }))
  const all = computed<Role[]>(() => data.value?.items ?? [])
  const roleById = computed(() => new Map(all.value.map(r => [r.id, r])))
  // True when the deployment has more roles than the catalog loads (see ROLES_MAX_PAGES).
  const truncated = computed(() => Boolean(data.value?.truncated))

  // One display answer for a role reference: names from the payload first (they are what the
  // API says right now), then the catalog; permissions from the payload or the catalog.
  function describe(reference: RoleReference): DescribedRole {
    const role = roleById.value.get(reference.id) ?? null
    const name = reference.display_name || role?.display_name || reference.name || role?.name || ''
    const permissions = reference.permissions ?? role?.permissions ?? null
    const catalogLoading = available.value && status.value === 'pending'
    const nameLoading = !name && (catalogLoading || Boolean(reference.namePending))
    return {
      id: reference.id,
      label: name || (nameLoading ? 'Loading role...' : 'Unknown role'),
      known: Boolean(name),
      permissions,
      role,
      loading: nameLoading || (!permissions && catalogLoading)
    }
  }

  return { available, status, error, all, roleById, truncated, describe }
}
