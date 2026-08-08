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
  const resourceFilter = ref('all')
  const systemFilter = ref<'all' | 'system' | 'custom'>('all')
  const { data, status, error } = useQuery(() => ({ ...permissionsListQuery({ ...filters }), enabled: hasPermission('permission:read') }))
  const errorMessage = useApiErrorMessage(error)

  const resourceOf = (p: Permission) => p.resource || p.name.split(':')[0] || 'other'

  // Small list returned whole — filter client-side by search + resource + system/custom.
  const rows = computed<Permission[]>(() => {
    const term = search.value.trim().toLowerCase()
    return (data.value?.items ?? []).filter((p) => {
      if (term && !`${p.name} ${p.display_name}`.toLowerCase().includes(term)) return false
      if (resourceFilter.value !== 'all' && resourceOf(p) !== resourceFilter.value) return false
      if (systemFilter.value === 'system' && !p.is_system) return false
      if (systemFilter.value === 'custom' && p.is_system) return false
      return true
    })
  })

  const resourceItems = computed(() => {
    const set = new Set((data.value?.items ?? []).map(resourceOf))
    return [{ label: 'All resources', value: 'all' }, ...[...set].sort().map(r => ({ label: r, value: r }))]
  })
  const systemItems = [
    { label: 'All', value: 'all' as const },
    { label: 'System', value: 'system' as const },
    { label: 'Custom', value: 'custom' as const }
  ]

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
    resourceFilter,
    systemFilter,
    resourceItems,
    systemItems,
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
