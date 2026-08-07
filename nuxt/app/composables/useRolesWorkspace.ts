import { useQuery } from '@pinia/colada'
import type { FormSubmitEvent } from '@nuxt/ui'
import { rolesListQuery, useCreateRole, useDeleteRole, useUpdateRole } from '~/queries/roles'
import type { CreateRoleSchema, UpdateRoleSchema } from '~/schemas/role'
import { getApiErrorMessage } from '~/api/client'
import type { Role, RolesListFilters } from '~/types/role'

// Feature logic for the roles workspace. Shared CRUD behavior from useResourceCrud; the query +
// create/edit forms are per-resource.

export function useRolesWorkspace() {
  const { hasPermission } = useAuth()

  const filters = reactive<RolesListFilters>({ page: 1, limit: 100, search: '' })
  const { data, status, error, refetch } = useQuery(() => ({ ...rolesListQuery({ ...filters }), enabled: hasPermission('role:read') }))
  const rows = computed<Role[]>(() => data.value?.items ?? [])
  const errorMessage = computed(() => getApiErrorMessage(error.value))

  const crud = useResourceCrud<Role>({ noun: 'role', refetch, createPermission: 'role:create', deleteMutation: useDeleteRole() })

  function rowMenu(role: Role) {
    return [
      { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openEdit(role) },
      { label: 'Delete', icon: 'i-lucide-trash', color: 'error' as const, onSelect: () => crud.openDelete(role) }
    ]
  }

  // --- Create ---
  const createOpen = ref(false)
  const createState = reactive<Partial<CreateRoleSchema>>({ name: '', display_name: '', description: '', is_global: false })
  const createRole = useCreateRole()
  const creating = ref(false)
  async function onCreate(event: FormSubmitEvent<CreateRoleSchema>) {
    creating.value = true
    const ok = await crud.run(() => createRole.mutateAsync({
      name: event.data.name,
      display_name: event.data.display_name,
      description: event.data.description,
      is_global: event.data.is_global ?? false,
      permissions: []
    }), { success: 'Role created', error: 'Could not create role' })
    if (ok) {
      createOpen.value = false
      Object.assign(createState, { name: '', display_name: '', description: '', is_global: false })
    }
    creating.value = false
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
    const target = editTarget.value
    if (!target) return
    saving.value = true
    const ok = await crud.run(() => updateRole.mutateAsync({
      roleId: target.id,
      input: { display_name: event.data.display_name, description: event.data.description }
    }), { success: 'Role updated', error: 'Could not update role' })
    if (ok) editOpen.value = false
    saving.value = false
  }

  return {
    canCreate: crud.canCreate,
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
    onSaveEdit,
    deleteOpen: crud.deleteOpen,
    deleteTarget: crud.deleteTarget,
    deleting: crud.deleting,
    onConfirmDelete: crud.confirmDelete
  }
}
