<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'
import { permissionsListQuery, useCreatePermission } from '~/queries/permissions'
import { createPermissionSchema, type CreatePermissionSchema } from '~/schemas/permission'
import { getApiErrorMessage } from '~/utils/api'
import type { Permission, PermissionsListFilters } from '~/types/permission'

// P2 vertical — copy of pages/app/roles/index.vue against /permissions.
const toast = useToast()

const filters = reactive<PermissionsListFilters>({ page: 1, limit: 1000 })
const search = ref('')
const { data, status, error, refetch } = useQuery(() => permissionsListQuery({ ...filters }))

// Permissions list is small and returned whole; filter client-side by name/display_name.
const rows = computed<Permission[]>(() => {
  const all = data.value?.items ?? []
  const term = search.value.trim().toLowerCase()
  if (!term) return all
  return all.filter(p => `${p.name} ${p.display_name}`.toLowerCase().includes(term))
})

const columns: TableColumn<Permission>[] = [
  { accessorKey: 'display_name', header: 'Display name' },
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'resource', header: 'Resource' },
  { accessorKey: 'is_system', header: 'Origin' },
  { accessorKey: 'status', header: 'Status' }
]

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
</script>

<template>
  <UDashboardPanel id="permissions">
    <template #header>
      <UDashboardNavbar title="Permissions">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-lucide-plus" label="Add permission" @click="createOpen = true" />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Search permissions..."
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
        title="Could not load permissions"
        :description="getApiErrorMessage(error)"
        class="mb-4"
      />

      <UTable :data="rows" :columns="columns" :loading="status === 'pending'">
        <template #is_system-cell="{ row }">
          <UBadge :color="row.original.is_system ? 'neutral' : 'primary'" variant="subtle">
            {{ row.original.is_system ? 'System' : 'Custom' }}
          </UBadge>
        </template>
        <template #status-cell="{ row }">
          <UBadge :color="row.original.status === 'active' ? 'success' : 'neutral'" variant="subtle" class="capitalize">
            {{ row.original.status }}
          </UBadge>
        </template>
      </UTable>
    </template>
  </UDashboardPanel>

  <UModal v-model:open="createOpen" title="Add permission">
    <template #body>
      <UForm
        :schema="createPermissionSchema"
        :state="createState"
        class="space-y-4"
        @submit="onCreate"
      >
        <UFormField name="display_name" label="Display name" required>
          <UInput v-model="createState.display_name" class="w-full" placeholder="Create lead" />
        </UFormField>
        <UFormField
          name="name"
          label="Name"
          required
          description="Convention: resource:action."
        >
          <UInput v-model="createState.name" class="w-full" placeholder="lead:create" />
        </UFormField>
        <UFormField name="description" label="Description">
          <UTextarea v-model="createState.description" class="w-full" :rows="2" />
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
