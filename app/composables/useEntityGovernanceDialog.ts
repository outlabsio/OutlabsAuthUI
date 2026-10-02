import type { Ref } from 'vue'
import { useQuery } from '@pinia/colada'
import { entityDetailQuery, useUpdateEntity } from '~/queries/entities'
import { governanceSchemaFor, patternFieldHelp, type GovernanceSchema, type PatternField } from '~/schemas/entity'
import type { Entity, UpdateEntityInput } from '~/types/entity'
import type { ActionError } from '~/composables/useApiAction'
import { allowedChildTypesHelp } from '~/utils/entity-tree'
import type { FormConflict } from '~/composables/useDialogForm'

// Governance (F-075): what may be created directly beneath this entity, its member cap, and, on a
// root organisation only, the naming rules for everything beneath it. The server rejects naming
// rules on a non-root entity, so a descendant shows its root's rules read-only instead. Allowed
// child classes are advisory: the server does not enforce them (only "access groups cannot hold
// structural entities" is a rule). Only changed fields are sent, after a conflict re-check.
const FIELD_LABELS: Record<string, string> = {
  allowed_child_classes: 'Allowed child classes',
  allowed_child_types: 'Allowed child types',
  max_members: 'Max members',
  child_name_pattern: 'System-name pattern',
  child_display_name_pattern: 'Display-name pattern',
  child_slug_pattern: 'Slug pattern',
  child_naming_guidance: 'Naming guidance'
}
const FIELD_MAP = {
  allowed_child_classes: 'allowedChildClasses',
  allowed_child_types: 'allowedChildTypes',
  max_members: 'maxMembers',
  child_name_pattern: 'childNamePattern',
  child_display_name_pattern: 'childDisplayNamePattern',
  child_slug_pattern: 'childSlugPattern',
  child_naming_guidance: 'childNamingGuidance'
}

export const ENTITY_CLASS_ITEMS = [
  { label: 'Structural', value: 'structural' as const, description: 'Organization chart units: regions, offices, departments.' },
  { label: 'Access group', value: 'access_group' as const, description: 'Groups that grant access across the structure: teams, projects.' }
]

function formFrom(entity: Entity): GovernanceSchema {
  return {
    allowedChildClasses: [...(entity.allowed_child_classes ?? [])],
    allowedChildTypes: [...(entity.allowed_child_types ?? [])],
    maxMembers: entity.max_members ?? null,
    childNamePattern: entity.child_name_pattern ?? '',
    childDisplayNamePattern: entity.child_display_name_pattern ?? '',
    childSlugPattern: entity.child_slug_pattern ?? '',
    childNamingGuidance: entity.child_naming_guidance ?? ''
  }
}

export function useEntityGovernanceDialog(entity: Ref<Entity>, root: Ref<Entity | null>, isRoot: Ref<boolean>, open: Ref<boolean>) {
  const { run } = useApiAction()
  const form = useDialogForm('governanceDialog')
  const error = ref<ActionError | null>(null)
  const conflict = ref<FormConflict | null>(null)
  const state = reactive<GovernanceSchema>(formFrom(entity.value))
  const orNull = (value: string) => value.trim() || null
  const changes = useDirtyPatch(state, (s): UpdateEntityInput => ({
    allowed_child_classes: [...s.allowedChildClasses].sort(),
    allowed_child_types: s.allowedChildTypes.map(t => t.trim()).filter(Boolean),
    max_members: s.maxMembers ?? null,
    // Naming rules exist on roots only; a descendant never sends them.
    ...(isRoot.value
      ? {
          child_name_pattern: orNull(s.childNamePattern),
          child_display_name_pattern: orNull(s.childDisplayNamePattern),
          child_slug_pattern: orNull(s.childSlugPattern),
          child_naming_guidance: orNull(s.childNamingGuidance)
        }
      : {})
  }))
  // Only the patterns the admin changed are checked (a stored one passed the server's compile).
  const changedPatterns = computed(() => changes.changed.value
    .map(key => FIELD_MAP[key as keyof typeof FIELD_MAP])
    .filter((field): field is PatternField => field === 'childNamePattern' || field === 'childDisplayNamePattern' || field === 'childSlugPattern'))
  const schema = computed(() => governanceSchemaFor(changedPatterns.value))
  const patternHelp = computed(() => ({
    childNamePattern: patternFieldHelp(state.childNamePattern),
    childDisplayNamePattern: patternFieldHelp(state.childDisplayNamePattern),
    childSlugPattern: patternFieldHelp(state.childSlugPattern)
  }))
  // The detail panel's own query (same key and options): Pinia Colada keeps one options object
  // per entry, so a second observer with a different `enabled` would stop the panel refetching.
  const { refetch } = useQuery(() => entityDetailQuery(entity.value.id))
  const update = useUpdateEntity()

  function reset(from: Entity) {
    Object.assign(state, formFrom(from))
    changes.snapshot()
    error.value = null
    conflict.value = null
  }
  watch(open, (isOpen) => {
    if (isOpen) reset(entity.value)
  }, { immediate: true })

  // What an empty type list means here (the root's list, or any type), and that a root's list
  // also governs every descendant without its own (the same help as Create).
  const childTypesHelp = computed(() => allowedChildTypesHelp({ isRoot: isRoot.value, root: root.value }))
  const inheritedRules = computed(() => {
    const source = root.value
    if (isRoot.value || !source) return []
    return [
      { label: 'System-name pattern', value: source.child_name_pattern },
      { label: 'Display-name pattern', value: source.child_display_name_pattern },
      { label: 'Slug pattern', value: source.child_slug_pattern },
      { label: 'Naming guidance', value: source.child_naming_guidance }
    ].filter(rule => rule.value)
  })

  async function save(force: boolean) {
    const input = changes.patch.value
    if (!Object.keys(input).length) {
      open.value = false
      return
    }
    if (!force) {
      const { data: latest } = await refetch()
      const clashes = latest ? changes.conflicts(formFrom(latest)) : []
      if (clashes.length) {
        conflict.value = { fields: clashes.map(key => FIELD_LABELS[key] ?? key) }
        return
      }
    }
    conflict.value = null
    const res = await run(() => update.mutateAsync({ entityId: entity.value.id, input }), {
      success: 'Governance updated',
      error: 'Could not update governance',
      form,
      fieldMap: FIELD_MAP,
      inline: error,
      notFoundCodes: ['ENTITY_NOT_FOUND'],
      onNotFound: () => {
        open.value = false
      }
    })
    if (res.ok) open.value = false
  }
  async function reload() {
    const { data: latest } = await refetch()
    if (latest) reset(latest)
  }

  return {
    state,
    schema,
    patternHelp,
    error,
    conflict,
    dirty: changes.dirty,
    childTypesHelp,
    inheritedRules,
    onSubmit: () => save(false),
    onOverwrite: () => save(true),
    reload
  }
}
