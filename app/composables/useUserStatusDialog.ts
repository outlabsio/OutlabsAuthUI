import type { Ref } from 'vue'
import { useUpdateUserStatus } from '~/queries/users'
import { userStatusSchemaFor, type UserStatusSchema } from '~/schemas/user'
import { canChangeStatus, statusChangeAction, suspendedUntilForSave, userHolds, USER_STATUS_OPTIONS } from '~/utils/users'
import { USER_STATUS_COLOR } from '~/utils/status'
import { formatDateTime } from '~/utils/format-date'
import { endOfDayIso, toDateInput } from '~/utils/validity'
import type { ActionError } from '~/composables/useApiAction'
import type { User } from '~/types/user'

// Change status (AppUserStatusDialog, F-062/F-208): activate, suspend or ban another account.
// - It opens on the account's real status, with a timed suspension's end day filled in; the
//   stored end is sent back unchanged unless the admin changes the day, so adding a reason
//   never turns a timed suspension into an indefinite one.
// - Nothing is saved until something changed; the submit names the transition ("Suspend
//   account") in its weight's colour.
// - Offered for active, suspended and banned accounts only (canChangeStatus): an invited
//   account becomes active by accepting its invitation.

const SUCCESS: Record<string, string> = {
  active: 'Account reactivated',
  suspended: 'Account suspended',
  banned: 'Account banned'
}

export function useUserStatusDialog(user: Ref<User>, open: Ref<boolean>) {
  const { run } = useApiAction()
  const form = useDialogForm('statusDialog')
  const error = ref<ActionError | null>(null)
  const update = useUpdateUserStatus()

  const storedDay = computed(() => (user.value.status === 'suspended' ? toDateInput(user.value.suspended_until) : ''))
  const state = reactive<UserStatusSchema>({ status: 'active', suspendedUntil: '', reason: '' })
  const changes = useDirtyPatch(state, s => ({
    status: s.status,
    suspendedUntil: s.status === 'suspended' ? s.suspendedUntil : '',
    reason: s.reason.trim()
  }))
  // "today" is read when the dialog opens: a new end day may not be in the past.
  const today = ref(toDateInput(new Date().toISOString()))
  const schema = computed(() => userStatusSchemaFor({ storedDay: storedDay.value, today: today.value }))

  watch(open, (isOpen) => {
    if (!isOpen) return
    const current = user.value.status
    Object.assign(state, {
      status: canChangeStatus(current) ? current : 'active',
      suspendedUntil: storedDay.value,
      reason: ''
    })
    today.value = toDateInput(new Date().toISOString())
    changes.snapshot()
    error.value = null
  }, { immediate: true })

  const now = useRelativeNow()
  const currentColor = computed(() => USER_STATUS_COLOR[user.value.status])
  const holds = computed(() => userHolds(user.value, now.value.getTime()))
  const lockout = computed(() => holds.value.find(hold => hold.kind === 'locked') ?? null)
  const action = computed(() => statusChangeAction(user.value.status, state.status))
  const options = USER_STATUS_OPTIONS.map(option => ({ label: option.label, description: option.description, value: option.value }))
  const suspending = computed(() => state.status === 'suspended')
  // The exact stored end, when the day field alone would hide its time.
  const storedEnd = computed(() => (user.value.status === 'suspended' && user.value.suspended_until
    ? formatDateTime(user.value.suspended_until)
    : null))

  async function onSubmit() {
    if (!changes.dirty.value) {
      open.value = false
      return
    }
    const target = state.status
    const res = await run(() => update.mutateAsync({
      userId: user.value.id,
      status: target,
      suspended_until: suspendedUntilForSave({
        target,
        day: state.suspendedUntil,
        storedDay: storedDay.value,
        storedIso: user.value.suspended_until,
        toIso: endOfDayIso
      }),
      reason: state.reason.trim() || undefined
    }), {
      success: target === user.value.status ? 'Status updated' : SUCCESS[target],
      error: 'Could not change status',
      form,
      inline: error,
      fieldMap: { status: 'status', suspended_until: 'suspendedUntil', reason: 'reason' },
      notFoundCodes: ['USER_NOT_FOUND'],
      onNotFound: () => {
        open.value = false
      }
    })
    if (res.ok) open.value = false
  }

  return { schema, state, error, dirty: changes.dirty, currentColor, holds, lockout, action, options, suspending, storedEnd, onSubmit }
}
