import type { MaybeRefOrGetter, Ref } from 'vue'
import { useUpdatePermission } from '~/queries/permissions'
import type { UpdatePermissionSchema } from '~/schemas/permission'
import type { ActionError } from '~/composables/useApiAction'
import type { Permission } from '~/types/permission'

// The permission Edit dialog behind <AppPermissionEditDialog> (F-019): display name,
// description, tags and the active switch of a custom permission (system permissions are
// read-only, see usePermissionActions). Filled from the record each time it opens; only changed
// fields are sent (useDirtyPatch), so an untouched status is never written. Called by the
// component itself, so useDialogForm('permissionDialog') resolves its own dialog.
export function usePermissionEditDialog(target: MaybeRefOrGetter<Permission | null>, open: Ref<boolean>) {
  const { run } = useApiAction()
  const form = useDialogForm('permissionDialog')
  const error = ref<ActionError | null>(null)
  const state = reactive<UpdatePermissionSchema>({ display_name: '', description: '', tags: [], is_active: true })
  const changes = useDirtyPatch(state, s => ({
    display_name: s.display_name.trim(),
    description: s.description.trim(),
    tags: [...s.tags],
    is_active: s.is_active
  }))

  watch(open, (isOpen) => {
    const permission = toValue(target)
    if (!isOpen || !permission) return
    Object.assign(state, {
      display_name: permission.display_name,
      description: permission.description ?? '',
      tags: [...(permission.tags ?? [])],
      is_active: permission.status === 'active'
    })
    changes.snapshot()
    error.value = null
  }, { immediate: true })

  // What the status switch does, said next to it once it differs from the stored status.
  const statusEffect = computed(() => {
    const permission = toValue(target)
    if (!permission || !changes.changed.value.includes('is_active')) return null
    return state.is_active
      ? { color: 'info' as const, title: 'Activating this permission', description: 'Every role that includes it grants it again, and it can be added to roles.' }
      : { color: 'warning' as const, title: 'Deactivating this permission', description: 'Every role that includes it stops granting it until it is active again. It can\'t be added to roles meanwhile.' }
  })

  const updatePermission = useUpdatePermission()
  async function onSubmit() {
    const permission = toValue(target)
    if (!permission) return
    if (!changes.dirty.value) {
      open.value = false
      return
    }
    const res = await run(() => updatePermission.mutateAsync({ permissionId: permission.id, input: changes.patch.value }), {
      success: 'Permission updated',
      error: 'Could not update permission',
      form,
      inline: error,
      onNotFound: () => {
        open.value = false
      }
    })
    if (res.ok) open.value = false
  }

  return { state, error, dirty: changes.dirty, statusEffect, onSubmit }
}
