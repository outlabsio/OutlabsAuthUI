<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'
import { rolesListQuery, useCreateRole } from '~/queries/roles'
import { createRoleSchema, type CreateRoleSchema } from '~/schemas/role'
import { getApiErrorMessage } from '~/utils/api'
import type { Role, RolesListFilters } from '~/types/role'

// P2 vertical — copy of pages/app/users/index.vue against /roles.
const toast = useToast()

const filters = reactive<RolesListFilters>({ page: 1, limit: 100, search: '' })
const { data, status, error, refetch } = useQuery(() => rolesListQuery({ ...filters }))

const rows = computed<Role[]>(() => data.value?.items ?? [])

const columns: TableColumn<Role>[] = [
  { accessorKey: 'display_name', header: 'Display name' },
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'scope', header: 'Scope' },
  { accessorKey: 'is_global', header: 'Reach' },
  { accessorKey: 'status', header: 'Status' }
]

const statusColor: Record<Role['status'], 'success' | 'neutral'> = {
  active: 'success',
  inactive: 'neutral',
  archived: 'neutral'
}

const createOpen = ref(false)
const createState = reactive<Partial<CreateRoleSchema>>({ name: '', display_name: '', description: '', is_global: false })
const createRole = useCreateRole()
const creating = ref(false)

async function onCreate(event: FormSubmitEvent<CreateRoleSchema>) {
  creating.value = true
  try {
    await createRole.mutateAsync({
      name: event.data.name,
      display_name: event.data.display_name,
      description: event.data.description,
      is_global: event.data.is_global ?? false,
      permissions: []
    })
    toast.add({ title: 'Role created', color: 'success', icon: 'i-lucide-check' })
    createOpen.value = false
    Object.assign(createState, { name: '', display_name: '', description: '', is_global: false })
    await refetch()
  } catch (err) {
    toast.add({ title: 'Could not create role', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="roles">
    <template #header>
      <UDashboardNavbar title="Roles">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-lucide-plus" label="Add role" @click="createOpen = true" />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UInput
            v-model="filters.search"
            icon="i-lucide-search"
            placeholder="Search roles..."
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
        title="Could not load roles"
        :description="getApiErrorMessage(error)"
        class="mb-4"
      />

      <UTable :data="rows" :columns="columns" :loading="status === 'pending'">
        <template #scope-cell="{ row }">
          <span class="capitalize">{{ row.original.scope.replace('_', ' ') }}</span>
        </template>
        <template #is_global-cell="{ row }">
          <UBadge :color="row.original.is_global ? 'primary' : 'neutral'" variant="subtle">
            {{ row.original.is_global ? 'Global' : 'Scoped' }}
          </UBadge>
        </template>
        <template #status-cell="{ row }">
          <UBadge :color="statusColor[row.original.status]" variant="subtle" class="capitalize">
            {{ row.original.status }}
          </UBadge>
        </template>
      </UTable>
    </template>
  </UDashboardPanel>

  <UModal v-model:open="createOpen" title="Add role">
    <template #body>
      <UForm
        :schema="createRoleSchema"
        :state="createState"
        class="space-y-4"
        @submit="onCreate"
      >
        <UFormField name="display_name" label="Display name" required>
          <UInput v-model="createState.display_name" class="w-full" placeholder="Regional Admin" />
        </UFormField>
        <UFormField
          name="name"
          label="Name"
          required
          description="Machine name: lowercase, no spaces."
        >
          <UInput v-model="createState.name" class="w-full" placeholder="regional-admin" />
        </UFormField>
        <UFormField name="description" label="Description">
          <UTextarea v-model="createState.description" class="w-full" :rows="2" />
        </UFormField>
        <UFormField name="is_global">
          <UCheckbox v-model="createState.is_global" label="Global role" />
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
