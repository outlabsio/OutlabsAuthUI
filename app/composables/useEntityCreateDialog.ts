import type { Ref } from 'vue'
import type { FormErrorEvent, FormSubmitEvent } from '@nuxt/ui'
import { useQuery } from '@pinia/colada'
import { entityPathQuery, entityTypeSuggestionsQuery, useCreateEntity } from '~/queries/entities'
import { entityTypeConfigQuery } from '~/queries/settings'
import { createEntitySchema, isPortablePattern, patternFieldHelp, slugFrom, systemNameFrom, type CreateEntitySchema } from '~/schemas/entity'
import type { CreateEntityInput, Entity, EntityClassValue } from '~/types/entity'
import type { ActionError } from '~/composables/useApiAction'
import { allowedChildTypesHelp, allowedChildTypesOwner, effectiveAllowedChildTypes, enforcedTypesHelp, indexEntities } from '~/utils/entity-tree'
import { endOfDayIso, startOfDayIso } from '~/utils/validity'

// Create an entity (F-073, F-074): placement first (inside an organisation, or a new top-level
// organisation for admins who browse every organisation), then class and type, then identity
// (system name and slug follow the display name until edited), then the optional details in an
// "Advanced" section. The dialog mirrors the server's rules so it offers what will be accepted:
// - the Type list is the parent's allowed child types, else its root organisation's (enforced),
//   else suggestions from siblings and the configured defaults (free entry allowed); a new root
//   uses the configured root types for its class (enforced);
// - access groups cannot hold structural entities;
// - the root organisation's naming rules are checked on the fields before submit where the console
//   can match them as the server does (schemas/entity.ts), else by the server on submit (its
//   refusal lands on the field), and its naming guidance is shown.

const FIELD_MAP = {
  'parent_entity_id': 'parentId',
  'entity_class': 'entityClass',
  'entity_type': 'entityType',
  'display_name': 'displayName',
  'name': 'name',
  'slug': 'slug',
  'description': 'description',
  'status': 'status',
  'valid_from': 'validFrom',
  'valid_until': 'validUntil',
  'allowed_child_classes': 'allowedChildClasses',
  'allowed_child_types': 'allowedChildTypes',
  'max_members': 'maxMembers',
  'child_name_pattern': 'childNamePattern',
  'child_display_name_pattern': 'childDisplayNamePattern',
  'child_slug_pattern': 'childSlugPattern',
  'child_naming_guidance': 'childNamingGuidance',
  // A name that breaks the root's naming rule: the server names the field by its label.
  'system name': 'name',
  'display name': 'displayName'
}

export type CreatePlacement = 'child' | 'root'

// Fields that live in the collapsed "Advanced options" section.
const ADVANCED_FIELDS = new Set(['status', 'validFrom', 'validUntil', 'maxMembers', 'allowedChildTypes', 'allowedChildClasses', 'childNamePattern', 'childDisplayNamePattern', 'childSlugPattern', 'childNamingGuidance'])

function blank(parentId: string | null): CreateEntitySchema {
  return {
    parentId: parentId ?? '',
    entityClass: 'structural',
    entityType: '',
    displayName: '',
    name: '',
    slug: '',
    description: '',
    status: 'active',
    validFrom: '',
    validUntil: '',
    allowedChildClasses: [],
    allowedChildTypes: [],
    maxMembers: null,
    childNamePattern: '',
    childDisplayNamePattern: '',
    childSlugPattern: '',
    childNamingGuidance: ''
  }
}

