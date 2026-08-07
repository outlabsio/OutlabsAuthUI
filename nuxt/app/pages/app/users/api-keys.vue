<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { ApiKey } from '~/types/api-key'

// System API Keys — logic in useSystemApiKeys; this file is display only.
const {
  scopeKind,
  entityId,
  entitySelectItems,
  status,
  errorMessage,
  activeTab,
  principals,
  selectedId,
  selectedPrincipal,
  keys,
  keysStatus,
  keyMenu,
  inventoryKeys,
  inventoryStatus,
  createSaOpen,
  saState,
  saErrors,
  grantableScopes,
  roleOptions,
  toggleSaScope,
  toggleSaRole,
  creatingSa,
  openCreatePrincipal,
  onCreatePrincipal,
  createKeyOpen,
  keyState,
  keyErrors,
  principalScopes,
  toggleKeyScope,
  creatingKey,
  openCreateKey,
  onCreateKey,
  secretOpen,
  secret,
  copySecret,
  rotateOpen,
  rotateTarget,
  rotating,
  onRotate,
  revokeOpen,
  revokeTarget,
  revoking,
  onRevoke,
  guideOpen
} = useSystemApiKeys()

// --- Pure display config ---
const scopeKindItems = [
  { label: 'Platform global', value: 'platform_global' as const },
  { label: 'Entity', value: 'entity' as const }
]
const keyColumns: TableColumn<ApiKey>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'prefix', header: 'Prefix' },
  { accessorKey: 'status', header: 'Status' },
  { id: 'actions', header: '' }
]
const inventoryColumns: TableColumn<ApiKey>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'prefix', header: 'Prefix' },
  { accessorKey: 'status', header: 'Status' }
]
const statusColor: Record<ApiKey['status'], 'success' | 'warning' | 'error' | 'neutral'> = {
  active: 'success',
  suspended: 'warning',
  revoked: 'error',
  expired: 'neutral'
}
</script>

