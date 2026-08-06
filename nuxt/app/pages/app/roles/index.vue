<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import type { DropdownMenuItem, FormSubmitEvent, TableColumn } from '@nuxt/ui'
import { rolesListQuery, useCreateRole, useDeleteRole, useUpdateRole } from '~/queries/roles'
import { createRoleSchema, type CreateRoleSchema, updateRoleSchema, type UpdateRoleSchema } from '~/schemas/role'
import { getApiErrorMessage } from '~/utils/api'
import type { Role, RolesListFilters } from '~/types/role'

// P2 vertical — copy of pages/app/users/index.vue against /roles.
const toast = useToast()
const { hasPermission } = useAuth()

const filters = reactive<RolesListFilters>({ page: 1, limit: 100, search: '' })
// Gate the fetch on the read permission too (see users/index.vue) — no wasted 403 for a
// denied actor; the AppPermissionGate renders the same verdict in-place.
const { data, status, error, refetch } = useQuery(() => ({ ...rolesListQuery({ ...filters }), enabled: hasPermission('role:read') }))

const rows = computed<Role[]>(() => data.value?.items ?? [])

const columns: TableColumn<Role>[] = [
  { accessorKey: 'display_name', header: 'Display name' },
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'scope', header: 'Scope' },
  { accessorKey: 'is_global', header: 'Reach' },
  { accessorKey: 'status', header: 'Status' },
  { id: 'actions', header: '' }
]

function rowMenu(role: Role): DropdownMenuItem[] {
  return [
    { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openEdit(role) },
    { label: 'Delete', icon: 'i-lucide-trash', color: 'error', onSelect: () => openDelete(role) }
  ]
}

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

// --- Edit ---
const editOpen = ref(false)
const editTarget = ref<Role | null>(null)
const editState = reactive<UpdateRoleSchema>({ display_name: '', description: '' })
const updateRole = useUpdateRole()
const saving = ref(false)

function openEdit(role: Role) {
  editTarget.value = role
  editState.display_name = role.display_name
  editState.description = role.description ?? ''
  editOpen.value = true
}

async function onSaveEdit(event: FormSubmitEvent<UpdateRoleSchema>) {
  if (!editTarget.value) return
  saving.value = true
  try {
    await updateRole.mutateAsync({
      roleId: editTarget.value.id,
      input: { display_name: event.data.display_name, description: event.data.description }
    })
    toast.add({ title: 'Role updated', color: 'success', icon: 'i-lucide-check' })
    editOpen.value = false
    await refetch()
  } catch (err) {
    toast.add({ title: 'Could not update role', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    saving.value = false
  }
}

// --- Delete ---
const deleteOpen = ref(false)
const deleteTarget = ref<Role | null>(null)
const deleteRole = useDeleteRole()
const deleting = ref(false)

function openDelete(role: Role) {
  deleteTarget.value = role
  deleteOpen.value = true
}

async function onConfirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await deleteRole.mutateAsync(deleteTarget.value.id)
    toast.add({ title: 'Role deleted', color: 'success', icon: 'i-lucide-check' })
    deleteOpen.value = false
    await refetch()
  } catch (err) {
    toast.add({ title: 'Could not delete role', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    deleting.value = false
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
          <UButton
            v-if="hasPermission('role:create')"
            icon="i-lucide-plus"
            label="Add role"
            @click="createOpen = true"
          />
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
      <AppPermissionGate permission="role:read">
        <UAlert
          v-if="status === 'error'"
          color="error"
          icon="i-lucide-triangle-alert"
          title="Could not load roles"
          :description="getApiErrorMessage(error)"
          class="mb-4"
        />

        <UTable :data="rows" :columns="columns" :loading="status === 'pending'">
          <template #display_name-cell="{ row }">
            <ULink :to="`/app/roles/${row.original.id}`" class="font-medium text-highlighted hover:underline">
              {{ row.original.display_name }}
            </ULink>
          </template>
          <template #scope-cell="{ row }">
            <span class="capitalize">{{ row.original.scope.replace('_', ' ') }}</span>
          </template>
          <template #is_global-cell="{ row }">
            <UBadge :color="row.original.is_global ? 'secondary' : 'neutral'" variant="subtle">
              {{ row.original.is_global ? 'Global' : 'Scoped' }}
            </UBadge>
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
                  aria-label="Role actions"
                />
              </UDropdownMenu>
            </div>
          </template>
        </UTable>
      </AppPermissionGate>
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

  <!-- Edit -->
  <UModal v-model:open="editOpen" :title="`Edit ${editTarget?.display_name ?? 'role'}`">
    <template #body>
      <UForm
        :schema="updateRoleSchema"
        :state="editState"
        class="space-y-4"
        @submit="onSaveEdit"
      >
        <UFormField name="display_name" label="Display name" required>
          <UInput v-model="editState.display_name" class="w-full" />
        </UFormField>
        <UFormField name="description" label="Description">
          <UTextarea v-model="editState.description" class="w-full" :rows="2" />
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
  <UModal v-model:open="deleteOpen" title="Delete role">
    <template #body>
      <p class="text-sm text-muted">
        Delete <span class="font-medium text-default">{{ deleteTarget?.display_name }}</span>? This cannot be undone.
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
