import type { MaybeRefOrGetter, Ref } from 'vue'
import { useUpdateUser } from '~/queries/users'
import type { UpdateUserSchema } from '~/schemas/user'
import type { ActionError } from '~/composables/useApiAction'
import type { User } from '~/types/user'

// The admin "Edit profile" dialog behind <AppUserProfileDialog> (F-064): email, names and phone
// of another account, opened from the users list and from the user detail's actions. The form
// is filled from the record each time it opens, only changed fields are sent (useDirtyPatch),
// and server problems land on the field (a taken email on Email) or in the dialog's alert.
// Called by the component itself, so `useDialogForm('profileDialog')` resolves its own dialog.
export function useUserProfileForm(target: MaybeRefOrGetter<User | null>, open: Ref<boolean>) {
  const { run } = useApiAction()
  const form = useDialogForm('profileDialog')
  const error = ref<ActionError | null>(null)
  const state = reactive<UpdateUserSchema>({ email: '', first_name: '', last_name: '', phone: '' })
  const changes = useDirtyPatch(state, s => ({
    email: s.email.trim(),
    first_name: (s.first_name ?? '').trim(),
    last_name: (s.last_name ?? '').trim(),
    phone: s.phone.trim() === '' ? null : s.phone.trim()
  }))

  watch(open, (isOpen) => {
    const user = toValue(target)
    if (!isOpen || !user) return
    Object.assign(state, {
      email: user.email,
      first_name: user.first_name ?? '',
      last_name: user.last_name ?? '',
      phone: user.phone ?? ''
    })
    changes.snapshot()
    error.value = null
  }, { immediate: true })

  // The sign-in identifier changes with the email, and outlabs-auth marks the new address
  // unverified: said next to the field once it differs.
  const emailChanged = computed(() => {
    const user = toValue(target)
    return Boolean(user) && state.email.trim().toLowerCase() !== user!.email.toLowerCase()
  })

  const updateUser = useUpdateUser()
  async function onSubmit() {
    const user = toValue(target)
    if (!user) return
    if (!changes.dirty.value) {
      open.value = false
      return
    }
    const res = await run(() => updateUser.mutateAsync({ userId: user.id, input: changes.patch.value }), {
      success: 'User updated',
      error: 'Could not update user',
      form,
      inline: error,
      onNotFound: () => {
        open.value = false
      },
      notFoundCodes: ['USER_NOT_FOUND']
    })
    if (res.ok) open.value = false
  }

  return { state, error, dirty: changes.dirty, emailChanged, onSubmit }
}
