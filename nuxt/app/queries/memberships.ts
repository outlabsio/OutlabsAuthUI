import { defineQueryOptions } from '@pinia/colada'
import { apiClient } from '~/utils/api'
import type { EntityMember } from '~/types/membership'

// Memberships. The Users card on an entity reads its active members (with user details +
// roles) from GET /memberships/entity/{id}/details — requires membership:read (superusers pass).

const MEMBERSHIPS_ROOT = 'memberships' as const

export const entityMembersQuery = defineQueryOptions((entityId: string) => ({
  key: [MEMBERSHIPS_ROOT, 'entity', entityId],
  query: ctx => apiClient.get<EntityMember[]>(`/memberships/entity/${entityId}/details`, { signal: ctx?.signal })
}))
