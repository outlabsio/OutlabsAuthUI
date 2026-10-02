import type { Ref } from 'vue'
import { useQuery } from '@pinia/colada'
import { principalDetailQuery } from '~/queries/api-keys'
import { isUuid } from '~/utils/users'
import { serviceAccountPath } from '~/utils/service-accounts'

// Which service account owns a key in the entity key inventory: its name from the account record
// (one cached query per id, shared with the account's page) and a link to that page. While the
// record loads, or if it cannot be read, the label stays "Service account".
export function useServiceAccountLabel(accountId: Ref<string>, entityId: Ref<string>) {
  const { canAccess } = useAuth()
  const readable = computed(() => canAccess('service-accounts') && isUuid(accountId.value) && isUuid(entityId.value))
  const { data } = useQuery(() => ({
    ...principalDetailQuery({ scope: { kind: 'entity', entityId: entityId.value }, principalId: accountId.value }),
    enabled: readable.value
  }))
  const label = computed(() => data.value?.name ?? 'Service account')
  const to = computed(() => serviceAccountPath({ id: accountId.value, scope_kind: 'entity', anchor_entity_id: entityId.value }))
  return { label, to, title: computed(() => `Service account ID ${accountId.value}`) }
}
