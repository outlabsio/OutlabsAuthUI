import { useQuery } from '@pinia/colada'
import type { FormSubmitEvent } from '@nuxt/ui'
import { permissionsListQuery, useCreatePermission, useDeletePermission } from '~/queries/permissions'
import type { CreatePermissionSchema } from '~/schemas/permission'
import { getApiErrorMessage } from '~/api/client'
import type { Permission, PermissionsListFilters } from '~/types/permission'

// Feature logic for the permissions workspace (list + create + delete). The list is small and
// returned whole, so search filters client-side. The SFC binds this and owns display config.

export function usePermissionsWorkspace() {
  const toast = useToast()
  const { hasPermission } = useAuth()
  const canCreate = computed(() => hasPermission('permission:create'))

  const filters = reactive<PermissionsListFilters>({ page: 1, limit: 1000 })
  const search = ref('')
  const { data, status, error, refetch } = useQuery(() => ({ ...permissionsListQuery({ ...filters }), enabled: hasPermission('permission:read') }))
  const errorMessage = computed(() => getApiErrorMessage(error.value))

  // Small list returned whole — filter client-side by name / display_name.
  const rows = computed<Permission[]>(() => {
    const all = data.value?.items ?? []
    const term = search.value.trim().toLowerCase()
    if (!term) return all
    return all.filter(p => `${p.name} ${p.display_name}`.toLowerCase().includes(term))
  })

  function rowMenu(permission: Permission) {
    return [
      { label: 'Delete', icon: 'i-lucide-trash', color: 'error' as const, onSelect: () => openDelete(permission) }
    ]
  }

  // --- Create ---
  const createOpen = ref(false)
  const createState = reactive<Partial<CreatePermissionSchema>>({ name: '', display_name: '', description: '' })
  const createPermission = useCreatePermission()
  const creating = ref(false)

  async function onCreate(event: FormSubmitEvent<CreatePermissionSchema>) {
    creating.value = true
    try {
      await createPermission.mutateAsync(event.data)
      toast.add({ title: 'Permission created', color: 'success', icon: 'i-lucide-check' })
      createOpen.value = false
      Object.assign(createState, { name: '', display_name: '', description: '' })
      await refetch()
    } catch (err) {
      toast.add({ title: 'Could not create permission', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
    } finally {
      creating.value = false
    }
  }

  // --- Delete (custom permissions only; system permissions are backend-protected) ---
  const deleteOpen = ref(false)
  const deleteTarget = ref<Permission | null>(null)
  const deletePermission = useDeletePermission()
  const deleting = ref(false)

  function openDelete(permission: Permission) {
    deleteTarget.value = permission
    deleteOpen.value = true
  }

  async function onConfirmDelete() {
    if (!deleteTarget.value) return
    deleting.value = true
    try {
      await deletePermission.mutateAsync(deleteTarget.value.id)
      toast.add({ title: 'Permission deleted', color: 'success', icon: 'i-lucide-check' })
      deleteOpen.value = false
      await refetch()
    } catch (err) {
      toast.add({ title: 'Could not delete permission', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
    } finally {
      deleting.value = false
    }
  }

  return {
    canCreate,
    search,
    rows,
    status,
    errorMessage,
    rowMenu,
    createOpen,
    createState,
    creating,
    onCreate,
    deleteOpen,
    deleteTarget,
    deleting,
    onConfirmDelete
  }
}
