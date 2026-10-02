<script setup lang="ts">
import type { ReactivateTarget } from '~/composables/useAccessReactivateDialog'

// Reactivate a suspended or ended membership or direct role assignment (display only; logic in
// useAccessReactivateDialog). Opened from the row menus of the user detail's Direct roles and
// Memberships cards and the entity's Users card.
const props = defineProps<{ target: ReactivateTarget | null }>()
const open = defineModel<boolean>('open', { default: false })
const target = computed(() => props.target)

const { schema, state, error, copy, acceptsReason, onSubmit } = useAccessReactivateDialog(target, open)
</script>

<template>
  <AppFormDialog
    ref="reactivateDialog"
    v-model:open="open"
    :title="copy?.title ?? 'Reactivate'"
    :description="copy?.description"
    :schema="schema"
    :state="state"
    :error="error"
    :submit-label="copy?.submitLabel ?? 'Reactivate'"
    size="lg"
    @submit="onSubmit"
  >
    <UAlert
      v-if="copy"
      color="warning"
      variant="subtle"
      icon="i-lucide-rotate-ccw"
      title="What happens"
      data-testid="reactivate-effects"
    >
      <template #description>
        <ul class="list-disc space-y-1 ps-4">
          <li v-for="effect in copy.effects" :key="effect">
            {{ effect }}
          </li>
        </ul>
      </template>
    </UAlert>
    <UFormField
      name="validUntil"
      label="Valid until"
      hint="Optional"
      :help="endOfDayHelp()"
    >
      <AppDateField v-model="state.validUntil" label="Valid until" />
    </UFormField>
    <UFormField
      v-if="acceptsReason"
      name="reason"
      label="Reason"
      hint="Optional"
    >
      <UTextarea
        v-model="state.reason"
        :rows="2"
        placeholder="A note for the audit trail"
        class="w-full"
      />
    </UFormField>
  </AppFormDialog>
</template>
