import type { Ref } from 'vue'
import { useQuery } from '@pinia/colada'
import { auditEventsQuery } from '~/queries/audit'
import { emptyAuditFilters, type UserAuditEvent } from '~/types/audit'
import { appSection, capabilityAvailable } from '~/utils/capabilities'

// The entity's Activity card: the Audit section's search narrowed to this entity
// (GET /audit-events?entity_id=…). It follows that section's requirement (canAccess('audit'))
// and is hidden where the server does not offer audit search at all. The server records
// membership and access events, not entity create / update / move / archive (F-241).
const PAGE_SIZE = 10

export function useEntityActivity(entityId: Ref<string>) {
  const { capabilities, canAccess } = useAuth()

  const available = computed(() => capabilityAvailable(appSection('audit').requires, capabilities.value))
  const canOpenAudit = computed(() => canAccess('audit'))

  const page = ref(1)
  watch(entityId, () => {
    page.value = 1
  })
  const { data, status, error, refetch } = useQuery(() => ({
    ...auditEventsQuery({ page: page.value, limit: PAGE_SIZE, filters: { ...emptyAuditFilters, entityId: entityId.value } }),
    enabled: canOpenAudit.value && Boolean(entityId.value)
  }))
  const events = computed<UserAuditEvent[]>(() => data.value?.items ?? [])
  const total = computed(() => data.value?.total ?? 0)
  const auditLink = computed(() => ({ path: appSection('audit').to, query: { entityId: entityId.value } }))

  return { available, canOpenAudit, page, pageSize: PAGE_SIZE, events, total, status, error, refetch, auditLink }
}