export function useEntityCreateDialog(parentPreset: Ref<string | null>, open: Ref<boolean>, onCreated: (entity: Entity) => void) {
  const { run } = useApiAction()
  const { hasSurface } = useAuth()
  const { anchoredRootId, canBrowseAllRoots } = useEntityScope()
  const form = useDialogForm('createEntityDialog')
  const error = ref<ActionError | null>(null)
  const state = reactive<CreateEntitySchema>(blank(null))
  const placement = ref<CreatePlacement>('child')
  const advancedOpen = ref(false)

  watch(open, (isOpen) => {
    if (!isOpen) return
    Object.assign(state, blank(parentPreset.value))
    // A new organisation only when nothing is in view and the admin may create one.
    placement.value = parentPreset.value || !canBrowseAllRoots.value ? 'child' : 'root'
    advancedOpen.value = false
    error.value = null
  }, { immediate: true })

  const isRoot = computed(() => placement.value === 'root')
  const placementItems = [
    { label: 'Inside an organization', value: 'child' as const, description: 'A region, office, team or group beneath an existing entity.' },
    { label: 'New organization', value: 'root' as const, description: 'A top-level entity: a separate tenant with its own users and roles.' }
  ]
  watch(placement, (value) => {
    if (value === 'root') state.parentId = ''
    else if (!state.parentId) state.parentId = parentPreset.value ?? ''
  })

  // --- The chosen parent's context: its chain, root organisation and governance ---
  const parentId = computed(() => (isRoot.value ? '' : state.parentId))
  // Not gated on `open`: the workspace reads the same key for its selection, and Pinia Colada
  // keeps one options object per entry (a closed dialog must not switch its refetch off).
  const { data: parentPath, status: parentPathStatus } = useQuery(() => ({
    ...entityPathQuery(parentId.value),
    enabled: Boolean(parentId.value)
  }))
  const parentChain = computed(() => (parentId.value ? parentPath.value ?? [] : []))
  const parent = computed<Entity | null>(() => parentChain.value.at(-1) ?? null)
  const rootOrganisation = computed<Entity | null>(() => parentChain.value[0] ?? null)
  const parentIsAccessGroup = computed(() => parent.value?.entity_class === 'access_group')
  // An access group holds access groups only, so its child starts on that class. Immediate, and
  // on every opening: the dialog mounts per opening (its key) and the parent's path is usually
  // cached already (the detail panel reads the same key), so the parent is known before any
  // change could trigger this.
  watch([open, parentIsAccessGroup], ([isOpen, accessGroup]) => {
    if (isOpen && accessGroup) state.entityClass = 'access_group'
  }, { immediate: true })
  const classItems = computed(() => [
    { label: 'Structural', value: 'structural' as EntityClassValue, description: 'Part of the organization chart: regions, offices, departments.', disabled: parentIsAccessGroup.value },
    { label: 'Access group', value: 'access_group' as EntityClassValue, description: 'Grants access across the structure: teams, projects, permission groups.' }
  ])

  // --- Type: enforced lists first, then suggestions ---
  const { data: config } = useQuery(() => ({ ...entityTypeConfigQuery, enabled: open.value && hasSurface('config') }))
  const { data: suggestions } = useQuery(() => ({
    ...entityTypeSuggestionsQuery({ parentId: parentId.value || null, entityClass: state.entityClass }),
    enabled: open.value && (isRoot.value || Boolean(parent.value))
  }))
  const parentIndex = computed(() => indexEntities(parentChain.value))
  // Types the server will accept here, or null when any type is accepted.
  const enforcedTypes = computed<string[] | null>(() => {
    if (isRoot.value) {
      const roots = config.value?.allowed_root_types?.[state.entityClass] ?? []
      return config.value ? roots : null
    }
    if (!parent.value) return null
    const allowed = effectiveAllowedChildTypes(parent.value, parentIndex.value)
    return allowed.length ? allowed : null
  })
  const typeItems = computed<string[]>(() => {
    if (enforcedTypes.value) return [...enforcedTypes.value]
    const seen = new Set<string>()
    const suggested = (suggestions.value?.suggestions ?? []).map(s => s.entity_type)
    const defaults = config.value?.default_child_types?.[state.entityClass] ?? []
    return [...suggested, ...defaults].filter((t) => {
      const key = t.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })
  const typeHelp = computed(() => {
    if (isRoot.value) {
      if (!enforcedTypes.value) return 'Top-level organizations use the configured root types.'
      return enforcedTypes.value.length
        ? `Top-level ${state.entityClass === 'structural' ? 'structural' : 'access-group'} entities can be: ${enforcedTypes.value.join(', ')}.`
        : 'No root types are configured for this class in Settings, so the server will refuse it.'
    }
    if (enforcedTypes.value) return enforcedTypesHelp(parent.value ? allowedChildTypesOwner(parent.value, parentIndex.value) : null)
    return typeItems.value.length ? 'Pick a suggestion or type a new one.' : 'Any type is accepted here.'
  })
  // The new entity's own "Allowed child types": empty falls back to its root organisation's list.
  const childTypesHelp = computed(() => allowedChildTypesHelp({ isRoot: isRoot.value, root: isRoot.value ? null : rootOrganisation.value }))
  function onCreateType(item: string) {
    if (enforcedTypes.value) return
    state.entityType = item.trim()
  }

  // --- Identity: system name and slug follow the display name until edited ---
  watch(() => state.displayName, (now, before) => {
    if (state.slug === slugFrom(before ?? '')) state.slug = slugFrom(now)
    if (state.name === systemNameFrom(before ?? '')) state.name = systemNameFrom(now)
  })

  // --- The root organisation's naming rules (checked on the fields) and guidance ---
  const namingRules = computed(() => {
    const root = isRoot.value ? null : rootOrganisation.value
    return {
      name: root?.child_name_pattern ?? null,
      displayName: root?.child_display_name_pattern ?? null,
      slug: root?.child_slug_pattern ?? null
    }
  })
  const schema = computed(() => createEntitySchema(namingRules.value, { requireParent: !isRoot.value }))
  const namingGuidance = computed(() => {
    const root = isRoot.value ? null : rootOrganisation.value
    if (!root) return null
    const rules = [
      root.child_display_name_pattern ? `display name ${root.child_display_name_pattern}` : '',
      root.child_name_pattern ? `system name ${root.child_name_pattern}` : '',
      root.child_slug_pattern ? `slug ${root.child_slug_pattern}` : ''
    ].filter(Boolean)
    if (!root.child_naming_guidance && !rules.length) return null
    const serverChecked = [root.child_display_name_pattern, root.child_name_pattern, root.child_slug_pattern]
      .some(pattern => pattern && !isPortablePattern(pattern))
    return {
      title: `${root.display_name} naming rules`,
      description: [
        root.child_naming_guidance,
        rules.length ? `Patterns: ${rules.join('; ')}.` : '',
        serverChecked ? 'The server checks names against these patterns when you create.' : ''
      ].filter(Boolean).join(' ')
    }
  })
  // A new root's own patterns: Python-only syntax is accepted here and checked by the server.
  const patternHelp = computed(() => ({
    childNamePattern: patternFieldHelp(state.childNamePattern),
    childDisplayNamePattern: patternFieldHelp(state.childDisplayNamePattern),
    childSlugPattern: patternFieldHelp(state.childSlugPattern)
  }))

  // Scoped admins pick the parent inside their own organisation; others search every one.
  const pickerRootId = computed(() => anchoredRootId.value)
  // A structural entity cannot go under an access group.
  const pickerClass = computed<EntityClassValue | null>(() => (state.entityClass === 'structural' ? 'structural' : null))

  const create = useCreateEntity()
  async function onSubmit(event: FormSubmitEvent<CreateEntitySchema>) {
    const d = event.data
    const input: CreateEntityInput = {
      name: d.name,
      display_name: d.displayName,
      slug: d.slug,
      entity_class: d.entityClass,
      entity_type: d.entityType
    }
    if (!isRoot.value && d.parentId) input.parent_entity_id = d.parentId
    if (d.description) input.description = d.description
    if (d.status !== 'active') input.status = d.status
    if (d.validFrom) input.valid_from = startOfDayIso(d.validFrom)
    if (d.validUntil) input.valid_until = endOfDayIso(d.validUntil)
    if (d.allowedChildClasses.length) input.allowed_child_classes = [...d.allowedChildClasses]
    if (d.allowedChildTypes.length) input.allowed_child_types = [...d.allowedChildTypes]
    if (d.maxMembers != null) input.max_members = d.maxMembers
    if (isRoot.value) {
      if (d.childNamePattern) input.child_name_pattern = d.childNamePattern
      if (d.childDisplayNamePattern) input.child_display_name_pattern = d.childDisplayNamePattern
      if (d.childSlugPattern) input.child_slug_pattern = d.childSlugPattern
      if (d.childNamingGuidance) input.child_naming_guidance = d.childNamingGuidance
    }
    const res = await run(() => create.mutateAsync(input), {
      success: `${d.displayName} created`,
      error: 'Could not create entity',
      form,
      fieldMap: FIELD_MAP,
      inline: error,
      notFoundCodes: []
    })
    if (res.ok) {
      open.value = false
      onCreated(res.data)
    } else if (Object.keys(res.apiError.fieldErrors).some(path => ADVANCED_FIELDS.has(FIELD_MAP[path.split('.')[0] as keyof typeof FIELD_MAP] ?? ''))) {
      advancedOpen.value = true
    }
  }
  // An invalid field inside the collapsed section: open it and move focus there.
  async function onInvalid(event: FormErrorEvent) {
    if (advancedOpen.value || !event.errors.some(e => e.name && ADVANCED_FIELDS.has(e.name))) return
    advancedOpen.value = true
    await nextTick()
    focusFirstFormError(event)
  }

  // A child needs a parent before it can be validated against its rules.
  const submitDisabled = computed(() => !isRoot.value && Boolean(parentId.value) && parentPathStatus.value === 'pending')

  return {
    state,
    schema,
    error,
    placement,
    placementItems,
    canChoosePlacement: canBrowseAllRoots,
    isRoot,
    advancedOpen,
    parent,
    classItems,
    typeItems,
    typeHelp,
    childTypesHelp,
    enforcedTypes,
    onCreateType,
    namingGuidance,
    patternHelp,
    pickerRootId,
    pickerClass,
    submitDisabled,
    onSubmit,
    onInvalid
  }
}
