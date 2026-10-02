import { useQuery } from '@pinia/colada'
import type { DropdownMenuItem } from '@nuxt/ui'
import { toValue, type MaybeRefOrGetter } from 'vue'
import {
  conditionGroupsQuery,
  conditionsQuery,
  useDeleteCondition,
  useDeleteConditionGroup,
  useUpdateCondition,
  type AbacScope
} from '~/queries/abac'
import type { AbacCondition, AbacConditionGroup, AbacScopeKind } from '~/types/abac'
import type { AbacConditionIssue, AbacValueDisplay } from '~/utils/abac'

// ABAC editor for one role or permission (AppAbacConditions): loads groups + conditions, arranges
// them the way the engine evaluates them, and drives the add/edit/move/delete flows. The forms
// themselves live in AppAbacConditionForm / AppAbacGroupForm.

export type AbacConditionRow = {
  condition: AbacCondition
  operatorLabel: string
  value: AbacValueDisplay
  issue: AbacConditionIssue | null
}

export type AbacSection = {
  key: string
  title: string
  rule: string
  operator: AbacConditionGroup['operator'] | null
  description: string | null
  group: AbacConditionGroup | null
  index: number
  rows: AbacConditionRow[]
}

function toRow(condition: AbacCondition): AbacConditionRow {
  return {
    condition,
    operatorLabel: abacOperatorLabel(condition.operator),
    value: abacValueDisplay(condition),
    issue: abacConditionIssue(condition)
  }
}

// What the delete confirm is about, with its effects worked out when the dialog opens (so the
// copy stays put while the list refetches behind the closing dialog).
export type AbacDeleteTarget
  = | { type: 'condition', condition: AbacCondition, effects: string[] }
    | { type: 'group', group: AbacConditionGroup, title: string, effects: string[] }

