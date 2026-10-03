import type { Ref } from 'vue'
import { useResetUserPassword } from '~/queries/users'
import { resetPasswordSchemaFor, type ResetPasswordSchema } from '~/schemas/user'
import { passwordPolicyError } from '~/utils/auth-messages'
import { adminPasswordDialogCopy, userHolds } from '~/utils/users'
import type { ActionError } from '~/composables/useApiAction'
import type { User } from '~/types/user'

// Reset password (AppUserResetPasswordDialog): set a new password for another account without
// its current one (PATCH /users/{id}/password). outlabs-auth then revokes every refresh token of
// the account and refuses access tokens issued before the change, so it is signed out
// everywhere at once, and a lockout after failed sign-ins is cleared (F-014, F-061). An account
// without a password (`has_password` false) gets the same request as "Set password", with what
// it means for that account (adminPasswordDialogCopy). The new password follows the backend's
// published policy, which the field states (usePasswordPolicy).
export function useUserResetPasswordDialog(user: Ref<User>, open: Ref<boolean>) {
  const { run } = useApiAction()
  const form = useDialogForm('resetPasswordDialog')
  const error = ref<ActionError | null>(null)
  const reset = useResetUserPassword()
  const { policy, hint: passwordHelp } = usePasswordPolicy()
  const schema = computed(() => resetPasswordSchemaFor(policy.value))
  const state = reactive<ResetPasswordSchema>({ new_password: '', confirm_password: '' })

  watch(open, (isOpen) => {
    if (!isOpen) return
    Object.assign(state, { new_password: '', confirm_password: '' })
    error.value = null
  }, { immediate: true })

  const copy = computed(() => adminPasswordDialogCopy(user.value, {
    locked: userHolds(user.value).some(hold => hold.kind === 'locked')
  }))

  async function onSubmit() {
    const res = await run(() => reset.mutateAsync({ userId: user.value.id, new_password: state.new_password }), {
      success: copy.value.success,
      error: copy.value.failure,
      form,
      inline: error,
      fieldMap: { new_password: 'new_password' },
      // A policy refusal the console's own rules let through belongs on the field.
      fieldErrors: (failure) => {
        const message = passwordPolicyError(failure)
        return message ? [{ name: 'new_password', message }] : []
      },
      notFoundCodes: ['USER_NOT_FOUND'],
      onNotFound: () => {
        open.value = false
      }
    })
    if (res.ok) open.value = false
  }

  return { schema, passwordHelp, state, error, copy, onSubmit }
}
