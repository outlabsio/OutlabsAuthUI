<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import {
  entityInventoryQuery,
  grantableScopesQuery,
  principalKeysQuery,
  principalsQuery,
  useCreateMachineKey,
  useCreatePrincipal,
  useRevokeMachineKey,
  useRotateMachineKey,
  type SystemScope
} from '~/queries/api-keys'
import { entitiesListQuery } from '~/queries/entities'
import { getApiErrorMessage } from '~/utils/api'
import type { ApiKey, CreateMachineKeyInput, CreatePrincipalInput, IntegrationPrincipal } from '~/types/api-key'
import type { Entity } from '~/types/entity'

// System API Keys — service accounts (integration principals) and their machine keys, either
// PLATFORM-GLOBAL or scoped to a chosen ENTITY (scope toggle + entity picker). Master
// (principals) / detail (that principal's keys); entity scope adds an Inventory tab (all keys
// under the entity). Machine-key create + rotate surface the one-time secret. Role envelopes
// remain a later pass. Gated by apikey:read (superusers pass).
const toast = useToast()
const { hasPermission } = useAuth()

const canRead = computed(() => hasPermission('apikey:read'))

// Scope: platform-global, or a chosen entity.
const scopeKind = ref<'platform_global' | 'entity'>('platform_global')
const entityId = ref('')
const selectedId = ref<string | null>(null)
const activeTab = ref<'accounts' | 'inventory'>('accounts')

const scope = computed<SystemScope>(() =>
  scopeKind.value === 'entity' && entityId.value
    ? { kind: 'entity', entityId: entityId.value }
    : { kind: 'platform_global' }
)
const scopeReady = computed(() => scopeKind.value === 'platform_global' || Boolean(entityId.value))

// Changing scope invalidates the current selection + tab.
watch([scopeKind, entityId], () => {
  selectedId.value = null
  activeTab.value = 'accounts'
})

// Entities for the scope picker.
const { data: entitiesData } = useQuery(() => ({ ...entitiesListQuery({ limit: 100 }), enabled: canRead.value }))
const entityOptions = computed<Entity[]>(() => entitiesData.value?.items ?? [])

const { data: principalsData, status, error } = useQuery(() => ({ ...principalsQuery(scope.value), enabled: canRead.value && scopeReady.value }))
const { data: grantable } = useQuery(() => ({ ...grantableScopesQuery, enabled: canRead.value }))
const grantableScopes = computed<string[]>(() => grantable.value?.grantable_scopes ?? [])

const principals = computed<IntegrationPrincipal[]>(() => principalsData.value?.items ?? [])
const selectedPrincipal = computed(() => principals.value.find(p => p.id === selectedId.value) ?? null)

// Auto-select the first principal once loaded (nothing selected yet).
watch(principals, (list) => {
  if (!selectedId.value && list.length) selectedId.value = list[0]!.id
})

const { data: keysData, status: keysStatus } = useQuery(() => ({
  ...principalKeysQuery({ scope: scope.value, principalId: selectedId.value ?? '' }),
  enabled: canRead.value && Boolean(selectedId.value)
}))
const keys = computed<ApiKey[]>(() => keysData.value?.items ?? [])

// Inventory (entity scope only) — every machine key under the entity.
const { data: inventoryData, status: inventoryStatus } = useQuery(() => ({
  ...entityInventoryQuery(entityId.value),
  enabled: canRead.value && scopeKind.value === 'entity' && Boolean(entityId.value)
}))
const inventoryKeys = computed<ApiKey[]>(() => inventoryData.value?.items ?? [])

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

function keyMenu(key: ApiKey): DropdownMenuItem[] {
  const terminal = key.status === 'revoked' || key.status === 'expired'
  return [
    { label: 'Rotate', icon: 'i-lucide-refresh-cw', disabled: terminal, onSelect: () => openRotate(key) },
    { label: 'Revoke', icon: 'i-lucide-ban', color: 'error', disabled: terminal, onSelect: () => openRevoke(key) }
  ]
}

// --- One-time secret (create + rotate) ---
const secretOpen = ref(false)
const secret = ref('')
function revealSecret(value: string) {
  secret.value = value
  secretOpen.value = true
}
async function copySecret() {
  try {
    await navigator.clipboard.writeText(secret.value)
    toast.add({ title: 'Copied to clipboard', color: 'success', icon: 'i-lucide-check' })
  } catch {
    toast.add({ title: 'Copy the key manually', description: 'Clipboard access was blocked.', color: 'warning', icon: 'i-lucide-triangle-alert' })
  }
}

// --- Create service account ---
const createSaOpen = ref(false)
const saState = reactive({ name: '', description: '', scopes: [] as string[], inherit: false })
const saErrors = reactive({ name: '', scopes: '' })
const createPrincipal = useCreatePrincipal()
const creatingSa = ref(false)