export function useAbacConditions(options: {
  kind: MaybeRefOrGetter<AbacScopeKind>
  id: MaybeRefOrGetter<string>
  canManage: MaybeRefOrGetter<boolean>
}) {
  const scope = computed<AbacScope>(() => ({ kind: toValue(options.kind), id: toValue(options.id) }))
  const canManage = computed(() => toValue(options.canManage))

  const groupsQuery = useQuery(() => conditionGroupsQuery(scope.value))
  const conditionsQueryState = useQuery(() => conditionsQuery(scope.value))

  const loading = computed(() => groupsQuery.status.value === 'pending' || conditionsQueryState.status.value === 'pending')
  const loadError = computed(() => groupsQuery.error.value ?? conditionsQueryState.error.value)
  const failed = computed(() => groupsQuery.status.value === 'error' || conditionsQueryState.status.value === 'error')
  const loadErrorMessage = useApiErrorMessage(loadError)
  function retry() {
    if (groupsQuery.status.value === 'error') groupsQuery.refetch()
    if (conditionsQueryState.status.value === 'error') conditionsQueryState.refetch()
  }

  const groups = computed<AbacConditionGroup[]>(() => groupsQuery.data.value ?? [])
  const conditions = computed<AbacCondition[]>(() => conditionsQueryState.data.value ?? [])
  const grouped = computed(() => groupAbacConditions(groups.value, conditions.value))
  const isEmpty = computed(() => !groups.value.length && !conditions.value.length)
  const groupIndex = computed(() => new Map(groups.value.map((group, index) => [group.id, index])))
  const issueCount = computed(() => conditions.value.filter(c => abacConditionIssue(c)?.severity === 'error').length)

  // Display model: one section per evaluation unit (ungrouped conditions, then each group), each
  // row with its readable operator, typed value and any stored-data problem.
  const sections = computed<AbacSection[]>(() => {
    const out: AbacSection[] = []
    const { ungrouped, groups: groupedSections } = grouped.value
    if (ungrouped.length || !groupedSections.length) {
      out.push({ key: 'ungrouped', title: 'Ungrouped', rule: abacGroupRule('AND'), operator: null, description: null, group: null, index: -1, rows: ungrouped.map(toRow) })
    }
    groupedSections.forEach(({ group, conditions: groupConditions }, index) => {
      out.push({
        key: group.id,
        title: abacGroupTitle(index),
        rule: abacGroupRule(group.operator),
        operator: group.operator,
        description: group.description ?? null,
        group,
        index,
        rows: groupConditions.map(toRow)
      })
    })
    return out
  })

  // How the conditions combine, for the evaluation explainer (policy_engine.evaluate_sql_conditions).
  const explainer = computed(() => [
    scope.value.kind === 'roles'
      ? 'These conditions must pass before this role grants any of its permissions.'
      : 'Holders get this permission only when these conditions pass.',
    'Ungrouped conditions must all pass, and every group must pass: an AND group needs all of its conditions, an OR group needs at least one.',
    'Attributes are read from the context supplied when a permission is checked; a condition on a missing attribute fails, except "is missing" and "is false".'
  ].join(' '))

  // --- Condition form (add / edit) ---
  const conditionFormOpen = ref(false)
  const editingCondition = ref<AbacCondition | null>(null)
  const conditionDefaultGroupId = ref<string | null>(null)
  function openAddCondition(groupId: string | null = null) {
    editingCondition.value = null
    conditionDefaultGroupId.value = groupId
    conditionFormOpen.value = true
  }
  function openEditCondition(condition: AbacCondition) {
    editingCondition.value = condition
    conditionDefaultGroupId.value = condition.condition_group_id ?? null
    conditionFormOpen.value = true
  }

  // --- Group form (add / edit) ---
  const groupFormOpen = ref(false)
  const editingGroup = ref<AbacConditionGroup | null>(null)
  function openAddGroup() {
    editingGroup.value = null
    groupFormOpen.value = true
  }
  function openEditGroup(group: AbacConditionGroup) {
    editingGroup.value = group
    groupFormOpen.value = true
  }

  const { run } = useApiAction()

  // --- Move a condition between groups ---
  const updateCondition = useUpdateCondition()
  async function moveCondition(condition: AbacCondition, groupId: string | null) {
    const { kind, id } = scope.value
    await run(() => updateCondition.mutateAsync({ kind, id, conditionId: condition.id, input: { condition_group_id: groupId } }), {
      success: 'Condition moved',
      error: 'Could not move condition'
    })
  }

  // "Group 2 (any condition can pass)" / "Ungrouped (all must pass)" — a move destination.
  function destinationLabel(groupId: string | null) {
    const index = groupId ? groupIndex.value.get(groupId) : undefined
    const group = index === undefined ? undefined : groups.value[index]
    if (index === undefined || !group) return 'Ungrouped (all must pass)'
    return `${abacGroupTitle(index)} (${abacGroupRule(group.operator).toLowerCase()})`
  }

  function conditionMenu(condition: AbacCondition): DropdownMenuItem[][] {
    const destinations = abacMoveDestinations(condition, groups.value)
    const primary: DropdownMenuItem[] = [
      { label: 'Edit condition', icon: 'i-lucide-pencil', onSelect: () => openEditCondition(condition) }
    ]
    if (destinations.length) {
      primary.push({
        label: 'Move to',
        icon: 'i-lucide-folder-input',
        children: destinations.map(target => ({
          label: destinationLabel(target),
          onSelect: () => moveCondition(condition, target)
        }))
      })
    }
    return [
      primary,
      [{ label: 'Delete condition', icon: 'i-lucide-trash', color: 'error', onSelect: () => openDeleteCondition(condition) }]
    ]
  }

  function groupMenu(group: AbacConditionGroup, index: number): DropdownMenuItem[][] {
    return [
      [
        { label: 'Add condition to group', icon: 'i-lucide-plus', onSelect: () => openAddCondition(group.id) },
        { label: 'Edit group', icon: 'i-lucide-pencil', onSelect: () => openEditGroup(group) }
      ],
      [{ label: 'Delete group', icon: 'i-lucide-trash', color: 'error', onSelect: () => openDeleteGroup(group, index) }]
    ]
  }

  // --- Delete (condition or group) ---
  // AppConfirmDialog through useConfirmAction; the effects (abacDeleteEffects) are worked out when
  // the dialog opens, so the copy stays put while the list refetches behind the closing dialog.
  const deleteConditionMutation = useDeleteCondition()
  const deleteGroupMutation = useDeleteConditionGroup()
  const deleteItem = useConfirmAction<AbacDeleteTarget>({
    describe: target => ({
      title: target.type === 'group' ? `Delete ${target.title.toLowerCase()}` : 'Delete condition',
      effects: target.effects,
      confirmLabel: target.type === 'group' ? 'Delete group' : 'Delete condition'
    }),
    action: (target) => {
      const { kind, id } = scope.value
      return target.type === 'group'
        ? deleteGroupMutation.mutateAsync({ kind, id, groupId: target.group.id })
        : deleteConditionMutation.mutateAsync({ kind, id, conditionId: target.condition.id })
    },
    success: target => (target.type === 'group' ? 'Condition group deleted' : 'Condition deleted'),
    error: target => (target.type === 'group' ? 'Could not delete condition group' : 'Could not delete condition')
  })

  function openDeleteCondition(condition: AbacCondition) {
    const effects = abacDeleteEffects(scope.value.kind, { type: 'condition', condition }, groups.value, conditions.value)
    deleteItem.ask({ type: 'condition', condition, effects })
  }
  function openDeleteGroup(group: AbacConditionGroup, index: number) {
    const effects = abacDeleteEffects(scope.value.kind, { type: 'group', group }, groups.value, conditions.value)
    deleteItem.ask({ type: 'group', group, title: abacGroupTitle(index), effects })
  }

  // One-line summary of what is being deleted, shown above the effects.
  const deleteSummary = computed(() => {
    const target = deleteItem.target
    if (!target) return ''
    if (target.type === 'group') {
      const rule = abacGroupRule(target.group.operator).toLowerCase()
      return target.group.description ? `${target.title} (${rule}): ${target.group.description}` : `${target.title} (${rule})`
    }
    const row = toRow(target.condition)
    const value = row.value.kind === 'list'
      ? `[${row.value.items.join(', ')}]`
      : row.value.kind === 'text' ? (row.value.quoted ? `"${row.value.text}"` : row.value.text) : ''
    return [target.condition.attribute, row.operatorLabel, value].filter(Boolean).join(' ')
  })

  return {
    scope,
    canManage,
    explainer,
    loading,
    failed,
    loadErrorMessage,
    retry,
    groups,
    sections,
    isEmpty,
    issueCount,
    conditionFormOpen,
    editingCondition,
    conditionDefaultGroupId,
    openAddCondition,
    groupFormOpen,
    editingGroup,
    openAddGroup,
    openEditGroup,
    conditionMenu,
    groupMenu,
    deleteItem,
    deleteSummary
  }
}
