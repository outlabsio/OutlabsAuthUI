import { useQuery } from '@pinia/colada'
import { entityTypeConfigQuery, useUpdateEntityTypeConfig } from '~/queries/settings'
import { normalizeTypeList, type EntityTypeConfigSchema } from '~/schemas/settings'
import type { ActionError } from '~/composables/useApiAction'
import type { DetailItem } from '~/types/display'
import { enabledAuthMethods, featureList, surfaceLabel } from '~/utils/capability-labels'

// Settings (admins only: the 'settings' section requirement, F-186). The auth server's
// capabilities in one labelled list (the shared capability label map), and the entity-type
// taxonomy of an EnterpriseRBAC host: read by every admin, edited by superusers (the PUT needs
// one), in an AppFormDialog with tag inputs (F-187).

export function useSettings() {
  const { capabilities, isSuperuser, hasSurface, can, apiContract } = useAuth()
  const { run } = useApiAction()

  const contractNotice = useApiContractNotice()
  const features = computed(() => featureList(capabilities.value?.features))
  const mountedSurfaces = computed(() => capabilities.value?.mounted_surfaces?.map(surface => ({ key: surface, label: surfaceLabel(surface) })) ?? null)

  const serverItems = computed<DetailItem[]>(() => {
    const c = capabilities.value
    return [
      { key: 'preset', label: 'Preset', value: c?.preset ?? null },
      { key: 'library', label: 'Library version', value: c?.library_version ?? null, type: 'code', fallback: 'Not reported' },
      { key: 'contract', label: 'API contract', value: apiContract.value.version ?? null, type: 'code', fallback: 'Not reported' },
      { key: 'methods', label: 'Sign-in methods', value: enabledAuthMethods(c?.auth_methods).join(', ') || null, fallback: 'None reported' },
      { key: 'surfaces', label: 'Mounted routers', full: true },
      { key: 'features', label: 'Features', full: true }
    ]
  })

  // Entity types live on the config router, and mean something only with the hierarchy on.
  const entityTypesOn = computed(() => hasSurface('config') && can('entity_hierarchy'))
  const { data: entityConfig, status: configStatus, error: configError, refetch: refetchConfig } = useQuery(() => ({
    ...entityTypeConfigQuery,
    enabled: entityTypesOn.value
  }))
  const entityTypeItems = computed<DetailItem[]>(() => [
    { key: 'structural-roots', label: 'Structural: root types' },
    { key: 'structural-children', label: 'Structural: default child types' },
    { key: 'access-group-roots', label: 'Access group: root types' },
    { key: 'access-group-children', label: 'Access group: default child types' }
  ])
  const entityTypeLists = computed<Record<string, string[]>>(() => {
    const c = entityConfig.value
    return {
      'structural-roots': c?.allowed_root_types.structural ?? [],
      'structural-children': c?.default_child_types.structural ?? [],
      'access-group-roots': c?.allowed_root_types.access_group ?? [],
      'access-group-children': c?.default_child_types.access_group ?? []
    }
  })

  // --- Edit (superuser only) ---
  const canEditConfig = computed(() => isSuperuser.value)
  const updateConfig = useUpdateEntityTypeConfig()
  const configOpen = ref(false)
  const saveError = ref<ActionError | null>(null)
  const configForm = useDialogForm('entityTypesDialog')
  const configState = reactive<EntityTypeConfigSchema>({
    structuralRootTypes: [],
    accessGroupRootTypes: [],
    structuralChildTypes: [],
    accessGroupChildTypes: []
  })
  // The PUT replaces only the groups it receives, so send only the groups the admin changed: an
  // edit of the child types never rewrites the root types another admin just changed (F-158).
  const configChanges = useDirtyPatch(configState, state => ({
    allowed_root_types: {
      structural: normalizeTypeList(state.structuralRootTypes),
      access_group: normalizeTypeList(state.accessGroupRootTypes)
    },
    default_child_types: {
      structural: normalizeTypeList(state.structuralChildTypes),
      access_group: normalizeTypeList(state.accessGroupChildTypes)
    }
  }))
  function openConfigEdit() {
    const c = entityConfig.value
    Object.assign(configState, {
      structuralRootTypes: [...(c?.allowed_root_types.structural ?? [])],
      accessGroupRootTypes: [...(c?.allowed_root_types.access_group ?? [])],
      structuralChildTypes: [...(c?.default_child_types.structural ?? [])],
      accessGroupChildTypes: [...(c?.default_child_types.access_group ?? [])]
    })
    configChanges.snapshot()
    saveError.value = null
    configOpen.value = true
  }
  async function onSaveConfig() {
    if (!configChanges.dirty.value) {
      configOpen.value = false
      return
    }
    const res = await run(() => updateConfig.mutateAsync(configChanges.patch.value), {
      success: 'Entity types updated',
      error: 'Could not update entity types',
      form: configForm,
      inline: saveError,
      fieldMap: {
        'allowed_root_types.structural': 'structuralRootTypes',
        'allowed_root_types.access_group': 'accessGroupRootTypes',
        'default_child_types.structural': 'structuralChildTypes',
        'default_child_types.access_group': 'accessGroupChildTypes'
      }
    })
    if (res.ok) configOpen.value = false
  }

  return {
    capabilities,
    contractNotice,
    serverItems,
    mountedSurfaces,
    features,
    entityTypesOn,
    entityConfig,
    configStatus,
    configLoadError: configError,
    refetchConfig,
    entityTypeItems,
    entityTypeLists,
    canEditConfig,
    configOpen,
    configState,
    configDirty: configChanges.dirty,
    saveError,
    openConfigEdit,
    onSaveConfig
  }
}