<template>
  <UDashboardPanel id="system-api-keys">
    <template #header>
      <UDashboardNavbar title="System API Keys">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-book-open"
            color="neutral"
            variant="outline"
            label="Open System API Keys guide"
            @click="guideOpen = true"
          />
          <UButton icon="i-lucide-plus" label="Create service account" @click="openCreatePrincipal" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <AppPermissionGate permission="apikey:read">
        <div class="mb-4 flex flex-wrap items-end gap-3">
          <div class="space-y-1.5">
            <label for="scope-kind" class="block text-sm font-medium text-default">Scope</label>
            <USelect
              id="scope-kind"
              v-model="scopeKind"
              :items="scopeKindItems"
              class="w-44"
            />
          </div>
          <div v-if="scopeKind === 'entity'" class="space-y-1.5">
            <label for="scope-entity" class="block text-sm font-medium text-default">Entity</label>
            <USelectMenu
              id="scope-entity"
              v-model="entityId"
              value-key="value"
              :items="entitySelectItems"
              placeholder="Select an entity..."
              class="w-64"
            />
          </div>
        </div>

        <UAlert
          v-if="status === 'error'"
          color="error"
          icon="i-lucide-triangle-alert"
          title="Could not load service accounts"
          :description="errorMessage"
          class="mb-4"
        />

        <div
          v-if="scopeKind === 'entity' && !entityId"
          class="rounded-lg border border-default py-16 text-center text-sm text-muted"
        >
          Select an entity to manage its service accounts.
        </div>

        <template v-else>
          <div v-if="scopeKind === 'entity'" class="mb-3 flex gap-2 border-b border-default">
            <button
              type="button"
              class="-mb-px border-b-2 px-3 py-1.5 text-sm"
              :class="activeTab === 'accounts' ? 'border-primary text-highlighted' : 'border-transparent text-muted'"
              @click="activeTab = 'accounts'"
            >
              Service accounts
            </button>
            <button
              type="button"
              class="-mb-px border-b-2 px-3 py-1.5 text-sm"
              :class="activeTab === 'inventory' ? 'border-primary text-highlighted' : 'border-transparent text-muted'"
              @click="activeTab = 'inventory'"
            >
              Inventory
            </button>
          </div>

          <!-- Inventory (entity scope) -->
          <div v-if="scopeKind === 'entity' && activeTab === 'inventory'">
            <UTable
              :data="inventoryKeys"
              :columns="inventoryColumns"
              :loading="inventoryStatus === 'pending'"
              :empty="'No machine keys under this entity.'"
            >
              <template #status-cell="{ row }">
                <UBadge :color="statusColor[row.original.status]" variant="subtle" class="capitalize">
                  {{ row.original.status }}
                </UBadge>
              </template>
            </UTable>
          </div>

          <!-- Service accounts master-detail -->
          <div v-else class="grid gap-4 lg:grid-cols-[320px_1fr]">
            <div class="space-y-2">
              <p class="text-sm font-medium text-default">
                Service accounts
              </p>
              <div v-if="status === 'pending'" class="text-sm text-muted">
                Loading...
              </div>
              <div v-else-if="!principals.length" class="rounded-lg border border-default p-4 text-sm text-muted">
                No service accounts in this scope yet.
              </div>
              <div v-else class="space-y-1.5">
                <button
                  v-for="principal in principals"
                  :key="principal.id"
                  type="button"
                  class="w-full rounded-lg border px-3 py-2 text-left transition-colors"
                  :class="principal.id === selectedId ? 'border-primary bg-primary/10' : 'border-default hover:bg-muted/40'"
                  @click="selectedId = principal.id"
                >
                  <div class="font-medium text-highlighted">
                    {{ principal.name }}
                  </div>
                  <div class="text-xs text-muted capitalize">
                    {{ principal.status }} · {{ principal.effective_allowed_scopes.length }} scopes
                  </div>
                </button>
              </div>
            </div>

            <div>
              <div v-if="!selectedPrincipal" class="flex h-full items-center justify-center rounded-lg border border-default py-16 text-sm text-muted">
                Select a service account to manage its machine keys.
              </div>
              <div v-else class="space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <h2 class="font-semibold text-highlighted">
                      {{ selectedPrincipal.name }}
                    </h2>
                    <p v-if="selectedPrincipal.description" class="text-sm text-muted">
                      {{ selectedPrincipal.description }}
                    </p>
                  </div>
                  <UButton icon="i-lucide-plus" label="Create machine key" @click="openCreateKey" />
                </div>

                <UTable
                  :data="keys"
                  :columns="keyColumns"
                  :loading="keysStatus === 'pending'"
                  :empty="'No machine keys yet.'"
                >
                  <template #status-cell="{ row }">
                    <UBadge :color="statusColor[row.original.status]" variant="subtle" class="capitalize">
                      {{ row.original.status }}
                    </UBadge>
                  </template>
                  <template #actions-cell="{ row }">
                    <div class="text-right">
                      <UDropdownMenu :items="keyMenu(row.original)">
                        <UButton
                          icon="i-lucide-ellipsis-vertical"
                          color="neutral"
                          variant="ghost"
                          size="xs"
                          aria-label="Machine key actions"
                        />
                      </UDropdownMenu>
                    </div>
                  </template>
                </UTable>
              </div>
            </div>
          </div>
        </template>
      </AppPermissionGate>
    </template>
  </UDashboardPanel>

  <!-- Create service account -->
  <UModal v-model:open="createSaOpen" title="Create service account">
    <template #body>
      <div class="space-y-4">
        <div class="space-y-1.5">
          <label for="sa-name" class="block text-sm font-medium text-default">Name</label>
          <UInput
            id="sa-name"
            v-model="saState.name"
            placeholder="ci-deployer"
            class="w-full"
          />
          <p v-if="saErrors.name" class="text-xs text-error">
            {{ saErrors.name }}
          </p>
        </div>
        <div class="space-y-1.5">
          <label for="sa-description" class="block text-sm font-medium text-default">Description</label>
          <UTextarea
            id="sa-description"
            v-model="saState.description"
            :rows="2"
            class="w-full"
          />
        </div>
        <div class="space-y-1.5">
          <p class="text-sm font-medium text-default">
            Allowed scopes
          </p>
          <div class="max-h-40 space-y-1.5 overflow-y-auto rounded-md border border-default p-3">
            <UCheckbox
              v-for="option in grantableScopes"
              :key="option"
              :label="option"
              :model-value="saState.scopes.includes(option)"
              @update:model-value="toggleSaScope(option)"
            />
          </div>
        </div>
        <div class="space-y-1.5">
          <p class="text-sm font-medium text-default">
            Roles <span class="font-normal text-muted">(role envelope)</span>
          </p>
          <div class="max-h-40 space-y-1.5 overflow-y-auto rounded-md border border-default p-3">
            <UCheckbox
              v-for="role in roleOptions"
              :key="role.id"
              :label="role.display_name"
              :model-value="saState.roleIds.includes(role.id)"
              @update:model-value="toggleSaRole(role.id)"
            />
            <p v-if="!roleOptions.length" class="text-xs text-muted">
              No assignable roles in this scope.
            </p>
          </div>
        </div>
        <p v-if="saErrors.envelope" class="text-xs text-error">
          {{ saErrors.envelope }}
        </p>
        <USwitch v-model="saState.inherit" label="Inherit from tree" />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          label="Cancel"
          @click="createSaOpen = false"
        />
        <UButton label="Create account" :loading="creatingSa" @click="onCreatePrincipal" />
      </div>
    </template>
  </UModal>

  <!-- Create machine key -->
  <UModal v-model:open="createKeyOpen" title="Create machine key">
    <template #body>
      <div class="space-y-4">
        <div class="space-y-1.5">
          <label for="machine-key-name" class="block text-sm font-medium text-default">Name</label>
          <UInput
            id="machine-key-name"
            v-model="keyState.name"
            placeholder="prod-deploy"
            class="w-full"
          />
          <p v-if="keyErrors.name" class="text-xs text-error">
            {{ keyErrors.name }}
          </p>
        </div>
        <div class="space-y-1.5">
          <p class="text-sm font-medium text-default">
            Scopes
          </p>
          <p class="text-xs text-muted">
            Within this service account's envelope.
          </p>
          <div class="max-h-40 space-y-1.5 overflow-y-auto rounded-md border border-default p-3">
            <UCheckbox
              v-for="option in principalScopes"
              :key="option"
              :label="option"
              :model-value="keyState.scopes.includes(option)"
              @update:model-value="toggleKeyScope(option)"
            />
            <p v-if="!principalScopes.length" class="text-xs text-muted">
              This service account has no grantable scopes.
            </p>
          </div>
          <p v-if="keyErrors.scopes" class="text-xs text-error">
            {{ keyErrors.scopes }}
          </p>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label for="machine-key-rate-limit" class="block text-sm font-medium text-default">Rate limit (req/min)</label>
            <UInput
              id="machine-key-rate-limit"
              v-model="keyState.rateLimit"
              type="number"
              class="w-full"
            />
          </div>
          <div class="space-y-1.5">
            <label for="machine-key-expires-days" class="block text-sm font-medium text-default">Expires (days)</label>
            <UInput
              id="machine-key-expires-days"
              v-model="keyState.expiresInDays"
              type="number"
              placeholder="Never"
              class="w-full"
            />
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          label="Cancel"
          @click="createKeyOpen = false"
        />
        <UButton label="Create key" :loading="creatingKey" @click="onCreateKey" />
      </div>
    </template>
  </UModal>

  <!-- One-time secret -->
  <UModal v-model:open="secretOpen" title="Store the new API key now" :dismissible="false">
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
            aria-label="Machine key secret"
          />
          <UButton
            icon="i-lucide-copy"
            color="neutral"
            variant="outline"
            aria-label="Copy machine key"
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
  <UModal v-model:open="rotateOpen" title="Rotate machine key">
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
  <UModal v-model:open="revokeOpen" title="Revoke machine key">
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

  <USlideover v-model:open="guideOpen" title="System API Keys guide">
    <template #body>
      <div class="space-y-4 text-sm text-muted">
        <p>Service accounts are non-human identities. Each carries an envelope of allowed scopes; its machine keys can only be granted scopes from that envelope.</p>
        <ul class="list-disc space-y-1.5 pl-5">
          <li>Create a <span class="text-default">service account</span> and choose its allowed scopes.</li>
          <li>Select it, then <span class="text-default">create machine keys</span> for it — the secret is shown once.</li>
          <li>Rotate a key to issue a new secret; revoke to disable it permanently.</li>
        </ul>
        <p>Switch <span class="text-default">Scope</span> between platform-global and a specific entity. In entity scope, the <span class="text-default">Inventory</span> tab lists every machine key under that entity.</p>
      </div>
    </template>
  </USlideover>
</template>
