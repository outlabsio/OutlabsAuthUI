import { useQuery } from '@pinia/colada'
import type { FormSubmitEvent } from '@nuxt/ui'
import { usersListQuery, useCreateUser, useDeleteUser, useUpdateUser } from '~/queries/users'
import type { CreateUserSchema, UpdateUserSchema } from '~/schemas/user'
import { getApiErrorMessage } from '~/api/client'
import type { User, UsersListFilters } from '~/types/user'

// Feature logic for the users workspace. Shared CRUD behavior (create gate, toast-wrapped `run`,
// delete flow) comes from useResourceCrud; the query + create/edit forms are per-resource.

export function useUsersWorkspace() {
  const { hasPermission } = useAuth()

  const filters = reactive<UsersListFilters>({ page: 1, limit: 20, search: '' })
  watch(() => filters.search, () => {
    filters.page = 1
  })
  const { data, status, error, refetch } = useQuery(() => ({ ...usersListQuery({ ...filters }), enabled: hasPermission('user:read') }))
  const rows = computed<User[]>(() => data.value?.items ?? [])
  const total = computed(() => data.value?.total ?? 0)
  const errorMessage = computed(() => getApiErrorMessage(error.value))

  const crud = useResourceCrud<User>({ noun: 'user', refetch, createPermission: 'user:create', deleteMutation: useDeleteUser() })

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
    const ok = await crud.run(() => createUser.mutateAsync(event.data), { success: 'User created', error: 'Could not create user' })
    if (ok) {
      createOpen.value = false
      Object.assign(createState, { email: '', password: '', first_name: '', last_name: '', is_superuser: false })
    }
    creating.value = false
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
    const ok = await crud.run(() => updateUser.mutateAsync({
      userId: target.id,
      input: {
        first_name: event.data.first_name,
        last_name: event.data.last_name,
        phone: event.data.phone === '' ? null : event.data.phone
      }
    }), { success: 'User updated', error: 'Could not update user' })
    if (ok) editOpen.value = false
    saving.value = false
  }

  return {
    canCreate: crud.canCreate,
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
    onSaveEdit,
    deleteOpen: crud.deleteOpen,
    deleteTarget: crud.deleteTarget,
    deleting: crud.deleting,
    onConfirmDelete: crud.confirmDelete
  }
}
