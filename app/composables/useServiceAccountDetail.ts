import type { Ref } from 'vue'
import type { NavigationMenuItem } from '@nuxt/ui'
import { useQuery } from '@pinia/colada'
import { principalDetailQuery } from '~/queries/api-keys'
import type { DetailItem } from '~/types/display'
import type { IntegrationPrincipal } from '~/types/api-key'
import { DEFINITION_STATUS_COLOR, badgeColor } from '~/utils/status'
import { isUuid } from '~/utils/users'
import { serviceAccountStatusLabel, type ServiceAccountScope } from '~/utils/service-accounts'

// A service account's page (F-026, F-122, F-128, F-219): /app/service-accounts/<id>, with
// ?entity=<anchor> for an account anchored at an entity (the API addresses it under that entity)
// and ?tab=overview|access|keys. Explicit pending, not-found and denied states (a malformed id is
// never sent; on EnterpriseRBAC a platform-wide account is superuser-only, so anyone else is told
// so without a refused request). The navbar holds Edit and the account's other actions
// (useServiceAccountActions), Archive last.

export type ServiceAccountTab = 'overview' | 'access' | 'keys'
const TABS: { value: ServiceAccountTab, label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'access', label: 'Access' },
  { value: 'keys', label: 'Keys' }
]

export function useServiceAccountDetail(accountId: Ref<string>) {
  const route = useRoute()
  const { isEnterprise, isSuperuser } = useAuth()
  // An archived account stays readable: after Archive the page shows it read-only.
  const actions = useServiceAccountActions()
  const { canRead } = actions

  const entityParam = computed(() => (typeof route.query.entity === 'string' ? route.query.entity : ''))
  const scope = computed<ServiceAccountScope>(() => (isEnterprise.value && entityParam.value
    ? { kind: 'entity', entityId: entityParam.value }
    : { kind: 'platform_global' }))
  const validId = computed(() => isUuid(accountId.value) && (scope.value.kind === 'platform_global' || isUuid(scope.value.entityId)))
  // EnterpriseRBAC serves platform-wide accounts to superusers only.
  const platformDenied = computed(() => isEnterprise.value && !isSuperuser.value && scope.value.kind === 'platform_global')

  const { data, status, error, isLoading, refetch } = useQuery(() => ({
    ...principalDetailQuery({ scope: scope.value, principalId: accountId.value }),
    enabled: canRead.value && validId.value && !platformDenied.value
  }))
  const account = computed<IntegrationPrincipal | null>(() => data.value ?? null)
  const apiError = useApiError(error)
  // 404: missing or not under that entity; 422: an id the API cannot parse.
  const notFound = computed(() => !validId.value || (!data.value && (apiError.value?.kind === 'not_found' || apiError.value?.status === 422)))
  const denied = computed(() => !notFound.value && (platformDenied.value || (!data.value && apiError.value?.kind === 'forbidden')))
  const deniedMessage = computed(() => (platformDenied.value
    ? 'Platform-wide service accounts are managed by superusers.'
    : apiError.value?.message ?? ''))

  // --- Tabs (?tab=; Back leaves the record rather than stepping through them) ---
  const tab = computed<ServiceAccountTab>(() => {
    const requested = typeof route.query.tab === 'string' ? route.query.tab : 'overview'
    return TABS.some(t => t.value === requested) ? requested as ServiceAccountTab : 'overview'
  })
  const tabs = computed<NavigationMenuItem[]>(() => TABS.map(({ value, label }) => {
    const query = { ...route.query }
    if (value === 'overview') delete query.tab
    else query.tab = value
    const active = tab.value === value
    return { label, value, 'to': { query }, active, 'aria-current': active ? 'page' : undefined }
  }))

  // --- Overview ---
  const anchor = useEntityPathLabel(() => (account.value?.scope_kind === 'entity' ? account.value.anchor_entity_id : null))
  const detailItems = computed<DetailItem[]>(() => {
    const a = account.value
    if (!a) return []
    const entity = a.scope_kind === 'entity'
    return [
      { label: 'Status', value: a.status, badge: { color: badgeColor(DEFINITION_STATUS_COLOR, a.status), label: serviceAccountStatusLabel(a.status), variant: 'subtle' } },
      { key: 'scope', label: 'Scope', value: entity ? (anchor.label.value ?? 'An entity') : 'Platform-wide' },
      ...(entity ? [{ label: 'Includes child entities', value: a.inherit_from_tree, type: 'boolean' } satisfies DetailItem] : []),
      { label: 'Created', value: a.created_at, type: 'datetime' },
      { label: 'Updated', value: a.updated_at, type: 'datetime' },
      { key: 'created-by', label: 'Created by', value: a.created_by_user_id, fallback: 'Unknown' }
    ]
  })

  const policy = computed(() => (account.value ? actions.policy(account.value) : null))
  const canEdit = computed(() => Boolean(policy.value?.canEdit))
  const moreItems = computed(() => (account.value ? actions.menuItems(account.value, { edit: false }) : []))

  return {
    ...actions,
    account,
    status,
    error,
    isLoading,
    refetch,
    notFound,
    denied,
    deniedMessage,
    tab,
    tabs,
    detailItems,
    anchorInactive: anchor.inactive,
    policy,
    canEdit,
    moreItems
  }
}
