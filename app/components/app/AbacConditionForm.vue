<script setup lang="ts">
import { conditionFormSchema } from '~/schemas/abac'
import type { AbacScope } from '~/queries/abac'
import type { AbacCondition, AbacConditionGroup } from '~/types/abac'

// Add / edit one ABAC condition. `condition` null = add (optionally into `defaultGroupId`).
const props = defineProps<{
  scope: AbacScope
  condition: AbacCondition | null
  defaultGroupId: string | null
  groups: AbacConditionGroup[]
}>()
const open = defineModel<boolean>('open', { required: true })

const {
  state,
  isEdit,
  storedIssue,
  dirty,
  canSave,
  saving,
  serverError,
  meta,
  valueKind,
  showValueType,
  valueTypeItems,
  contextItems,
  pathHelp,
  pathPlaceholder,
  operatorItems,
  listItemTypeItems,
  groupItems,
  onSubmit
} = useAbacConditionForm(props, open)

// Plain number formatting (no grouping, no rounding) so the typed value is what gets stored.
const numberFormat = { useGrouping: false, maximumFractionDigits: 10 }
</script>

<template>
  <AppFormDialog
    ref="conditionDialog"
    v-model:open="open"
    :title="isEdit ? 'Edit condition' : 'Add condition'"
    description="Conditions compare an attribute from the check context with a value."
    :schema="conditionFormSchema"
    :state="state"
    :error="serverError"
    :pending="saving"
    :dirty="dirty"
    :submit-disabled="!canSave"
    :submit-label="isEdit ? 'Save changes' : 'Add condition'"
    size="lg"
    @submit="onSubmit"
  >
    <UAlert
      v-if="storedIssue"
      :color="storedIssue.severity === 'error' ? 'error' : 'warning'"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="This condition needs fixing"
      :description="storedIssue.message"
    />

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <UFormField name="context" label="Context" required>
        <USelect
          id="abac-condition-context"
          v-model="state.context"
          :items="contextItems"
          placeholder="Choose"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="path"
        label="Attribute"
        required
        :help="pathHelp"
        class="sm:col-span-2"
      >
        <UInput
          id="abac-condition-path"
          v-model="state.path"
          :placeholder="pathPlaceholder"
          autocomplete="off"
          class="w-full font-mono"
        />
      </UFormField>
    </div>

    <UFormField
      name="operator"
      label="Operator"
      required
      :help="meta?.help"
    >
      <USelect
        id="abac-condition-operator"
        v-model="state.operator"
        :items="operatorItems"
        placeholder="Choose an operator"
        class="w-full"
      />
    </UFormField>

    <div v-if="valueKind !== 'none'" class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <UFormField
        v-if="showValueType"
        name="value_type"
        label="Value type"
        required
      >
        <USelect
          id="abac-condition-value-type"
          v-model="state.value_type"
          :items="valueTypeItems"
          class="w-full"
        />
      </UFormField>
      <UFormField
        v-else-if="valueKind === 'list'"
        name="list_item_type"
        label="Item type"
        required
      >
        <USelect
          id="abac-condition-list-item-type"
          v-model="state.list_item_type"
          :items="listItemTypeItems"
          class="w-full"
        />
      </UFormField>

      <UFormField
        name="value"
        label="Value"
        required
        :class="showValueType || valueKind === 'list' ? 'sm:col-span-2' : 'sm:col-span-3'"
        :help="valueKind === 'list'
          ? 'Press Enter after each value.'
          : valueKind === 'datetime' ? 'ISO 8601 with a timezone, e.g. 2026-12-31T17:00:00Z.' : undefined"
      >
        <UInputTags
          v-if="valueKind === 'list'"
          id="abac-condition-value"
          v-model="state.list_value"
          placeholder="Add a value"
          add-on-blur
          add-on-paste
          class="w-full"
        />
        <USwitch
          v-else-if="(valueKind === 'scalar') && state.value_type === 'boolean'"
          id="abac-condition-value"
          v-model="state.boolean_value"
          :label="state.boolean_value ? 'true' : 'false'"
        />
        <UInputNumber
          v-else-if="state.value_type === 'integer' && (valueKind === 'scalar' || valueKind === 'number')"
          id="abac-condition-value"
          v-model="state.number_value"
          :step="1"
          :format-options="numberFormat"
          class="w-full"
        />
        <UInputNumber
          v-else-if="state.value_type === 'float' && (valueKind === 'scalar' || valueKind === 'number')"
          id="abac-condition-value"
          v-model="state.number_value"
          :step="0.1"
          :step-snapping="false"
          :format-options="numberFormat"
          class="w-full"
        />
        <UInput
          v-else
          id="abac-condition-value"
          v-model="state.text_value"
          :placeholder="valueKind === 'datetime' ? '2026-12-31T17:00:00Z' : valueKind === 'text' && state.operator === 'matches' ? '^prefix-' : 'Value'"
          autocomplete="off"
          class="w-full"
          :class="{ 'font-mono': valueKind === 'datetime' || state.operator === 'matches' }"
        />
      </UFormField>
    </div>

    <UFormField
      v-if="groups.length"
      name="group_id"
      label="Group"
      help="Ungrouped conditions must all pass. In a group, the group's AND/OR decides."
    >
      <USelect
        id="abac-condition-group"
        v-model="state.group_id"
        :items="groupItems"
        class="w-full"
      />
    </UFormField>

    <UFormField
      name="description"
      label="Description"
      hint="Optional"
      help="Why this condition exists, for other admins."
    >
      <UTextarea
        id="abac-condition-description"
        v-model="state.description"
        :rows="2"
        autoresize
        class="w-full"
      />
    </UFormField>
  </AppFormDialog>
</template>
