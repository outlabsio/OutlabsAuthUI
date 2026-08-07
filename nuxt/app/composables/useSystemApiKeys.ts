import { useQuery } from '@pinia/colada'
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
import { rolesListQuery } from '~/queries/roles'
import { getApiErrorMessage } from '~/api/client'
import type { ApiKey, CreateMachineKeyInput, CreatePrincipalInput, IntegrationPrincipal } from '~/types/api-key'
import type { Entity } from '~/types/entity'
import type { Role } from '~/types/role'

// Feature logic for System API Keys — service accounts (integration principals) and their
// machine keys, platform-global OR entity-scoped, with a per-entity inventory tab and the
// one-time secret reveal. Gated by apikey:read (superusers pass). The SFC binds this and owns
// display config (columns, status colours, scope-kind options).

export function useSystemApiKeys() {
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

  // The full hierarchy for the scope picker (the USelectMenu searches it client-side).
  const { data: entitiesData } = useQuery(() => ({ ...entitiesListQuery({ limit: 1000 }), enabled: canRead.value }))
  const entityOptions = computed<Entity[]>(() => entitiesData.value?.items ?? [])
  const entitySelectItems = computed(() => entityOptions.value.map(e => ({ label: e.display_name, value: e.id })))

  // Roles for the service-account role envelope. Platform-global accounts can only carry global
  // roles; entity-scoped accounts can carry entity roles too (the backend still validates).
  const { data: rolesData } = useQuery(() => ({ ...rolesListQuery({ limit: 100 }), enabled: canRead.value }))
  const roleOptions = computed<Role[]>(() => {
    const all = rolesData.value?.items ?? []
    return scopeKind.value === 'platform_global' ? all.filter(r => r.is_global) : all
  })

  const { data: principalsData, status, error } = useQuery(() => ({ ...principalsQuery(scope.value), enabled: canRead.value && scopeReady.value }))
  const errorMessage = computed(() => getApiErrorMessage(error.value))
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

  function keyMenu(key: ApiKey) {
    const terminal = key.status === 'revoked' || key.status === 'expired'
    return [
      { label: 'Rotate', icon: 'i-lucide-refresh-cw', disabled: terminal, onSelect: () => openRotate(key) },
      { label: 'Revoke', icon: 'i-lucide-ban', color: 'error' as const, disabled: terminal, onSelect: () => openRevoke(key) }
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
  const saState = reactive({ name: '', description: '', scopes: [] as string[], roleIds: [] as string[], inherit: false })
  const saErrors = reactive({ name: '', envelope: '' })
  const createPrincipal = useCreatePrincipal()
  const creatingSa = ref(false)

  function openCreatePrincipal() {
    Object.assign(saState, { name: '', description: '', scopes: [], roleIds: [], inherit: false })
    saErrors.name = ''
    saErrors.envelope = ''
    createSaOpen.value = true
  }
  function clearEnvelopeError() {
    if (saState.scopes.length || saState.roleIds.length) saErrors.envelope = ''
  }
  function toggleSaScope(value: string) {
    const idx = saState.scopes.indexOf(value)
    if (idx === -1) saState.scopes.push(value)
    else saState.scopes.splice(idx, 1)
    clearEnvelopeError()
  }
  function toggleSaRole(roleId: string) {
    const idx = saState.roleIds.indexOf(roleId)
    if (idx === -1) saState.roleIds.push(roleId)
    else saState.roleIds.splice(idx, 1)
    clearEnvelopeError()
  }
  async function onCreatePrincipal() {
    saErrors.name = saState.name.trim() ? '' : 'Name is required.'
    saErrors.envelope = (saState.scopes.length || saState.roleIds.length) ? '' : 'Select at least one scope or role.'
    if (saErrors.name || saErrors.envelope) return

    creatingSa.value = true
    try {
      const input: CreatePrincipalInput = {
        name: saState.name.trim(),
        allowed_scopes: [...saState.scopes],
        inherit_from_tree: saState.inherit
      }
      if (saState.roleIds.length) input.role_ids = [...saState.roleIds]
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
  function toggleKeyScope(value: string) {
    const idx = keyState.scopes.indexOf(value)
    if (idx === -1) keyState.scopes.push(value)
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

  return {
    // scope
    scopeKind,
    entityId,
    entitySelectItems,
    scopeReady,
    // list/detail
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
    // create service account
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
    // create machine key
    createKeyOpen,
    keyState,
    keyErrors,
    principalScopes,
    toggleKeyScope,
    creatingKey,
    openCreateKey,
    onCreateKey,
    // one-time secret
    secretOpen,
    secret,
    copySecret,
    // rotate / revoke
    rotateOpen,
    rotateTarget,
    rotating,
    onRotate,
    revokeOpen,
    revokeTarget,
    revoking,
    onRevoke,
    // guide
    guideOpen
  }
}
