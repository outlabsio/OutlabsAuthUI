import { useQuery } from '@pinia/colada'
import { grantableScopesQuery, myApiKeysQuery, useCreateApiKey, useRevokeApiKey, useRotateApiKey } from '~/queries/api-keys'
import { getApiErrorMessage } from '~/api/client'
import type { ApiKey, CreateApiKeyInput } from '~/types/api-key'

// Feature logic for personal API keys — mint (with a grantable-scope picker), rotate, revoke,
// and the one-time secret reveal. No permission gate: every actor manages their own keys. The
// SFC binds this and owns display config (columns, status colours).

export function useApiKeysWorkspace() {
  const toast = useToast()

  const { data, status, error, refetch } = useQuery(myApiKeysQuery)
  const { data: grantable } = useQuery(grantableScopesQuery)
  const rows = computed<ApiKey[]>(() => data.value ?? [])
  const grantableScopes = computed<string[]>(() => grantable.value?.grantable_scopes ?? [])
  const errorMessage = computed(() => getApiErrorMessage(error.value))

  function rowMenu(key: ApiKey) {
    const terminal = key.status === 'revoked' || key.status === 'expired'
    return [
      { label: 'Rotate', icon: 'i-lucide-refresh-cw', disabled: terminal, onSelect: () => openRotate(key) },
      { label: 'Revoke', icon: 'i-lucide-ban', color: 'error' as const, disabled: terminal, onSelect: () => openRevoke(key) }
    ]
  }

  // --- One-time secret reveal (shared by create + rotate) ---
  const secretOpen = ref(false)
  const secret = ref('')
  const secretTitle = ref('Store the new API key now')

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

  // --- Mint ---
  const mintOpen = ref(false)
  // Numeric inputs are held as strings (that's what UInput binds) and coerced at submit.
  const mintState = reactive({ name: '', description: '', scopes: [] as string[], rateLimit: '60', unlimited: false, expiresInDays: '' })
  const mintErrors = reactive({ name: '', scopes: '' })
  const createApiKey = useCreateApiKey()
  const creating = ref(false)

  function openMint() {
    Object.assign(mintState, { name: '', description: '', scopes: [], rateLimit: '60', unlimited: false, expiresInDays: '' })
    mintErrors.name = ''
    mintErrors.scopes = ''
    mintOpen.value = true
  }
  function toggleScope(scope: string) {
    const idx = mintState.scopes.indexOf(scope)
    if (idx === -1) mintState.scopes.push(scope)
    else mintState.scopes.splice(idx, 1)
    if (mintState.scopes.length) mintErrors.scopes = ''
  }
  watch(() => mintState.unlimited, (unlimited) => {
    if (unlimited) mintState.rateLimit = '0'
    else if (mintState.rateLimit === '0') mintState.rateLimit = '60'
  })

  async function onMint() {
    mintErrors.name = mintState.name.trim() ? '' : 'Name is required.'
    mintErrors.scopes = mintState.scopes.length ? '' : 'Select at least one scope.'
    if (mintErrors.name || mintErrors.scopes) return

    creating.value = true
    try {
      const input: CreateApiKeyInput = {
        name: mintState.name.trim(),
        scopes: [...mintState.scopes],
        key_kind: 'personal',
        rate_limit_per_minute: mintState.unlimited ? 0 : Number(mintState.rateLimit)
      }
      if (mintState.description.trim()) input.description = mintState.description.trim()
      if (mintState.expiresInDays !== '' && Number(mintState.expiresInDays) > 0) input.expires_in_days = Number(mintState.expiresInDays)

      const created = await createApiKey.mutateAsync(input)
      mintOpen.value = false
      secretTitle.value = 'Store the new API key now'
      revealSecret(created.api_key)
      toast.add({ title: 'API key created', color: 'success', icon: 'i-lucide-check' })
      await refetch()
    } catch (err) {
      toast.add({ title: 'Could not create API key', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
    } finally {
      creating.value = false
    }
  }

  // --- Rotate ---
  const rotateOpen = ref(false)
  const rotateTarget = ref<ApiKey | null>(null)
  const rotateApiKey = useRotateApiKey()
  const rotating = ref(false)

  function openRotate(key: ApiKey) {
    rotateTarget.value = key
    rotateOpen.value = true
  }
  async function onRotate() {
    if (!rotateTarget.value) return
    rotating.value = true
    try {
      const rotated = await rotateApiKey.mutateAsync(rotateTarget.value.id)
      rotateOpen.value = false
      secretTitle.value = 'Store the new API key now'
      revealSecret(rotated.api_key)
      toast.add({ title: 'API key rotated', color: 'success', icon: 'i-lucide-check' })
      await refetch()
    } catch (err) {
      toast.add({ title: 'Could not rotate API key', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
    } finally {
      rotating.value = false
    }
  }

  // --- Revoke ---
  const revokeOpen = ref(false)
  const revokeTarget = ref<ApiKey | null>(null)
  const revokeApiKey = useRevokeApiKey()
  const revoking = ref(false)

  function openRevoke(key: ApiKey) {
    revokeTarget.value = key
    revokeOpen.value = true
  }
  async function onRevoke() {
    if (!revokeTarget.value) return
    revoking.value = true
    try {
      await revokeApiKey.mutateAsync(revokeTarget.value.id)
      revokeOpen.value = false
      toast.add({ title: 'API key revoked', color: 'success', icon: 'i-lucide-check' })
      await refetch()
    } catch (err) {
      toast.add({ title: 'Could not revoke API key', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
    } finally {
      revoking.value = false
    }
  }

  return {
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
  }
}
