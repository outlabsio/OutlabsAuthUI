import { useQuery } from '@pinia/colada'
import type { FormSubmitEvent } from '@nuxt/ui'
import { permissionsListQuery, useCreatePermission, useDeletePermission } from '~/queries/permissions'
import type { CreatePermissionSchema } from '~/schemas/permission'
import type { Permission, PermissionsListFilters } from '~/types/permission'

// Feature logic for the permissions workspace. The list is small and returned whole, so search
// filters client-side. Shared CRUD behavior (create gate, `run`, delete flow) from useResourceCrud.

export function usePermissionsWorkspace() {
  const { hasPermission } = useAuth()

  const filters = reactive<PermissionsListFilters>({ page: 1, limit: 1000 })
  const search = ref('')
  const { data, status, error } = useQuery(() => ({ ...permissionsListQuery({ ...filters }), enabled: hasPermission('permission:read') }))
  const errorMessage = useApiErrorMessage(error)

  // Small list returned whole — filter client-side by name / display_name.
  const rows = computed<Permission[]>(() => {
    const all = data.value?.items ?? []
    const term = search.value.trim().toLowerCase()
    if (!term) return all
    return all.filter(p => `${p.name} ${p.display_name}`.toLowerCase().includes(term))
  })

  const crud = useResourceCrud<Permission>({ noun: 'permission', createPermission: 'permission:create', deleteMutation: useDeletePermission() })

  function rowMenu(permission: Permission) {
    return [
      { label: 'Delete', icon: 'i-lucide-trash', color: 'error' as const, onSelect: () => crud.openDelete(permission) }
    ]
  }

  // --- Create ---
  const createOpen = ref(false)
  const createState = reactive<Partial<CreatePermissionSchema>>({ name: '', display_name: '', description: '' })
  const createPermission = useCreatePermission()
  const creating = ref(false)
  async function onCreate(event: FormSubmitEvent<CreatePermissionSchema>) {
    creating.value = true
    const res = await crud.run(() => createPermission.mutateAsync(event.data), { success: 'Permission created', error: 'Could not create permission' })
    if (res.ok) {
      createOpen.value = false
      Object.assign(createState, { name: '', display_name: '', description: '' })
    }
    creating.value = false
  }

  return {
    canCreate: crud.canCreate,
    search,
    rows,
    status,
    errorMessage,
    rowMenu,
    createOpen,
    createState,
    creating,
    onCreate,
    deleteOpen: crud.deleteOpen,
    deleteTarget: crud.deleteTarget,
    deleting: crud.deleting,
    onConfirmDelete: crud.confirmDelete
  }
}
