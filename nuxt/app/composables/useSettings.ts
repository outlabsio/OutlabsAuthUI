import { useQuery } from '@pinia/colada'
import type { FormSubmitEvent } from '@nuxt/ui'
import { entityTypeConfigQuery, useUpdateEntityTypeConfig } from '~/queries/settings'
import { parseTypeList } from '~/schemas/settings'
import type { EntityTypeConfigSchema } from '~/schemas/settings'

// Feature logic for the settings view — runtime capabilities (from the Colada-owned session), the
// entity-type config (read + superuser edit). The SFC binds this and renders.

export function useSettings() {
  const { capabilities, can, isSuperuser } = useAuth()
  const { run } = useApiAction()

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
  const configErrorMessage = useApiErrorMessage(configError)

  // --- Edit (superuser only — the PUT requires it) ---
  const canEditConfig = computed(() => isSuperuser.value)
  const updateConfig = useUpdateEntityTypeConfig()
  const configOpen = ref(false)
  const savingConfig = ref(false)
  const configState = reactive<EntityTypeConfigSchema>({
    structural_root_types: '',
    access_group_root_types: '',
    structural_child_types: '',
    access_group_child_types: ''
  })
  function openConfigEdit() {
    const c = entityConfig.value
    configState.structural_root_types = (c?.allowed_root_types.structural ?? []).join(', ')
    configState.access_group_root_types = (c?.allowed_root_types.access_group ?? []).join(', ')
    configState.structural_child_types = (c?.default_child_types.structural ?? []).join(', ')
    configState.access_group_child_types = (c?.default_child_types.access_group ?? []).join(', ')
    configOpen.value = true
  }
  async function onSaveConfig(event: FormSubmitEvent<EntityTypeConfigSchema>) {
    savingConfig.value = true
    const res = await run(() => updateConfig.mutateAsync({
      allowed_root_types: {
        structural: parseTypeList(event.data.structural_root_types),
        access_group: parseTypeList(event.data.access_group_root_types)
      },
      default_child_types: {
        structural: parseTypeList(event.data.structural_child_types),
        access_group: parseTypeList(event.data.access_group_child_types)
      }
    }), { success: 'Entity types updated', error: 'Could not update entity types' })
    if (res.ok) configOpen.value = false
    savingConfig.value = false
  }

  return {
    capabilities,
    features,
    authMethods,
    entityHierarchyOn,
    entityConfig,
    configStatus,
    configErrorMessage,
    canEditConfig,
    configOpen,
    configState,
    savingConfig,
    openConfigEdit,
    onSaveConfig
  }
}
