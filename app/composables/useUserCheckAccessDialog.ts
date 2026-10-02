import type { Ref } from 'vue'
import type { FormSubmitEvent } from '@nuxt/ui'
import { useCheckPermissions } from '~/queries/permissions'
import { checkResultRows, type CheckResultRow } from '~/utils/access-grants'
import type { CheckAccessSchema } from '~/schemas/membership'
import type { ActionError } from '~/composables/useApiAction'
import type { User } from '~/types/user'

// Check access (AppUserCheckAccessDialog, F-059): "can this user do X, here?" answered by the
// server's own evaluator (POST /permissions/check, permission:check), including tree permissions
// inherited from ancestors and entity-local roles when an entity is chosen. GET
// /permissions/user/{id} ignores the entity, so it is not used. The answer is RBAC: ABAC
// conditions that depend on a request are not evaluated, and the dialog says so.
//
// The dialog stays open with the answer under the form; changing the question clears it.

export function useUserCheckAccessDialog(user: Ref<User>, open: Ref<boolean>) {
  const { run } = useApiAction()
  const { isEnterprise, isSuperuser, user: actor } = useAuth()
  const form = useDialogForm('checkAccessDialog')
  const error = ref<ActionError | null>(null)
  const check = useCheckPermissions()

  const state = reactive<CheckAccessSchema>({ permissions: [], entityId: '' })
  const results = ref<CheckResultRow[] | null>(null)
  const checkedEntityId = ref<string | null>(null)

  watch(open, (isOpen) => {
    if (!isOpen) return
    Object.assign(state, { permissions: [], entityId: '' })
    results.value = null
    error.value = null
  }, { immediate: true })
  // A changed question has no answer yet.
  watch(() => [state.permissions.join('\n'), state.entityId], () => {
    results.value = null
  })

  // The permission names to choose from: the catalog when this admin can read it; any other
  // name can be typed (a tree or wildcard variant, or a permission the catalog does not list).
  const catalog = usePermissionCatalog()
  const createdNames = ref<string[]>([])
  const permissionItems = computed(() => {
    const names = new Map<string, string | undefined>()
    for (const permission of catalog.all.value) names.set(permission.name, permission.display_name || undefined)
    for (const name of [...createdNames.value, ...state.permissions]) if (!names.has(name)) names.set(name, undefined)
    return [...names.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, description]) => ({ label: name, value: name, description }))
  })
  function addPermission(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    if (!createdNames.value.includes(trimmed)) createdNames.value.push(trimmed)
    if (!state.permissions.includes(trimmed)) state.permissions = [...state.permissions, trimmed]
  }

  // The entity (EnterpriseRBAC): the user's organization, else the admin's; a superuser may
  // search every entity.
  const entityPickerRootId = computed(() => user.value.root_entity_id ?? (isSuperuser.value ? null : actor.value?.root_entity_id ?? null))
  const entityPickerBlocked = computed(() => !isSuperuser.value && !entityPickerRootId.value)

  async function onSubmit(event: FormSubmitEvent<CheckAccessSchema>) {
    const permissions = [...new Set(event.data.permissions.map(name => name.trim()).filter(Boolean))]
    const entityId = isEnterprise.value && event.data.entityId ? event.data.entityId : null
    const res = await run(() => check.mutateAsync({ user_id: user.value.id, permissions, entity_id: entityId }), {
      error: 'Could not check access',
      form,
      inline: error,
      fieldMap: { permissions: 'permissions', entity_id: 'entityId', user_id: null },
      notFoundCodes: ['USER_NOT_FOUND']
    })
    if (!res.ok) return
    checkedEntityId.value = entityId
    results.value = checkResultRows(permissions, res.data.results)
  }

  const allowedCount = computed(() => results.value?.filter(row => row.allowed).length ?? 0)

  return {
    state,
    error,
    results,
    allowedCount,
    checkedEntityId,
    permissionItems,
    permissionsLoading: computed(() => catalog.status.value === 'pending' && catalog.available.value),
    addPermission,
    isEnterprise,
    entityPickerRootId,
    entityPickerBlocked,
    onSubmit
  }
}
