<script setup lang="ts">
import type { User } from '~/types/user'
import { statusLabel } from '~/utils/status'
import { SUSPENSION_END_NOTE } from '~/utils/users'

// Change status of another account (display only; logic in useUserStatusDialog).
const props = defineProps<{ user: User }>()
const open = defineModel<boolean>('open', { default: false })
const user = computed(() => props.user)

const { schema, state, error, dirty, currentColor, holds, lockout, action, options, suspending, storedEnd, onSubmit } = useUserStatusDialog(user, open)
</script>

<template>
  <AppFormDialog
    ref="statusDialog"
    v-model:open="open"
    :title="`Change status of ${user.email}`"
    :schema="schema"
    :state="state"
    :error="error"
    :dirty="dirty"
    require-changes
    :submit-label="action.label"
    :submit-color="action.color"
    size="lg"
    @submit="onSubmit"
  >
    <div class="flex flex-wrap items-center gap-2 text-sm" data-testid="current-status">
      <span class="text-muted">Current status</span>
      <UBadge :color="currentColor" variant="subtle">
        {{ statusLabel(user.status) }}
      </UBadge>
      <UBadge
        v-for="hold in holds"
        :key="hold.kind"
        color="warning"
        variant="outline"
        icon="i-lucide-clock"
        :label="hold.label"
      />
    </div>
    <UFormField name="status" label="New status" required>
      <URadioGroup
        v-model="state.status"
        :items="options"
        variant="card"
        class="w-full"
      />
    </UFormField>
    <UFormField
      v-if="suspending"
      name="suspendedUntil"
      label="Suspended until"
      hint="Optional"
      :help="`${storedEnd ? `Currently ends ${storedEnd}. ` : ''}Leave empty for no end date. ${endOfDayHelp()} ${SUSPENSION_END_NOTE}`"
    >
      <AppDateField v-model="state.suspendedUntil" label="Suspended until" />
    </UFormField>
    <UFormField
      name="reason"
      label="Reason"
      hint="Optional"
      help="Recorded in the audit log."
    >
      <UTextarea
        v-model="state.reason"
        :rows="2"
        autoresize
        class="w-full"
      />
    </UFormField>
    <UAlert
      v-if="lockout"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      title="A lockout is separate from the status"
      description="The account is locked after failed sign-ins. Changing the status does not clear it; Reset password does."
      data-testid="status-lockout-note"
    />
  </AppFormDialog>
</template>
