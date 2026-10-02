import type { Ref } from 'vue'
import { useUpdateUserSuperuser } from '~/queries/users'
import { superuserChangeSchemaFor, type SuperuserChangeSchema } from '~/schemas/user'
import { superuserChangeEffects } from '~/utils/users'
import type { ActionError } from '~/composables/useApiAction'
import type { User } from '~/types/user'

// Grant or revoke superuser (AppUserSuperuserDialog, F-175): the most powerful flag in the
// system. Granting takes a reason for the audit log and the account's email typed back;
// revoking takes an optional reason. outlabs-auth refuses to revoke the last active superuser,
// and the refusal shows in the dialog.
export function useUserSuperuserDialog(user: Ref<User>, open: Ref<boolean>) {
  const { run } = useApiAction()
  const { hasMemberships } = useAuth()
  const form = useDialogForm('superuserDialog')
  const error = ref<ActionError | null>(null)
  const update = useUpdateUserSuperuser()

  // Fixed when the dialog opens, so a refetch underneath cannot flip the action mid-dialog.
  const granting = ref(!user.value.is_superuser)
  const state = reactive<SuperuserChangeSchema>({ reason: '', confirmation: '' })
  watch(open, (isOpen) => {
    if (!isOpen) return
    granting.value = !user.value.is_superuser
    Object.assign(state, { reason: '', confirmation: '' })
    error.value = null
  }, { immediate: true })

  const schema = computed(() => superuserChangeSchemaFor({ granting: granting.value, email: user.value.email }))
  const title = computed(() => (granting.value ? `Grant superuser to ${user.value.email}` : `Revoke superuser from ${user.value.email}`))
  const submitLabel = computed(() => (granting.value ? 'Grant superuser' : 'Revoke superuser'))
  const effects = computed(() => superuserChangeEffects(granting.value, { hasMemberships: hasMemberships.value }))
  // The typed email is the live feedback for a grant: Confirm stays disabled until it matches.
  const confirmed = computed(() => !granting.value || state.confirmation.trim() === user.value.email)

  async function onSubmit() {
    const grant = granting.value
    const res = await run(() => update.mutateAsync({ userId: user.value.id, is_superuser: grant, reason: state.reason.trim() || undefined }), {
      success: grant ? 'Superuser granted' : 'Superuser revoked',
      error: 'Could not update superuser',
      form,
      inline: error,
      fieldMap: { reason: 'reason' },
      notFoundCodes: ['USER_NOT_FOUND'],
      onNotFound: () => {
        open.value = false
      }
    })
    if (res.ok) open.value = false
  }

  return { granting, state, error, schema, title, submitLabel, effects, confirmed, onSubmit }
}
