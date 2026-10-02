<script setup lang="ts">
import { groupFormSchema } from '~/schemas/abac'
import type { AbacScope } from '~/queries/abac'
import type { AbacConditionGroup } from '~/types/abac'

// Add / edit one ABAC condition group. `group` null = add.
const props = defineProps<{
  scope: AbacScope
  group: AbacConditionGroup | null
}>()
const open = defineModel<boolean>('open', { required: true })

const { state, isEdit, dirty, saving, serverError, operatorItems, onSubmit } = useAbacGroupForm(props, open)
</script>

<template>
  <AppFormDialog
    ref="groupDialog"
    v-model:open="open"
    :title="isEdit ? 'Edit condition group' : 'Add condition group'"
    description="A group combines its conditions with AND or OR. Every group must pass."
    :schema="groupFormSchema"
    :state="state"
    :error="serverError"
    :pending="saving"
    :dirty="dirty"
    :require-changes="isEdit"
    :submit-label="isEdit ? 'Save changes' : 'Add group'"
    @submit="onSubmit"
  >
    <UFormField name="operator" label="The group passes when" required>
      <URadioGroup
        v-model="state.operator"
        :items="operatorItems"
        variant="card"
      />
    </UFormField>

    <UFormField
      name="description"
      label="Description"
      hint="Optional"
      help="What the group is for, for other admins."
    >
      <UTextarea
        id="abac-group-description"
        v-model="state.description"
        :rows="2"
        autoresize
        class="w-full"
      />
    </UFormField>
  </AppFormDialog>
</template>
