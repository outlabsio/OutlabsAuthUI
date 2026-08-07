import { useQuery, useQueryCache } from '@pinia/colada'
import type { FormSubmitEvent } from '@nuxt/ui'
import { mySessionsQuery, useChangePassword, useRevokeAllSessions, useRevokeSession, useUpdateProfile } from '~/queries/account'
import { SESSION_KEY } from '~/queries/session'
import type { ChangePasswordSchema, UpdateProfileSchema } from '~/schemas/account'
import { getApiErrorMessage } from '~/api/client'
import type { UserSession } from '~/types/account'

// Feature logic for the account view — the actor's own profile, password, and active sessions.
// The SFC binds this and owns display config (the sessions table columns).

export function useAccount() {
  const { user } = useAuth()
  const queryCache = useQueryCache()
  const toast = useToast()

  // --- Profile ---
  const profileState = reactive<UpdateProfileSchema>({ first_name: '', last_name: '', phone: '' })
  watchEffect(() => {
    if (user.value) {
      profileState.first_name = user.value.first_name ?? ''
      profileState.last_name = user.value.last_name ?? ''
      profileState.phone = user.value.phone ?? ''
    }
  })
  const updateProfile = useUpdateProfile()
  const savingProfile = ref(false)
  async function onSaveProfile(event: FormSubmitEvent<UpdateProfileSchema>) {
    savingProfile.value = true
    try {
      const updated = await updateProfile.mutateAsync({
        first_name: event.data.first_name,
        last_name: event.data.last_name,
        phone: event.data.phone === '' ? null : event.data.phone
      })
      queryCache.setQueryData(SESSION_KEY, updated)
      toast.add({ title: 'Profile updated', color: 'success', icon: 'i-lucide-check' })
    } catch (err) {
      toast.add({ title: 'Could not update profile', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
    } finally {
      savingProfile.value = false
    }
  }

  // --- Password ---
  const passwordState = reactive<ChangePasswordSchema>({ current_password: '', new_password: '', confirm_password: '' })
  const changePassword = useChangePassword()
  const changingPassword = ref(false)
  async function onChangePassword(event: FormSubmitEvent<ChangePasswordSchema>) {
    changingPassword.value = true
    try {
      await changePassword.mutateAsync({
        current_password: event.data.current_password,
        new_password: event.data.new_password
      })
      toast.add({ title: 'Password changed', color: 'success', icon: 'i-lucide-check' })
      Object.assign(passwordState, { current_password: '', new_password: '', confirm_password: '' })
    } catch (err) {
      toast.add({ title: 'Could not change password', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
    } finally {
      changingPassword.value = false
    }
  }

  // --- Sessions ---
  const { data: sessions, status: sessionsStatus } = useQuery(mySessionsQuery)
  const sessionRows = computed<UserSession[]>(() => sessions.value ?? [])
  const revokeSession = useRevokeSession()
  const revokeAll = useRevokeAllSessions()
  function onRevokeSession(id: string) {
    revokeSession.mutate(id)
  }
  function onRevokeAll() {
    revokeAll.mutate()
  }

  return {
    user,
    profileState,
    savingProfile,
    onSaveProfile,
    passwordState,
    changingPassword,
    onChangePassword,
    sessionRows,
    sessionsStatus,
    onRevokeSession,
    onRevokeAll
  }
}
