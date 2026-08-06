<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import type { DropdownMenuItem, FormSubmitEvent, TableColumn } from '@nuxt/ui'
import { usersListQuery, useCreateUser, useDeleteUser, useUpdateUser } from '~/queries/users'
import { createUserSchema, type CreateUserSchema, updateUserSchema, type UpdateUserSchema } from '~/schemas/user'
import { getApiErrorMessage } from '~/utils/api'
import type { User, UsersListFilters } from '~/types/user'

// Reference vertical (A3/A4). List = Pinia Colada query; create/edit/delete = Zod UForm +
// mutations that invalidate the resource root key. Every other resource copies this shape.
const toast = useToast()

const filters = reactive<UsersListFilters>({ page: 1, limit: 20, search: '' })
const { data, status, error, refetch } = useQuery(() => usersListQuery({ ...filters }))

const rows = computed<User[]>(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)

watch(() => filters.search, () => {
  filters.page = 1
})

const columns: TableColumn<User>[] = [
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'first_name', header: 'First name' },
  { accessorKey: 'last_name', header: 'Last name' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'created_at', header: 'Created' },
  { id: 'actions', header: '' }
]

const statusColor: Record<User['status'], 'success' | 'warning' | 'error' | 'neutral'> = {
  active: 'success',
  invited: 'warning',
  suspended: 'warning',
  banned: 'error',
  deleted: 'neutral'
}

function rowMenu(user: User): DropdownMenuItem[] {
  return [
    { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openEdit(user) },
    { label: 'Delete', icon: 'i-lucide-trash', color: 'error', onSelect: () => openDelete(user) }
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
</script>

<template>
  <UDashboardPanel id="users">
    <template #header>
      <UDashboardNavbar title="Users">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-lucide-plus" label="Add user" @click="createOpen = true" />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UInput
            v-model="filters.search"
            icon="i-lucide-search"
            placeholder="Search users..."
            class="w-64"
          />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <UAlert
        v-if="status === 'error'"
        color="error"
        icon="i-lucide-triangle-alert"
        title="Could not load users"
        :description="getApiErrorMessage(error)"
        class="mb-4"
      />

      <UTable
        :data="rows"
        :columns="columns"
        :loading="status === 'pending'"
      >
        <template #email-cell="{ row }">
          <ULink :to="`/app/users/${row.original.id}`" class="font-medium text-primary">
            {{ row.original.email }}
          </ULink>
        </template>
        <template #status-cell="{ row }">
          <UBadge :color="statusColor[row.original.status]" variant="subtle" class="capitalize">
            {{ row.original.status }}
          </UBadge>
        </template>
        <template #actions-cell="{ row }">
          <div class="text-right">
            <UDropdownMenu :items="rowMenu(row.original)">
              <UButton
                icon="i-lucide-ellipsis-vertical"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="User actions"
              />
            </UDropdownMenu>
          </div>
        </template>
      </UTable>

      <div v-if="total > filters.limit!" class="flex justify-end pt-4">
        <UPagination
          v-model:page="filters.page"
          :total="total"
          :items-per-page="filters.limit"
        />
      </div>
    </template>
  </UDashboardPanel>

  <!-- Create -->
  <UModal v-model:open="createOpen" title="Add user">
    <template #body>
      <UForm
        :schema="createUserSchema"
        :state="createState"
        class="space-y-4"
        @submit="onCreate"
      >
        <UFormField name="email" label="Email" required>
          <UInput
            v-model="createState.email"
            type="email"
            class="w-full"
            placeholder="you@example.com"
          />
        </UFormField>
        <UFormField name="password" label="Initial password" required>
          <UInput
            v-model="createState.password"
            type="password"
            autocomplete="new-password"
            class="w-full"
          />
        </UFormField>
        <div class="grid grid-cols-2 gap-3">
          <UFormField name="first_name" label="First name">
            <UInput v-model="createState.first_name" class="w-full" />
          </UFormField>
          <UFormField name="last_name" label="Last name">
            <UInput v-model="createState.last_name" class="w-full" />
          </UFormField>
        </div>
        <UFormField name="is_superuser">
          <UCheckbox v-model="createState.is_superuser" label="Superuser" />
        </UFormField>
        <div class="flex justify-end gap-2 pt-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            @click="createOpen = false"
          />
          <UButton type="submit" label="Create" :loading="creating" />
        </div>
      </UForm>
    </template>
  </UModal>

  <!-- Edit -->
  <UModal v-model:open="editOpen" :title="`Edit ${editTarget?.email ?? 'user'}`">
    <template #body>
      <UForm
        :schema="updateUserSchema"
        :state="editState"
        class="space-y-4"
        @submit="onSaveEdit"
      >
        <div class="grid grid-cols-2 gap-3">
          <UFormField name="first_name" label="First name">
            <UInput v-model="editState.first_name" class="w-full" />
          </UFormField>
          <UFormField name="last_name" label="Last name">
            <UInput v-model="editState.last_name" class="w-full" />
          </UFormField>
        </div>
        <UFormField name="phone" label="Phone" description="E.164 format, e.g. +15551234567.">
          <UInput v-model="editState.phone" class="w-full" placeholder="+15551234567" />
        </UFormField>
        <div class="flex justify-end gap-2 pt-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            @click="editOpen = false"
          />
          <UButton type="submit" label="Save" :loading="saving" />
        </div>
      </UForm>
    </template>
  </UModal>

  <!-- Delete -->
  <UModal v-model:open="deleteOpen" title="Delete user">
    <template #body>
      <p class="text-sm text-muted">
        Delete <span class="font-medium text-default">{{ deleteTarget?.email }}</span>? This cannot be undone.
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          label="Cancel"
          @click="deleteOpen = false"
        />
        <UButton
          color="error"
          label="Delete"
          :loading="deleting"
          @click="onConfirmDelete"
        />
      </div>
    </template>
  </UModal>
</template>
