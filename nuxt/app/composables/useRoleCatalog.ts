import { useQuery } from '@pinia/colada'
import { rolesListQuery } from '~/queries/roles'
import type { Role } from '~/types/role'

// Shared catalog of roles — id -> Role (with its permission names), so a role summary that carries
// only an id/name (e.g. an entity member's roles, a membership's role_ids) can be resolved to its
// display name + permissions. Backed by one cached Colada query, deduped across every AppRoleChip.
export function useRoleCatalog() {
  const { data } = useQuery(rolesListQuery({ limit: 100 }))
  const all = computed<Role[]>(() => data.value?.items ?? [])
  const roleById = computed(() => new Map(all.value.map(r => [r.id, r])))
  return { all, roleById }
}
