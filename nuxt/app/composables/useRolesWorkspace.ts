import { useQuery } from '@pinia/colada'
import type { FormSubmitEvent } from '@nuxt/ui'
import { rolesListQuery, useCreateRole, useDeleteRole, useUpdateRole } from '~/queries/roles'
import { entitiesListQuery } from '~/queries/entities'
import type { CreateRoleSchema, UpdateRoleSchema } from '~/schemas/role'
import type { Role, RolesListFilters, RoleType } from '~/types/role'

// Feature logic for the roles workspace. Shared CRUD behavior from useResourceCrud; the query +
// create/edit forms are per-resource. The create form models a role's TYPE (global / root / entity)
// which maps to is_global + root_entity_id + scope_entity_id on submit.

const ROLE_TYPE_ITEMS: { label: string, value: RoleType }[] = [
  { label: 'Global (system-wide)', value: 'global' },
  { label: 'Organization (root)', value: 'root' },
  { label: 'Entity-local', value: 'entity' }
]
const SCOPE_ITEMS = [
  { label: 'Hierarchy (entity + descendants)', value: 'hierarchy' as const },
  { label: 'Entity only', value: 'entity_only' as const }
]
const STATUS_ITEMS = [
  { label: 'Active', value: 'active' as const },
  { label: 'Inactive', value: 'inactive' as const }
]

const parseTypes = (text: string) => text.split(',').map(t => t.trim()).filter(Boolean)

export function useRolesWorkspace() {
  const { hasPermission } = useAuth()

  const filters = reactive<RolesListFilters>({ page: 1, limit: 100, search: '' })
  const { data, status, error } = useQuery(() => ({ ...rolesListQuery({ ...filters }), enabled: hasPermission('role:read') }))
  const rows = computed<Role[]>(() => data.value?.items ?? [])
  const errorMessage = useApiErrorMessage(error)

  const crud = useResourceCrud<Role>({ noun: 'role', createPermission: 'role:create', deleteMutation: useDeleteRole() })

  function rowMenu(role: Role) {
    return [
      { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openEdit(role) },
      { label: 'Delete', icon: 'i-lucide-trash', color: 'error' as const, onSelect: () => crud.openDelete(role) }
    ]
  }

  // Entities for the root / scope pickers (loaded when the actor can create roles).
  const { data: entitiesData } = useQuery(() => ({ ...entitiesListQuery({ limit: 1000 }), enabled: crud.canCreate.value }))
  const rootEntityOptions = computed(() => (entitiesData.value?.items ?? [])
    .filter(e => !e.parent_entity_id)
    .map(e => ({ label: e.display_name, value: e.id })))
  const entityOptions = computed(() => (entitiesData.value?.items ?? []).map(e => ({ label: e.display_name, value: e.id })))

  // --- Create ---
  const createOpen = ref(false)
  const createState = reactive<Partial<CreateRoleSchema> & { assignable_at_types_text: string }>({
    role_type: 'global',
    name: '',
    display_name: '',
    description: '',
    root_entity_id: '',
    scope_entity_id: '',
    scope: 'hierarchy',
    status: 'active',
    is_auto_assigned: false,
    assignable_at_types_text: '',
    permissions: []
  })
  function resetCreate() {
    Object.assign(createState, {
      role_type: 'global', name: '', display_name: '', description: '', root_entity_id: '', scope_entity_id: '',
      scope: 'hierarchy', status: 'active', is_auto_assigned: false, assignable_at_types_text: '', permissions: []
    })
  }
  const createRole = useCreateRole()
  const creating = ref(false)
  async function onCreate(event: FormSubmitEvent<CreateRoleSchema>) {
    creating.value = true
    const isRoot = event.data.role_type === 'root'
    const isEntity = event.data.role_type === 'entity'
    const res = await crud.run(() => createRole.mutateAsync({
      name: event.data.name,
      display_name: event.data.display_name,
      description: event.data.description,
      permissions: event.data.permissions ?? [],
      is_global: event.data.role_type === 'global',
      root_entity_id: isRoot ? event.data.root_entity_id : null,
      scope_entity_id: isEntity ? event.data.scope_entity_id : null,
      scope: event.data.scope,
      is_auto_assigned: isEntity ? event.data.is_auto_assigned : false,
      status: event.data.status,
      assignable_at_types: parseTypes(createState.assignable_at_types_text)
    }), { success: 'Role created', error: 'Could not create role' })
    if (res.ok) {
      createOpen.value = false
      resetCreate()
    }
    creating.value = false
  }

  // --- Edit --- (name + root/scope entity are fixed after creation)
  const editOpen = ref(false)
  const editTarget = ref<Role | null>(null)
  const editRoleType = ref<RoleType>('global')
  const editState = reactive<UpdateRoleSchema & { assignable_at_types_text: string }>({
    display_name: '', description: '', scope: 'hierarchy', status: 'active', is_auto_assigned: false, assignable_at_types_text: '', permissions: []
  })
  const updateRole = useUpdateRole()
  const saving = ref(false)
  function openEdit(role: Role) {
    editTarget.value = role
    editRoleType.value = role.is_global ? 'global' : (role.scope_entity_id ? 'entity' : 'root')
    Object.assign(editState, {
      display_name: role.display_name,
      description: role.description ?? '',
      scope: role.scope,
      status: role.status === 'active' ? 'active' : 'inactive',
      is_auto_assigned: role.is_auto_assigned,
      assignable_at_types_text: (role.assignable_at_types ?? []).join(', '),
      permissions: [...role.permissions]
    })
    editOpen.value = true
  }
  async function onSaveEdit(event: FormSubmitEvent<UpdateRoleSchema>) {
    const target = editTarget.value
    if (!target) return
    saving.value = true
    const res = await crud.run(() => updateRole.mutateAsync({
      roleId: target.id,
      input: {
        display_name: event.data.display_name,
        description: event.data.description,
        permissions: event.data.permissions,
        status: event.data.status,
        scope: editRoleType.value === 'global' ? undefined : event.data.scope,
        is_auto_assigned: editRoleType.value === 'entity' ? event.data.is_auto_assigned : false,
        assignable_at_types: parseTypes(editState.assignable_at_types_text)
      }
    }), { success: 'Role updated', error: 'Could not update role' })
    if (res.ok) editOpen.value = false
    saving.value = false
  }

  return {
    canCreate: crud.canCreate,
    filters,
    rows,
    status,
    errorMessage,
    rowMenu,
    roleTypeItems: ROLE_TYPE_ITEMS,
    scopeItems: SCOPE_ITEMS,
    statusItems: STATUS_ITEMS,
    rootEntityOptions,
    entityOptions,
    createOpen,
    createState,
    creating,
    onCreate,
    editOpen,
    editTarget,
    editRoleType,
    editState,
    saving,
    onSaveEdit,
    deleteOpen: crud.deleteOpen,
    deleteTarget: crud.deleteTarget,
    deleting: crud.deleting,
    onConfirmDelete: crud.confirmDelete
  }
}
