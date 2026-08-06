<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import {
  conditionGroupsQuery,
  conditionsQuery,
  useCreateCondition,
  useCreateConditionGroup,
  useDeleteCondition,
  useDeleteConditionGroup
} from '~/queries/abac'
import { getApiErrorMessage } from '~/utils/api'
import type { AbacCondition, AbacConditionGroup, AbacConditionValueType, AbacScopeKind, CreateConditionInput } from '~/types/abac'

// ABAC editor — condition groups (AND/OR) + conditions (attribute/operator/value), for a role
// or a permission. Read-only unless `canManage` (capability on, actor may update, non-system).
const props = defineProps<{ kind: AbacScopeKind, id: string, canManage: boolean }>()
const toast = useToast()

const scope = computed(() => ({ kind: props.kind, id: props.id }))
const { data: groupsData, status: groupsStatus } = useQuery(() => conditionGroupsQuery(scope.value))
const { data: conditionsData, status: conditionsStatus } = useQuery(() => conditionsQuery(scope.value))

const groups = computed<AbacConditionGroup[]>(() => groupsData.value ?? [])
const conditions = computed<AbacCondition[]>(() => conditionsData.value ?? [])
const groupById = computed(() => new Map(groups.value.map(g => [g.id, g])))

function groupLabel(group: AbacConditionGroup) {
  return group.description ? `${group.operator} · ${group.description}` : group.operator
}
function conditionGroupLabel(condition: AbacCondition) {
  const group = condition.condition_group_id ? groupById.value.get(condition.condition_group_id) : null
  return group ? `${group.operator} group` : 'ungrouped'
}

const valueTypes: AbacConditionValueType[] = ['string', 'integer', 'float', 'boolean', 'list']
const operatorItems: ('AND' | 'OR')[] = ['AND', 'OR']
// Group picker items — "Ungrouped" plus each existing group. "Ungrouped" uses a sentinel
// because Reka's Select rejects an empty-string item value.
const UNGROUPED = '__ungrouped__'
const groupSelectItems = computed(() => [
  { label: 'Ungrouped', value: UNGROUPED },
  ...groups.value.map(g => ({ label: groupLabel(g), value: g.id }))
])

// --- Add group ---
const groupOpen = ref(false)
const groupState = reactive({ operator: 'AND' as 'AND' | 'OR', description: '' })
const createGroup = useCreateConditionGroup()
const creatingGroup = ref(false)

