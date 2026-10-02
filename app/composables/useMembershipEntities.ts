import type { MaybeRefOrGetter } from 'vue'
import { useQuery } from '@pinia/colada'
import { entityPathsQuery } from '~/queries/entities'
import { indexEntities } from '~/utils/entity-tree'
import type { Entity } from '~/types/entity'

// Names the entities an account's memberships point at (F-066), for the Memberships card and the
// Effective permissions card alike. The anchored admin's organization (all statuses) or, for an
// admin who browses every organization (useEntityScope: superusers, system-wide admins), every
// entity the list returns; entities still missing (another organization's inactive or archived
// ones) are read by id, a bounded handful. Both cards pass the same ids, so the reads are shared
// by query key.

export function useMembershipEntities(entityIds: MaybeRefOrGetter<readonly string[]>, enabled: MaybeRefOrGetter<boolean>) {
  const { isEnterprise } = useAuth()
  const { anchoredRootId } = useEntityScope()

  const { entities: knownEntities } = useScopedEntities(() => toValue(enabled) && isEnterprise.value)
  const knownById = computed(() => indexEntities(knownEntities.value))
  const missingEntityIds = computed(() => [...new Set(toValue(entityIds))]
    .filter(id => !knownById.value.has(id))
    .slice(0, 20))
  const { data: missingPaths } = useQuery(() => ({
    ...entityPathsQuery(missingEntityIds.value),
    enabled: toValue(enabled) && !anchoredRootId.value && missingEntityIds.value.length > 0 && knownEntities.value.length > 0
  }))
  const entityById = computed(() => {
    const map = new Map<string, Entity>(knownById.value)
    for (const [id, chain] of Object.entries(missingPaths.value ?? {})) {
      const entity = chain.at(-1)
      if (entity && entity.id === id) map.set(id, entity)
    }
    return map
  })
  const entityInactive = (entityId: string) => {
    const entity = entityById.value.get(entityId)
    return Boolean(entity && entity.status !== 'active')
  }
  const entityStatus = (entityId: string) => entityById.value.get(entityId)?.status ?? null

  return { knownById, entityById, entityInactive, entityStatus }
}
