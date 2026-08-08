import { useQuery } from '@pinia/colada'
import type { FormSubmitEvent } from '@nuxt/ui'
import { usersListQuery, usersOrphanedQuery, useCreateUser, useDeleteUser, useInviteUser, useUpdateUser } from '~/queries/users'
import { entitiesListQuery } from '~/queries/entities'
import { rolesListQuery } from '~/queries/roles'
import type { CreateUserSchema, InviteUserSchema, UpdateUserSchema } from '~/schemas/user'
import type { User, UsersListFilters, UserStatusValue } from '~/types/user'
import type { Role } from '~/types/role'

// Feature logic for the users workspace. Shared CRUD behavior (create gate, `run`, delete flow)
// comes from useResourceCrud; the query + create/edit forms are per-resource.

// The list filters by status, defaulting to Active so soft-deleted users (and other terminal
// states) don't clutter the default roster — the same "active by default" stance as the System
// API Keys panel. "All statuses" (and the specific statuses, incl. Deleted) stay reachable.
type StatusFilter = UserStatusValue | 'all'
const STATUS_ITEMS: { label: string, value: StatusFilter }[] = [
  { label: 'Active', value: 'active' },
  { label: 'Invited', value: 'invited' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Banned', value: 'banned' },
  { label: 'Deleted', value: 'deleted' },
  { label: 'All statuses', value: 'all' }
]

export function useUsersWorkspace() {
  const { hasPermission } = useAuth()

  const filters = reactive<UsersListFilters>({ page: 1, limit: 20, search: '' })
  const statusFilter = ref<StatusFilter>('active')
  const orphanedOnly = ref(false) // orphaned = users with no entity membership (separate endpoint)
  watch([() => filters.search, statusFilter, orphanedOnly], () => {
    filters.page = 1
  })
  const canRead = computed(() => hasPermission('user:read'))
  const { data, status: usersStatus, error } = useQuery(() => ({
    ...usersListQuery({ ...filters, status: statusFilter.value === 'all' ? undefined : statusFilter.value }),
    enabled: canRead.value && !orphanedOnly.value
  }))
  const { data: orphanedData, status: orphanedStatus, error: orphanedError } = useQuery(() => ({
    ...usersOrphanedQuery({ page: filters.page, limit: filters.limit, search: filters.search }),
    enabled: canRead.value && orphanedOnly.value
  }))
  const rows = computed<User[]>(() => (orphanedOnly.value ? orphanedData.value?.items : data.value?.items) ?? [])
  const total = computed(() => (orphanedOnly.value ? orphanedData.value?.total : data.value?.total) ?? 0)
  const status = computed(() => (orphanedOnly.value ? orphanedStatus.value : usersStatus.value))
  const errorMessage = useApiErrorMessage(() => (orphanedOnly.value ? orphanedError.value : error.value))

  const crud = useResourceCrud<User>({ noun: 'user', createPermission: 'user:create', deleteMutation: useDeleteUser() })

  function rowMenu(user: User) {
    return [
      { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openEdit(user) },
      { label: 'Delete', icon: 'i-lucide-trash', color: 'error' as const, onSelect: () => crud.openDelete(user) }
    ]
  }

  // --- Create ---
  const createOpen = ref(false)
  const createState = reactive<Partial<CreateUserSchema>>({ email: '', password: '', first_name: '', last_name: '', is_superuser: false })
  const createUser = useCreateUser()
  const creating = ref(false)
  async function onCreate(event: FormSubmitEvent<CreateUserSchema>) {
    creating.value = true
    const res = await crud.run(() => createUser.mutateAsync(event.data), { success: 'User created', error: 'Could not create user' })
    if (res.ok) {
      createOpen.value = false
      Object.assign(createState, { email: '', password: '', first_name: '', last_name: '', is_superuser: false })
    }
    creating.value = false
  }

  // --- Invite ---
  // Invite by email (no password). Optionally attach an entity membership (entity_id) with roles, or
  // direct account roles (no entity). Roles are scoped to the chosen entity's org (global + its root)
  // — or just global roles when no entity is chosen.
  const inviteOpen = ref(false)
  const inviting = ref(false)
  const inviteState = reactive({ email: '', first_name: '', last_name: '', is_superuser: false, entityId: '', roleIds: [] as string[] })
  const inviteUser = useInviteUser()

  const { data: entitiesData } = useQuery(() => ({ ...entitiesListQuery({ limit: 1000 }), enabled: crud.canCreate.value }))
  const entityOptions = computed(() => (entitiesData.value?.items ?? []).map(e => ({ label: e.display_name, value: e.id })))
  const entityById = computed(() => new Map((entitiesData.value?.items ?? []).map(e => [e.id, e])))
  function rootOf(entityId: string): string | undefined {
    let cur = entityById.value.get(entityId)
    const seen = new Set<string>()
    while (cur?.parent_entity_id && !seen.has(cur.id)) {
      seen.add(cur.id)
      const parent = entityById.value.get(cur.parent_entity_id)
      if (!parent) break
      cur = parent
    }
    return cur?.id
  }
  const inviteRootId = computed(() => (inviteState.entityId ? rootOf(inviteState.entityId) : undefined))

  const { data: inviteGlobalRoles } = useQuery(() => ({ ...rolesListQuery({ limit: 100, isGlobal: true }), enabled: crud.canCreate.value }))
  const { data: inviteRootRoles } = useQuery(() => ({ ...rolesListQuery({ limit: 100, rootEntityId: inviteRootId.value }), enabled: crud.canCreate.value && !!inviteRootId.value }))
  const inviteRolesPool = computed<Role[]>(() => {
    const byId = new Map<string, Role>()
    for (const r of inviteGlobalRoles.value?.items ?? []) byId.set(r.id, r)
    for (const r of inviteRootRoles.value?.items ?? []) byId.set(r.id, r)
    return [...byId.values()]
  })
  const inviteSelectedRoles = computed(() => {
    const byId = new Map(inviteRolesPool.value.map(r => [r.id, r]))
    return inviteState.roleIds.map(id => byId.get(id)).filter((r): r is Role => Boolean(r))
  })
  // The assignable pool changes with the entity — clear stale selections when it switches.
  watch(() => inviteState.entityId, () => {
    inviteState.roleIds = []
  })

  function openInvite() {
    Object.assign(inviteState, { email: '', first_name: '', last_name: '', is_superuser: false, entityId: '', roleIds: [] })
    inviteOpen.value = true
  }
  async function onInvite(event: FormSubmitEvent<InviteUserSchema>) {
    inviting.value = true
    const res = await crud.run(() => inviteUser.mutateAsync({
      email: event.data.email,
      first_name: event.data.first_name || undefined,
      last_name: event.data.last_name || undefined,
      is_superuser: event.data.is_superuser ?? false,
      entity_id: inviteState.entityId || undefined,
      role_ids: inviteState.roleIds.length ? [...inviteState.roleIds] : undefined
    }), { success: 'Invitation sent', error: 'Could not send invitation' })
    if (res.ok) {
      inviteOpen.value = false
      Object.assign(inviteState, { email: '', first_name: '', last_name: '', is_superuser: false, entityId: '', roleIds: [] })
    }
    inviting.value = false
  }

  // --- Edit ---
  const editOpen = ref(false)
  const editTarget = ref<User | null>(null)
  const editState = reactive<UpdateUserSchema>({ first_name: '', last_name: '', phone: '' })
  const updateUser = useUpdateUser()
  const saving = ref(false)
  function openEdit(user: User) {
    editTarget.value = user
    editState.first_name = user.first_name ?? ''
    editState.last_name = user.last_name ?? ''
    editState.phone = user.phone ?? ''
    editOpen.value = true
  }
  async function onSaveEdit(event: FormSubmitEvent<UpdateUserSchema>) {
    const target = editTarget.value
    if (!target) return
    saving.value = true
    const res = await crud.run(() => updateUser.mutateAsync({
      userId: target.id,
      input: {
        first_name: event.data.first_name,
        last_name: event.data.last_name,
        phone: event.data.phone === '' ? null : event.data.phone
      }
    }), { success: 'User updated', error: 'Could not update user' })
    if (res.ok) editOpen.value = false
    saving.value = false
  }

  return {
    canCreate: crud.canCreate,
    filters,
    statusFilter,
    statusItems: STATUS_ITEMS,
    orphanedOnly,
    rows,
    total,
    status,
    errorMessage,
    rowMenu,
    createOpen,
    createState,
    creating,
    onCreate,
    inviteOpen,
    inviteState,
    inviting,
    openInvite,
    onInvite,
    entityOptions,
    inviteRolesPool,
    inviteSelectedRoles,
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