function openAddGroup() {
  Object.assign(groupState, { operator: 'AND', description: '' })
  groupOpen.value = true
}
async function onAddGroup() {
  creatingGroup.value = true
  try {
    await createGroup.mutateAsync({
      kind: props.kind,
      id: props.id,
      input: { operator: groupState.operator, ...(groupState.description.trim() ? { description: groupState.description.trim() } : {}) }
    })
    groupOpen.value = false
    toast.add({ title: 'Condition group added', color: 'success', icon: 'i-lucide-check' })
  } catch (err) {
    toast.add({ title: 'Could not add group', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    creatingGroup.value = false
  }
}

// --- Add condition ---
const conditionOpen = ref(false)
const conditionState = reactive({ attribute: '', operator: '', value: '', valueType: 'string' as AbacConditionValueType, groupId: '' })
const conditionErrors = reactive({ attribute: '', operator: '' })
const createCondition = useCreateCondition()
const creatingCondition = ref(false)

function openAddCondition() {
  Object.assign(conditionState, { attribute: '', operator: '', value: '', valueType: 'string', groupId: groups.value[0]?.id ?? UNGROUPED })
  conditionErrors.attribute = ''
  conditionErrors.operator = ''
  conditionOpen.value = true
}
async function onAddCondition() {
  conditionErrors.attribute = conditionState.attribute.trim().length >= 3 ? '' : 'Attribute path is required.'
  conditionErrors.operator = conditionState.operator.trim().length >= 2 ? '' : 'Operator is required.'
  if (conditionErrors.attribute || conditionErrors.operator) return

  creatingCondition.value = true
  try {
    const input: CreateConditionInput = {
      attribute: conditionState.attribute.trim(),
      operator: conditionState.operator.trim(),
      value_type: conditionState.valueType,
      condition_group_id: conditionState.groupId && conditionState.groupId !== UNGROUPED ? conditionState.groupId : null
    }
    if (conditionState.value.trim()) input.value = conditionState.value.trim()
    await createCondition.mutateAsync({ kind: props.kind, id: props.id, input })
    conditionOpen.value = false
    toast.add({ title: 'Condition added', color: 'success', icon: 'i-lucide-check' })
  } catch (err) {
    toast.add({ title: 'Could not add condition', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    creatingCondition.value = false
  }
}

// --- Delete (group or condition) ---
const deleteOpen = ref(false)
const deleteTarget = ref<{ type: 'group' | 'condition', id: string, label: string } | null>(null)
const deleteGroup = useDeleteConditionGroup()
const deleteCondition = useDeleteCondition()
const deleting = ref(false)

function openDelete(target: { type: 'group' | 'condition', id: string, label: string }) {
  deleteTarget.value = target
  deleteOpen.value = true
}
async function onDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    if (deleteTarget.value.type === 'group') {
      await deleteGroup.mutateAsync({ kind: props.kind, id: props.id, groupId: deleteTarget.value.id })
    } else {
      await deleteCondition.mutateAsync({ kind: props.kind, id: props.id, conditionId: deleteTarget.value.id })
    }
    deleteOpen.value = false
    toast.add({ title: 'Deleted', color: 'success', icon: 'i-lucide-check' })
  } catch (err) {
    toast.add({ title: 'Could not delete', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Groups -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-medium text-default">
          Condition groups
        </h3>
        <UButton
          v-if="canManage"
          icon="i-lucide-plus"
          size="xs"
          color="neutral"
          variant="outline"
          label="Add condition group"
          @click="openAddGroup"
        />
      </div>
      <div v-if="groupsStatus === 'pending'" class="text-sm text-muted">
        Loading...
      </div>
      <p v-else-if="!groups.length" class="text-sm text-muted">
        No condition groups.
      </p>
      <div v-else class="space-y-1.5">
        <div
          v-for="group in groups"
          :key="group.id"
          class="flex items-center justify-between gap-3 rounded-md border border-default px-3 py-2"
        >
          <div class="min-w-0">
            <UBadge color="secondary" variant="subtle">
              {{ group.operator }}
            </UBadge>
            <span v-if="group.description" class="ml-2 text-sm text-muted">{{ group.description }}</span>
          </div>
          <UButton
            v-if="canManage"
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            size="xs"
            :aria-label="`Delete condition group ${group.operator}`"
            @click="openDelete({ type: 'group', id: group.id, label: groupLabel(group) })"
          />
        </div>
      </div>
    </div>

    <!-- Conditions -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-medium text-default">
          Conditions
        </h3>
        <UButton
          v-if="canManage"
          icon="i-lucide-plus"
          size="xs"
          color="neutral"
          variant="outline"
          label="Add condition"
          @click="openAddCondition"
        />
      </div>
      <div v-if="conditionsStatus === 'pending'" class="text-sm text-muted">
        Loading...
      </div>
      <p v-else-if="!conditions.length" class="text-sm text-muted">
        No conditions.
      </p>
      <div v-else class="space-y-1.5">
        <div
          v-for="condition in conditions"
          :key="condition.id"
          class="flex items-center justify-between gap-3 rounded-md border border-default px-3 py-2"
        >
          <div class="min-w-0">
            <span class="font-mono text-sm text-default">
              {{ condition.attribute }} {{ condition.operator }} {{ condition.value ?? '—' }}
            </span>
            <span class="ml-2 text-xs text-muted">{{ condition.value_type }} · {{ conditionGroupLabel(condition) }}</span>
          </div>
          <UButton
            v-if="canManage"
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            size="xs"
            :aria-label="`Delete condition ${condition.attribute}`"
            @click="openDelete({ type: 'condition', id: condition.id, label: condition.attribute })"
          />
        </div>
      </div>
    </div>

    <!-- Add group modal -->
    <UModal v-model:open="groupOpen" title="Add condition group">
      <template #body>
        <div class="space-y-4">
          <div class="space-y-1.5">
            <label for="abac-group-operator" class="block text-sm font-medium text-default">Operator</label>
            <USelect
              id="abac-group-operator"
              v-model="groupState.operator"
              :items="operatorItems"
              class="w-full"
            />
          </div>
          <div class="space-y-1.5">
            <label for="abac-group-description" class="block text-sm font-medium text-default">Description</label>
            <UInput id="abac-group-description" v-model="groupState.description" class="w-full" />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            @click="groupOpen = false"
          />
          <UButton label="Add group" :loading="creatingGroup" @click="onAddGroup" />
        </div>
      </template>
    </UModal>

    <!-- Add condition modal -->
    <UModal v-model:open="conditionOpen" title="Add condition">
      <template #body>
        <div class="space-y-4">
          <div class="space-y-1.5">
            <label for="abac-attribute" class="block text-sm font-medium text-default">Attribute</label>
            <UInput
              id="abac-attribute"
              v-model="conditionState.attribute"
              placeholder="user.department"
              class="w-full"
            />
            <p v-if="conditionErrors.attribute" class="text-xs text-error">
              {{ conditionErrors.attribute }}
            </p>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <label for="abac-operator" class="block text-sm font-medium text-default">Operator</label>
              <UInput
                id="abac-operator"
                v-model="conditionState.operator"
                placeholder="eq"
                class="w-full"
              />
              <p v-if="conditionErrors.operator" class="text-xs text-error">
                {{ conditionErrors.operator }}
              </p>
            </div>
            <div class="space-y-1.5">
              <label for="abac-value-type" class="block text-sm font-medium text-default">Value type</label>
              <USelect
                id="abac-value-type"
                v-model="conditionState.valueType"
                :items="valueTypes"
                class="w-full"
              />
            </div>
          </div>
          <div class="space-y-1.5">
            <label for="abac-value" class="block text-sm font-medium text-default">Value</label>
            <UInput
              id="abac-value"
              v-model="conditionState.value"
              placeholder="sales"
              class="w-full"
            />
          </div>
          <div class="space-y-1.5">
            <label for="abac-group" class="block text-sm font-medium text-default">Group</label>
            <USelect
              id="abac-group"
              v-model="conditionState.groupId"
              :items="groupSelectItems"
              class="w-full"
            />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            @click="conditionOpen = false"
          />
          <UButton label="Save condition" :loading="creatingCondition" @click="onAddCondition" />
        </div>
      </template>
    </UModal>

    <!-- Delete confirm -->
    <UModal v-model:open="deleteOpen" title="Delete">
      <template #body>
        <p class="text-sm text-muted">
          Delete <span class="font-medium text-default">{{ deleteTarget?.label }}</span>? This cannot be undone.
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            @click="deleteOpen = false"
          />
          <UButton
            color="error"
            label="Delete"
            :loading="deleting"
            @click="onDelete"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