function openCreatePrincipal() {
  Object.assign(saState, { name: '', description: '', scopes: [], inherit: false })
  saErrors.name = ''
  saErrors.scopes = ''
  createSaOpen.value = true
}
function toggleSaScope(scope: string) {
  const idx = saState.scopes.indexOf(scope)
  if (idx === -1) saState.scopes.push(scope)
  else saState.scopes.splice(idx, 1)
  if (saState.scopes.length) saErrors.scopes = ''
}
async function onCreatePrincipal() {
  saErrors.name = saState.name.trim() ? '' : 'Name is required.'
  saErrors.scopes = saState.scopes.length ? '' : 'Select at least one scope.'
  if (saErrors.name || saErrors.scopes) return

  creatingSa.value = true
  try {
    const input: CreatePrincipalInput = {
      name: saState.name.trim(),
      allowed_scopes: [...saState.scopes],
      inherit_from_tree: saState.inherit
    }
    if (saState.description.trim()) input.description = saState.description.trim()
    const created = await createPrincipal.mutateAsync({ scope: scope.value, input })
    selectedId.value = created.id
    createSaOpen.value = false
    toast.add({ title: 'Service account created', color: 'success', icon: 'i-lucide-check' })
  } catch (err) {
    toast.add({ title: 'Could not create service account', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    creatingSa.value = false
  }
}

// --- Create machine key ---
const createKeyOpen = ref(false)
const keyState = reactive({ name: '', scopes: [] as string[], rateLimit: '60', expiresInDays: '' })
const keyErrors = reactive({ name: '', scopes: '' })
const createMachineKey = useCreateMachineKey()
const creatingKey = ref(false)
const principalScopes = computed<string[]>(() => selectedPrincipal.value?.effective_allowed_scopes ?? [])

function openCreateKey() {
  Object.assign(keyState, { name: '', scopes: [], rateLimit: '60', expiresInDays: '' })
  keyErrors.name = ''
  keyErrors.scopes = ''
  createKeyOpen.value = true
}
function toggleKeyScope(scope: string) {
  const idx = keyState.scopes.indexOf(scope)
  if (idx === -1) keyState.scopes.push(scope)
  else keyState.scopes.splice(idx, 1)
  if (keyState.scopes.length) keyErrors.scopes = ''
}
async function onCreateKey() {
  if (!selectedId.value) return
  keyErrors.name = keyState.name.trim() ? '' : 'Name is required.'
  keyErrors.scopes = keyState.scopes.length ? '' : 'Select at least one scope.'
  if (keyErrors.name || keyErrors.scopes) return

  creatingKey.value = true
  try {
    const input: CreateMachineKeyInput = {
      name: keyState.name.trim(),
      scopes: [...keyState.scopes],
      rate_limit_per_minute: Number(keyState.rateLimit)
    }
    if (keyState.expiresInDays !== '' && Number(keyState.expiresInDays) > 0) input.expires_in_days = Number(keyState.expiresInDays)
    const created = await createMachineKey.mutateAsync({ scope: scope.value, principalId: selectedId.value, input })
    createKeyOpen.value = false
    revealSecret(created.api_key)
    toast.add({ title: 'Machine key created', color: 'success', icon: 'i-lucide-check' })
  } catch (err) {
    toast.add({ title: 'Could not create machine key', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    creatingKey.value = false
  }
}

// --- Rotate / revoke machine key ---
const rotateOpen = ref(false)
const rotateTarget = ref<ApiKey | null>(null)
const rotateMachineKey = useRotateMachineKey()
const rotating = ref(false)
function openRotate(key: ApiKey) {
  rotateTarget.value = key
  rotateOpen.value = true
}
async function onRotate() {
  if (!rotateTarget.value || !selectedId.value) return
  rotating.value = true
  try {
    const rotated = await rotateMachineKey.mutateAsync({ scope: scope.value, principalId: selectedId.value, keyId: rotateTarget.value.id })
    rotateOpen.value = false
    revealSecret(rotated.api_key)
    toast.add({ title: 'Machine key rotated', color: 'success', icon: 'i-lucide-check' })
  } catch (err) {
    toast.add({ title: 'Could not rotate machine key', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    rotating.value = false
  }
}

const revokeOpen = ref(false)
const revokeTarget = ref<ApiKey | null>(null)
const revokeMachineKey = useRevokeMachineKey()
const revoking = ref(false)
function openRevoke(key: ApiKey) {
  revokeTarget.value = key
  revokeOpen.value = true
}
async function onRevoke() {
  if (!revokeTarget.value || !selectedId.value) return
  revoking.value = true
  try {
    await revokeMachineKey.mutateAsync({ scope: scope.value, principalId: selectedId.value, keyId: revokeTarget.value.id })
    revokeOpen.value = false
    toast.add({ title: 'Machine key revoked', color: 'success', icon: 'i-lucide-check' })
  } catch (err) {
    toast.add({ title: 'Could not revoke machine key', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    revoking.value = false
  }
}

const guideOpen = ref(false)
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
            <select
              id="scope-kind"
              v-model="scopeKind"
              class="rounded-md border border-default bg-default px-2.5 py-1.5 text-sm text-default"
            >
              <option value="platform_global">
                Platform global
              </option>
              <option value="entity">
                Entity
              </option>
            </select>
          </div>
          <div v-if="scopeKind === 'entity'" class="space-y-1.5">
            <label for="scope-entity" class="block text-sm font-medium text-default">Entity</label>
            <select
              id="scope-entity"
              v-model="entityId"
              class="min-w-56 rounded-md border border-default bg-default px-2.5 py-1.5 text-sm text-default"
            >
              <option value="">
                Select an entity...
              </option>
              <option v-for="e in entityOptions" :key="e.id" :value="e.id">
                {{ e.display_name }}
              </option>
            </select>
          </div>
        </div>

        <UAlert
          v-if="status === 'error'"
          color="error"
          icon="i-lucide-triangle-alert"
          title="Could not load service accounts"
          :description="getApiErrorMessage(error)"
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
          <div class="max-h-48 space-y-1.5 overflow-y-auto rounded-md border border-default p-3">
            <UCheckbox
              v-for="option in grantableScopes"
              :key="option"
              :label="option"
              :model-value="saState.scopes.includes(option)"
              @update:model-value="toggleSaScope(option)"
            />
          </div>
          <p v-if="saErrors.scopes" class="text-xs text-error">
            {{ saErrors.scopes }}
          </p>
        </div>
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
