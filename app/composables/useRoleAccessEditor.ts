import type { Ref } from 'vue'
import type { Role, RoleReference } from '~/types/role'

// View logic for AppRoleAccessEditor: resolve the selected ids into labelled chips (pool first,
// then the payload's own names, then the catalog; never a raw id), the roles the preview can
// evaluate, and the system-wide roles a DIRECT grant would include (F-009: an active direct
// system-wide role gives its holder access across every organization).

export type RoleAccessGrant = 'direct' | 'membership'

export type RoleAccessSelection = {
  id: string
  label: string
  role: Role | null
}

export function useRoleAccessEditor(input: {
  model: Ref<string[]>
  roles: () => readonly Role[]
  known: () => readonly RoleReference[] | undefined
  grant: () => RoleAccessGrant
}) {
  const { isEnterprise } = useAuth()
  const { describe } = useRoleCatalog()

  const poolById = computed(() => new Map(input.roles().map(role => [role.id, role])))
  const hints = computed(() => new Map((input.known() ?? []).map(reference => [reference.id, reference])))

  const selection = computed<RoleAccessSelection[]>(() => input.model.value.map((id) => {
    const pooled = poolById.value.get(id)
    if (pooled) return { id, label: pooled.display_name || pooled.name, role: pooled }
    const described = describe({ ...hints.value.get(id), id })
    return { id, label: described.label, role: described.role }
  }))

  const selectedRoles = computed(() => selection.value
    .map(item => item.role)
    .filter((role): role is Role => Boolean(role)))

  const systemWideSelected = computed(() => (input.grant() === 'direct' && isEnterprise.value)
    ? selectedRoles.value.filter(role => roleTypeOf(role) === 'global')
    : [])

  const crossTenantWarning = computed(() => {
    const roles = systemWideSelected.value
    if (!roles.length) return null
    const names = roles.map(role => role.display_name || role.name).join(', ')
    const one = roles.length === 1
    return {
      title: 'Access across all organizations',
      description: `${names} ${one ? 'is a system-wide role' : 'are system-wide roles'}. Granted directly, ${one ? 'it gives' : 'they give'} the user access in every organization, not just their own. To limit access to one organization, grant ${one ? 'it' : 'them'} through a membership instead.`
    }
  })

  // Nothing to pick and nothing picked: a dialog may collapse the workspace to one sentence.
  const nothingToOffer = computed(() => input.roles().length === 0 && input.model.value.length === 0)

  function remove(id: string) {
    input.model.value = input.model.value.filter(selected => selected !== id)
  }

  return { selection, selectedRoles, crossTenantWarning, showType: isEnterprise, nothingToOffer, remove }
}
