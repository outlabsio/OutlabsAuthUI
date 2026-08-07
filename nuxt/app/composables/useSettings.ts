import { useQuery } from '@pinia/colada'
import { entityTypeConfigQuery } from '~/queries/settings'
import { getApiErrorMessage } from '~/api/client'

// Feature logic for the settings view — runtime capabilities (from the Colada-owned session)
// plus the read-only entity-type config. The SFC binds this and renders.

export function useSettings() {
  const { capabilities, can } = useAuth()

  const features = computed(() => {
    const f = capabilities.value?.features
    if (!f) return []
    return (Object.entries(f) as [string, boolean][]).map(([key, on]) => ({ label: key.replace(/_/g, ' '), on }))
  })

  const authMethods = computed(() => {
    const m = capabilities.value?.auth_methods
    if (!m) return []
    return (Object.entries(m) as [string, boolean][]).filter(([, on]) => on).map(([key]) => key.replace(/_/g, ' '))
  })

  const entityHierarchyOn = computed(() => can('entity_hierarchy'))

  // Gate the config fetch on the capability so a minimal backend never 404s here.
  const { data: entityConfig, status: configStatus, error: configError } = useQuery(() => ({
    ...entityTypeConfigQuery,
    enabled: entityHierarchyOn.value
  }))
  const configErrorMessage = computed(() => getApiErrorMessage(configError.value))

  return {
    capabilities,
    features,
    authMethods,
    entityHierarchyOn,
    entityConfig,
    configStatus,
    configErrorMessage
  }
}
