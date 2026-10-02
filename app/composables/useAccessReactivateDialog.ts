import type { Ref } from 'vue'
import { useUpdateMemberAccess } from '~/queries/memberships'
import { useUpdateUserRoleMembership } from '~/queries/users'
import { reactivateGrantSchemaFor, type ReactivateGrantSchema } from '~/schemas/membership'
import { reactivateGrantCopy } from '~/utils/access-grants'
import { endOfDayIso, toDateInput } from '~/utils/validity'
import type { ActionError } from '~/composables/useApiAction'

// Reactivate one grant (AppAccessReactivateDialog, F-015/F-058): a suspended or ended entity
// membership (user detail and entity Users card) or direct role assignment (user detail). The
// explicit replacement for "Edit access" on rows whose status a form cannot represent: it says
// what comes back, and writes status Active plus only what the admin set here.
//   - Valid until starts on the stored end day, or empty when that end has passed (an expired
//     grant would otherwise stay expired); it is sent only when it differs from the stored day.
//   - The note (memberships only: the role-assignment endpoint has no reason) is sent only when
//     written.

export type ReactivateTarget
  = | {
    kind: 'membership'
    entityId: string
    userId: string
    entityName: string
    userEmail: string
    status: string
    validFrom?: string | null
    validUntil?: string | null
    roleNames: string[]
    entityInactive?: boolean
  }
  | {
    kind: 'role'
    userId: string
    membershipId: string
    roleName: string
    userEmail: string
    status: string
    validFrom?: string | null
    validUntil?: string | null
  }

export function useAccessReactivateDialog(target: Ref<ReactivateTarget | null>, open: Ref<boolean>) {
  const { run } = useApiAction()
  const form = useDialogForm('reactivateDialog')
  const error = ref<ActionError | null>(null)
  const updateMember = useUpdateMemberAccess()
  const updateRole = useUpdateUserRoleMembership()

  // "today" is read when the dialog opens: a new end day may not be in the past.
  const today = ref(toDateInput(new Date().toISOString()))
  const schema = computed(() => reactivateGrantSchemaFor({ today: today.value }))
  const state = reactive<ReactivateGrantSchema>({ validUntil: '', reason: '' })

  const storedDay = computed(() => toDateInput(target.value?.validUntil))
  const copy = computed(() => {
    const t = target.value
    if (!t) return null
    return reactivateGrantCopy(t.kind === 'membership'
      ? { kind: 'membership', name: t.entityName, userEmail: t.userEmail, status: t.status, validFrom: t.validFrom, validUntil: t.validUntil, roleNames: t.roleNames, entityInactive: t.entityInactive }
      : { kind: 'role', name: t.roleName, userEmail: t.userEmail, status: t.status, validFrom: t.validFrom, validUntil: t.validUntil })
  })
  const acceptsReason = computed(() => target.value?.kind === 'membership')

  watch(open, (isOpen) => {
    if (!isOpen) return
    today.value = toDateInput(new Date().toISOString())
    Object.assign(state, { validUntil: copy.value?.endPassed ? '' : storedDay.value, reason: '' })
    error.value = null
  }, { immediate: true })

  function body() {
    const input: { status: 'active', valid_until?: string | null, reason?: string } = { status: 'active' }
    if (state.validUntil !== storedDay.value) input.valid_until = endOfDayIso(state.validUntil)
    const reason = state.reason.trim()
    if (reason && acceptsReason.value) input.reason = reason
    return input
  }

  async function onSubmit() {
    const t = target.value
    if (!t) return
    const input = body()
    const res = t.kind === 'membership'
      ? await run(() => updateMember.mutateAsync({ entityId: t.entityId, userId: t.userId, input }), {
          success: 'Membership reactivated',
          error: 'Could not reactivate membership',
          form,
          inline: error,
          fieldMap: { valid_until: 'validUntil', reason: 'reason', status: null },
          notFoundCodes: ['MEMBERSHIP_NOT_FOUND'],
          onNotFound: () => {
            open.value = false
          }
        })
      : await run(() => updateRole.mutateAsync({ userId: t.userId, membershipId: t.membershipId, input: { status: input.status, valid_until: input.valid_until } }), {
          success: 'Role reactivated',
          error: 'Could not reactivate role',
          form,
          inline: error,
          fieldMap: { valid_until: 'validUntil', status: null },
          notFoundCodes: ['MEMBERSHIP_NOT_FOUND'],
          onNotFound: () => {
            open.value = false
          }
        })
    if (res.ok) open.value = false
  }

  return { schema, state, error, copy, acceptsReason, onSubmit }
}
