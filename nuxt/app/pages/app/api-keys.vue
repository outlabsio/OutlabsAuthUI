<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { ApiKey } from '~/types/api-key'

// Personal API keys — logic in useApiKeysWorkspace; this file is display only.
const {
  status,
  errorMessage,
  rows,
  grantableScopes,
  rowMenu,
  secretOpen,
  secret,
  secretTitle,
  copySecret,
  mintOpen,
  mintState,
  mintErrors,
  creating,
  openMint,
  toggleScope,
  onMint,
  rotateOpen,
  rotateTarget,
  rotating,
  onRotate,
  revokeOpen,
  revokeTarget,
  revoking,
  onRevoke
} = useApiKeysWorkspace()

// --- Pure display config ---
const columns: TableColumn<ApiKey>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'prefix', header: 'Prefix' },
  { accessorKey: 'key_kind', header: 'Kind' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'usage_count', header: 'Uses' },
  { accessorKey: 'last_used_at', header: 'Last used' },
  { id: 'actions', header: '' }
]
const statusColor: Record<ApiKey['status'], 'success' | 'warning' | 'error' | 'neutral'> = {
  active: 'success',
  suspended: 'warning',
  revoked: 'error',
  expired: 'neutral'
}
</script>

<template>
  <UDashboardPanel id="api-keys">
    <template #header>
      <UDashboardNavbar title="API Keys">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-lucide-plus" label="Create API key" @click="openMint" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UAlert
        v-if="status === 'error'"
        color="error"
        icon="i-lucide-triangle-alert"
        title="Could not load API keys"
        :description="errorMessage"
        class="mb-4"
      />

      <UTable :data="rows" :columns="columns" :loading="status === 'pending'">
        <template #key_kind-cell="{ row }">
          <span class="capitalize">{{ row.original.key_kind.replace('_', ' ') }}</span>
        </template>
        <template #status-cell="{ row }">
          <UBadge :color="statusColor[row.original.status]" variant="subtle" class="capitalize">
            {{ row.original.status }}
          </UBadge>
        </template>
        <template #last_used_at-cell="{ row }">
          {{ row.original.last_used_at ?? '—' }}
        </template>
        <template #actions-cell="{ row }">
          <div class="text-right">
            <UDropdownMenu :items="rowMenu(row.original)">
              <UButton
                icon="i-lucide-ellipsis-vertical"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="API key actions"
              />
            </UDropdownMenu>
          </div>
        </template>
      </UTable>
    </template>
  </UDashboardPanel>

  <!-- Mint -->
  <UModal v-model:open="mintOpen" title="Create personal API key">
    <template #body>
      <div class="space-y-4">
        <div class="space-y-1.5">
          <label for="api-key-name" class="block text-sm font-medium text-default">Name</label>
          <UInput
            id="api-key-name"
            v-model="mintState.name"
            placeholder="CI pipeline"
            class="w-full"
          />
          <p v-if="mintErrors.name" class="text-xs text-error">
            {{ mintErrors.name }}
          </p>
        </div>

        <div class="space-y-1.5">
          <label for="api-key-description" class="block text-sm font-medium text-default">Description</label>
          <UTextarea
            id="api-key-description"
            v-model="mintState.description"
            :rows="2"
            class="w-full"
          />
        </div>

        <div class="space-y-1.5">
          <p class="text-sm font-medium text-default">
            Scopes
          </p>
          <p class="text-xs text-muted">
            The grantable permissions for a personal key.
          </p>
          <div class="max-h-48 space-y-1.5 overflow-y-auto rounded-md border border-default p-3">
            <UCheckbox
              v-for="scope in grantableScopes"
              :key="scope"
              :label="scope"
              :model-value="mintState.scopes.includes(scope)"
              @update:model-value="toggleScope(scope)"
            />
            <p v-if="!grantableScopes.length" class="text-xs text-muted">
              No grantable scopes available.
            </p>
          </div>
          <p v-if="mintErrors.scopes" class="text-xs text-error">
            {{ mintErrors.scopes }}
          </p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label for="api-key-rate-limit" class="block text-sm font-medium text-default">Rate limit (req/min)</label>
            <UInput
              id="api-key-rate-limit"
              v-model="mintState.rateLimit"
              type="number"
              :disabled="mintState.unlimited"
              class="w-full"
            />
          </div>
          <div class="space-y-1.5">
            <label for="api-key-expires-days" class="block text-sm font-medium text-default">Expires (days)</label>
            <UInput
              id="api-key-expires-days"
              v-model="mintState.expiresInDays"
              type="number"
              placeholder="Never"
              class="w-full"
            />
          </div>
        </div>
        <USwitch v-model="mintState.unlimited" label="Use unlimited rate limit" />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          label="Cancel"
          @click="mintOpen = false"
        />
        <UButton label="Create key" :loading="creating" @click="onMint" />
      </div>
    </template>
  </UModal>

  <!-- One-time secret -->
  <UModal v-model:open="secretOpen" :title="secretTitle" :dismissible="false">
    <template #body>
      <div class="space-y-3">
        <UAlert
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Copy this key now"
          description="This is the only time the full key is shown. Store it somewhere safe before closing."
        />
        <div class="flex items-center gap-2">
          <UInput
            :model-value="secret"
            readonly
            class="w-full font-mono"
            aria-label="API key secret"
          />
          <UButton
            icon="i-lucide-copy"
            color="neutral"
            variant="outline"
            aria-label="Copy API key"
            @click="copySecret"
          />
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end">
        <UButton label="Done" @click="secretOpen = false" />
      </div>
    </template>
  </UModal>

  <!-- Rotate -->
  <UModal v-model:open="rotateOpen" title="Rotate API key">
    <template #body>
      <p class="text-sm text-muted">
        Rotate <span class="font-medium text-default">{{ rotateTarget?.name }}</span>? The current secret stops working immediately and a new one is issued.
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          label="Cancel"
          @click="rotateOpen = false"
        />
        <UButton label="Rotate key" :loading="rotating" @click="onRotate" />
      </div>
    </template>
  </UModal>

  <!-- Revoke -->
  <UModal v-model:open="revokeOpen" title="Revoke API key">
    <template #body>
      <p class="text-sm text-muted">
        Revoke <span class="font-medium text-default">{{ revokeTarget?.name }}</span>? This immediately and permanently disables the key.
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          label="Cancel"
          @click="revokeOpen = false"
        />
        <UButton
          color="error"
          label="Revoke key"
          :loading="revoking"
          @click="onRevoke"
        />
      </div>
    </template>
  </UModal>
</template>
