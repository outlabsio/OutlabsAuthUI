import { useQuery } from '@pinia/colada'
import type { FormSubmitEvent } from '@nuxt/ui'
import { rolesListQuery, useCreateRole, useDeleteRole, useUpdateRole } from '~/queries/roles'
import type { CreateRoleSchema, UpdateRoleSchema } from '~/schemas/role'
import { getApiErrorMessage } from '~/api/client'
import type { Role, RolesListFilters } from '~/types/role'

// Feature logic for the roles workspace (list + create/edit/delete). The SFC binds this and
// owns pure display config (columns, status colours); no queries/handlers in the template.

export function useRolesWorkspace() {
  const toast = useToast()
  const { hasPermission } = useAuth()
  const canCreate = computed(() => hasPermission('role:create'))

  const filters = reactive<RolesListFilters>({ page: 1, limit: 100, search: '' })
  const { data, status, error, refetch } = useQuery(() => ({ ...rolesListQuery({ ...filters }), enabled: hasPermission('role:read') }))
  const rows = computed<Role[]>(() => data.value?.items ?? [])
  const errorMessage = computed(() => getApiErrorMessage(error.value))

  function rowMenu(role: Role) {
    return [
      { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openEdit(role) },
      { label: 'Delete', icon: 'i-lucide-trash', color: 'error' as const, onSelect: () => openDelete(role) }
    ]
  }

  // --- Create ---
  const createOpen = ref(false)
  const createState = reactive<Partial<CreateRoleSchema>>({ name: '', display_name: '', description: '', is_global: false })
  const createRole = useCreateRole()
  const creating = ref(false)

  async function onCreate(event: FormSubmitEvent<CreateRoleSchema>) {
    creating.value = true
    try {
      await createRole.mutateAsync({
        name: event.data.name,
        display_name: event.data.display_name,
        description: event.data.description,
        is_global: event.data.is_global ?? false,
        permissions: []
      })
      toast.add({ title: 'Role created', color: 'success', icon: 'i-lucide-check' })
      createOpen.value = false
      Object.assign(createState, { name: '', display_name: '', description: '', is_global: false })
      await refetch()
    } catch (err) {
      toast.add({ title: 'Could not create role', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
    } finally {
      creating.value = false
    }
  }

  // --- Edit ---
  const editOpen = ref(false)
  const editTarget = ref<Role | null>(null)
  const editState = reactive<UpdateRoleSchema>({ display_name: '', description: '' })
  const updateRole = useUpdateRole()
  const saving = ref(false)

  function openEdit(role: Role) {
    editTarget.value = role
    editState.display_name = role.display_name
    editState.description = role.description ?? ''
    editOpen.value = true
  }

  async function onSaveEdit(event: FormSubmitEvent<UpdateRoleSchema>) {
    if (!editTarget.value) return
    saving.value = true
    try {
      await updateRole.mutateAsync({
        roleId: editTarget.value.id,
        input: { display_name: event.data.display_name, description: event.data.description }
      })
      toast.add({ title: 'Role updated', color: 'success', icon: 'i-lucide-check' })
      editOpen.value = false
      await refetch()
    } catch (err) {
      toast.add({ title: 'Could not update role', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
    } finally {
      saving.value = false
    }
  }

  // --- Delete ---
  const deleteOpen = ref(false)
  const deleteTarget = ref<Role | null>(null)
  const deleteRole = useDeleteRole()
  const deleting = ref(false)

  function openDelete(role: Role) {
    deleteTarget.value = role
    deleteOpen.value = true
  }

  async function onConfirmDelete() {
    if (!deleteTarget.value) return
    deleting.value = true
    try {
      await deleteRole.mutateAsync(deleteTarget.value.id)
      toast.add({ title: 'Role deleted', color: 'success', icon: 'i-lucide-check' })
      deleteOpen.value = false
      await refetch()
    } catch (err) {
      toast.add({ title: 'Could not delete role', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
    } finally {
      deleting.value = false
    }
  }

  return {
    canCreate,
    filters,
    rows,
    status,
    errorMessage,
    rowMenu,
    createOpen,
    createState,
    creating,
    onCreate,
    editOpen,
    editTarget,
    editState,
    saving,
    openEdit,
    onSaveEdit,
    deleteOpen,
    deleteTarget,
    deleting,
    openDelete,
    onConfirmDelete
  }
}
