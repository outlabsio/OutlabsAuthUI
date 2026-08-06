<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'
import { usersListQuery, useCreateUser } from '~/queries/users'
import { createUserSchema, type CreateUserSchema } from '~/schemas/user'
import { getApiErrorMessage } from '~/utils/api'
import type { User, UsersListFilters } from '~/types/user'

// Reference vertical (A3/A4). List = Pinia Colada query; create = Zod UForm + mutation that
// invalidates the resource root key. Every other resource is a copy of this file's shape.
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
  { accessorKey: 'created_at', header: 'Created' }
]

const statusColor: Record<User['status'], 'success' | 'warning' | 'error' | 'neutral'> = {
  active: 'success',
  invited: 'warning',
  suspended: 'warning',
  banned: 'error',
  deleted: 'neutral'
}

// Create-user modal.
const createOpen = ref(false)
const createState = reactive<Partial<CreateUserSchema>>({ email: '', first_name: '', last_name: '', is_superuser: false })
const createUser = useCreateUser()
const creating = ref(false)

async function onCreate(event: FormSubmitEvent<CreateUserSchema>) {
  creating.value = true
  try {
    await createUser.mutateAsync(event.data)
    toast.add({ title: 'User created', color: 'success', icon: 'i-lucide-check' })
    createOpen.value = false
    Object.assign(createState, { email: '', first_name: '', last_name: '', is_superuser: false })
    await refetch()
  } catch (err) {
    toast.add({ title: 'Could not create user', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    creating.value = false
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
</template>
