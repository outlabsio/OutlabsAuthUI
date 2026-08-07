import { useQuery } from '@pinia/colada'
import type { FormSubmitEvent } from '@nuxt/ui'
import { usersListQuery, useCreateUser, useDeleteUser, useUpdateUser } from '~/queries/users'
import type { CreateUserSchema, UpdateUserSchema } from '~/schemas/user'
import { getApiErrorMessage } from '~/api/client'
import type { User, UsersListFilters } from '~/types/user'

// Feature logic for the users workspace (list + create/edit/delete). The SFC binds this and
// owns pure display config (columns, status colours); no queries/handlers in the template.

export function useUsersWorkspace() {
  const toast = useToast()
  const { hasPermission } = useAuth()
  const canCreate = computed(() => hasPermission('user:create'))

  const filters = reactive<UsersListFilters>({ page: 1, limit: 20, search: '' })
  // Gate the fetch on the read permission too, not just the render — a denied actor never fires
  // the guaranteed-403 list call. AppPermissionGate shows the same verdict in-place.
  const { data, status, error, refetch } = useQuery(() => ({ ...usersListQuery({ ...filters }), enabled: hasPermission('user:read') }))
  const rows = computed<User[]>(() => data.value?.items ?? [])
  const total = computed(() => data.value?.total ?? 0)
  const errorMessage = computed(() => getApiErrorMessage(error.value))

  watch(() => filters.search, () => {
    filters.page = 1
  })

  function rowMenu(user: User) {
    return [
      { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openEdit(user) },
      { label: 'Delete', icon: 'i-lucide-trash', color: 'error' as const, onSelect: () => openDelete(user) }
    ]
  }

  // --- Create ---
  const createOpen = ref(false)
  const createState = reactive<Partial<CreateUserSchema>>({ email: '', password: '', first_name: '', last_name: '', is_superuser: false })
  const createUser = useCreateUser()
  const creating = ref(false)

  async function onCreate(event: FormSubmitEvent<CreateUserSchema>) {
    creating.value = true
    try {
      await createUser.mutateAsync(event.data)
      toast.add({ title: 'User created', color: 'success', icon: 'i-lucide-check' })
      createOpen.value = false
      Object.assign(createState, { email: '', password: '', first_name: '', last_name: '', is_superuser: false })
      await refetch()
    } catch (err) {
      toast.add({ title: 'Could not create user', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
    } finally {
      creating.value = false
    }
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
    if (!editTarget.value) return
    saving.value = true
    try {
      await updateUser.mutateAsync({
        userId: editTarget.value.id,
        input: {
          first_name: event.data.first_name,
          last_name: event.data.last_name,
          phone: event.data.phone === '' ? null : event.data.phone
        }
      })
      toast.add({ title: 'User updated', color: 'success', icon: 'i-lucide-check' })
      editOpen.value = false
      await refetch()
    } catch (err) {
      toast.add({ title: 'Could not update user', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
    } finally {
      saving.value = false
    }
  }

  // --- Delete ---
  const deleteOpen = ref(false)
  const deleteTarget = ref<User | null>(null)
  const deleteUser = useDeleteUser()
  const deleting = ref(false)

  function openDelete(user: User) {
    deleteTarget.value = user
    deleteOpen.value = true
  }

  async function onConfirmDelete() {
    if (!deleteTarget.value) return
    deleting.value = true
    try {
      await deleteUser.mutateAsync(deleteTarget.value.id)
      toast.add({ title: 'User deleted', color: 'success', icon: 'i-lucide-check' })
      deleteOpen.value = false
      await refetch()
    } catch (err) {
      toast.add({ title: 'Could not delete user', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
    } finally {
      deleting.value = false
    }
  }

  return {
    canCreate,
    filters,
    rows,
    total,
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
