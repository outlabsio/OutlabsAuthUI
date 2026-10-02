import type { DropdownMenuItem } from '@nuxt/ui'
import { useQuery } from '@pinia/colada'
import { principalKeysQuery, useArchivePrincipal, useUpdatePrincipal } from '~/queries/api-keys'
import type { IntegrationPrincipal } from '~/types/api-key'
import {
  liveKeyCount,
  principalScope,
  serviceAccountLifecycleCopy,
  serviceAccountPath,
  serviceAccountPolicy,
  type ServiceAccountPolicy,
  type ServiceAccountScope
} from '~/utils/service-accounts'

// What an admin may do with a service account, shared by the list (row menus) and the account
// page (navbar): Edit opens <AppServiceAccountFormDialog> (bind `formOpen` / `formTarget`),
// Deactivate, Reactivate and Archive open one AppConfirmDialog (bind `lifecycle`). Built from the
// admin's grants and the account's state (utils/service-accounts.ts serviceAccountPolicy):
// archived accounts are read-only; Edit, Deactivate and Reactivate need api_key:update, Archive
// api_key:delete, Create api_key:create (tree-scoped grants count at the account's entity).
// Deactivating or archiving revokes every key the account owns: the confirmation says how many
// (its keys are read while the dialog is open; the account page already holds them).

export type ServiceAccountFormTarget
  = | { mode: 'create', scope: ServiceAccountScope }
    | { mode: 'edit', account: IntegrationPrincipal }

type LifecycleTarget = { account: IntegrationPrincipal, action: 'deactivate' | 'reactivate' | 'archive' }

/**
 * The admin's grants over service accounts and their keys (the backend permission algebra:
 * api_key:*_tree counts, superusers pass). Archive and key revoke on SimpleRBAC's platform routes
 * also accept api_key:revoke.
 */
export function useServiceAccountGrants() {
  const { hasPermission, hasAnyPermission, canAccess, isEnterprise } = useAuth()
  const canRead = computed(() => canAccess('service-accounts'))
  const canCreate = computed(() => canRead.value && hasPermission('api_key:create'))
  const canUpdate = computed(() => canRead.value && hasPermission('api_key:update'))
  const canDelete = computed(() => canRead.value && hasAnyPermission(isEnterprise.value ? ['api_key:delete'] : ['api_key:delete', 'api_key:revoke']))
  return { canRead, canCreate, canUpdate, canDelete }
}

export function useServiceAccountActions() {
  const { canRead, canCreate, canUpdate, canDelete } = useServiceAccountGrants()

  function policy(account: IntegrationPrincipal): ServiceAccountPolicy {
    return serviceAccountPolicy(account, { canCreate: canCreate.value, canUpdate: canUpdate.value, canDelete: canDelete.value })
  }

  // --- Create / Edit (one dialog) ---
  const formOpen = ref(false)
  const formTarget = shallowRef<ServiceAccountFormTarget | null>(null)
  function openCreate(scope: ServiceAccountScope) {
    formTarget.value = { mode: 'create', scope }
    formOpen.value = true
  }
  function openEdit(account: IntegrationPrincipal) {
    formTarget.value = { mode: 'edit', account }
    formOpen.value = true
  }

  // --- Deactivate / Reactivate / Archive ---
  const update = useUpdatePrincipal()
  const archive = useArchivePrincipal()
  // The account the confirmation is about, for its live-key count.
  const asked = shallowRef<LifecycleTarget | null>(null)
  const countsKeys = computed(() => Boolean(canRead.value && asked.value && asked.value.action !== 'reactivate'))
  // The account page reads the same key with its own `enabled`: while nothing is counted this
  // points at a placeholder key, so the two never disagree on one entry (one enabled per key).
  const keysOfAsked = useQuery(() => ({
    ...principalKeysQuery(countsKeys.value && asked.value
      ? { scope: principalScope(asked.value.account), principalId: asked.value.account.id }
      : { scope: { kind: 'platform_global' }, principalId: '' }),
    enabled: countsKeys.value
  }))
  const liveKeys = computed(() => (countsKeys.value && keysOfAsked.data.value?.complete
    ? liveKeyCount(keysOfAsked.data.value.items)
    : null))

  const lifecycle = useConfirmAction<LifecycleTarget>({
    describe: ({ account, action }) => serviceAccountLifecycleCopy(account, action, liveKeys.value),
    action: ({ account, action }) => {
      const scope = principalScope(account)
      if (action === 'archive') return archive.mutateAsync({ scope, principalId: account.id })
      return update.mutateAsync({ scope, principalId: account.id, input: { status: action === 'deactivate' ? 'inactive' : 'active' } })
    },
    success: ({ action }) => `Service account ${action === 'archive' ? 'archived' : action === 'deactivate' ? 'deactivated' : 'reactivated'}`,
    error: ({ action }) => `Could not ${action} service account`
  })
  function ask(account: IntegrationPrincipal, action: LifecycleTarget['action']) {
    asked.value = { account, action }
    lifecycle.ask({ account, action })
  }

  /**
   * The secondary actions of an account, in order: View (lists only), Edit, Deactivate or
   * Reactivate, then Archive last in error colour. Empty when nothing can succeed (hide the menu).
   */
  function menuItems(account: IntegrationPrincipal, menu: { view?: boolean, edit?: boolean } = {}): DropdownMenuItem[] {
    const p = policy(account)
    const items: DropdownMenuItem[] = []
    if (menu.view) items.push({ label: 'View', icon: 'i-lucide-eye', to: serviceAccountPath(account) })
    if (menu.edit !== false && p.canEdit) items.push({ label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openEdit(account) })
    if (p.canDeactivate) items.push({ label: 'Deactivate', icon: 'i-lucide-pause', onSelect: () => ask(account, 'deactivate') })
    if (p.canReactivate) items.push({ label: 'Reactivate', icon: 'i-lucide-play', onSelect: () => ask(account, 'reactivate') })
    if (p.canArchive) items.push({ label: 'Archive', icon: 'i-lucide-archive', color: 'error' as const, onSelect: () => ask(account, 'archive') })
    return items
  }

  return {
    canRead,
    canCreate,
    canUpdate,
    canDelete,
    policy,
    menuItems,
    formOpen,
    formTarget,
    openCreate,
    openEdit,
    lifecycle
  }
}
