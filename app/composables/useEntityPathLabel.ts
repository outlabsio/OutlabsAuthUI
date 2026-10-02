import type { MaybeRefOrGetter } from 'vue'
import { useQuery } from '@pinia/colada'
import { entityPathQuery } from '~/queries/entities'

// The readable path of one entity ("ACME Realty / West Coast Region / SF Office") from GET
// /entities/{id}/path, for naming where a record lives (a service account's anchor). Same key and
// `enabled` as useAssignableRoles' path read, so both share one entry. null while unknown or when
// the actor cannot read entities (callers fall back to a generic label).
export function useEntityPathLabel(entityId: MaybeRefOrGetter<string | null | undefined>) {
  const { canAccess, isEnterprise } = useAuth()
  const id = computed(() => (isEnterprise.value ? toValue(entityId) || null : null))
  const { data, status } = useQuery(() => ({
    ...entityPathQuery(id.value ?? ''),
    enabled: Boolean(id.value) && canAccess('entities')
  }))
  const path = computed(() => (id.value && data.value?.length ? data.value : null))
  const name = computed(() => path.value?.[path.value.length - 1]?.display_name ?? null)
  const label = computed(() => path.value?.map(entity => entity.display_name).join(' / ') ?? null)
  const inactive = computed(() => Boolean(path.value && path.value[path.value.length - 1]?.status !== 'active'))
  return { name, label, inactive, status }
}
