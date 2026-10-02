import type { Ref } from 'vue'
import { useResetUserPassword } from '~/queries/users'
import type { ResetPasswordSchema } from '~/schemas/user'
import { passwordPolicyError } from '~/utils/auth-messages'
import { userHolds } from '~/utils/users'
import type { ActionError } from '~/composables/useApiAction'
import type { User } from '~/types/user'

// Reset password (AppUserResetPasswordDialog): set a new password for another account without
// its current one (PATCH /users/{id}/password). outlabs-auth then revokes every refresh token of
// the account and refuses access tokens issued before the change, so it is signed out
// everywhere at once, and a lockout after failed sign-ins is cleared (F-014, F-061).
export function useUserResetPasswordDialog(user: Ref<User>, open: Ref<boolean>) {
  const { run } = useApiAction()
  const form = useDialogForm('resetPasswordDialog')
  const error = ref<ActionError | null>(null)
  const reset = useResetUserPassword()
  const state = reactive<ResetPasswordSchema>({ new_password: '', confirm_password: '' })

  watch(open, (isOpen) => {
    if (!isOpen) return
    Object.assign(state, { new_password: '', confirm_password: '' })
    error.value = null
  }, { immediate: true })

  const effects = computed(() => [
    `${user.value.email} is signed out everywhere: every session ends at once.`,
    ...(userHolds(user.value).some(hold => hold.kind === 'locked') ? ['The lockout after failed sign-ins is cleared.'] : []),
    'They sign in with the new password from now on. Their API keys keep working.'
  ])

  async function onSubmit() {
    const res = await run(() => reset.mutateAsync({ userId: user.value.id, new_password: state.new_password }), {
      success: 'Password reset',
      error: 'Could not reset password',
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

  return { state, error, effects, onSubmit }
}
