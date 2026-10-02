import type { MaybeRefOrGetter } from 'vue'
import { useRoleConditionFlags } from '~/queries/abac'
import type { Role } from '~/types/role'

// What a set of roles would grant, honestly: the permission union of the roles that can grant
// anything, plus the caveats that make it narrower than it reads (F-178):
// - inactive roles grant nothing (excluded from the union, listed dimmed);
// - entity_only roles apply only at their own entity, not below it;
// - roles with ABAC conditions grant only when the conditions hold.
// Conditions are looked up per selected role (GET /roles/{id}/conditions, role:read) when the
// backend has ABAC, each role once per stale time however often the selection changes.
// System-wide roles are only looked up for superusers: other actors cannot read them (the API
// answers 403).

export type GrantPreviewRow = {
  role: Role
  inactive: boolean
  entityOnly: boolean
  conditional: boolean
}

export function useGrantPreview(roles: MaybeRefOrGetter<readonly Role[]>) {
  const { isEnterprise, isSuperuser, capabilities, canAccess } = useAuth()

  const selected = computed(() => toValue(roles))
  const abacAvailable = computed(() => Boolean(capabilities.value?.features?.abac) && canAccess('roles'))
  const conditionIds = computed(() => selected.value
    .filter(role => (role.status ?? 'active') === 'active')
    .filter(role => isSuperuser.value || roleTypeOf(role) !== 'global')
    .map(role => role.id))
  const { data: conditionalIds } = useRoleConditionFlags(conditionIds, abacAvailable)

  const rows = computed<GrantPreviewRow[]>(() => {
    const conditional = new Set(conditionalIds.value ?? [])
    return selected.value.map((role) => {
      const caveats = roleGrantCaveats(role, { enterprise: isEnterprise.value, conditional: conditional.has(role.id) })
      return { role, ...caveats }
    })
  })

  // Only the roles that need a remark, for the preview's caveat list.
  const caveatRows = computed(() => rows.value.filter(row => row.inactive || row.entityOnly || row.conditional))
  const hasCaveats = computed(() => caveatRows.value.length > 0)

  const names = computed(() => [...new Set(rows.value
    .filter(row => !row.inactive)
    .flatMap(row => row.role.permissions ?? []))].sort())

  return { rows, caveatRows, hasCaveats, names }
}
