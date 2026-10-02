import { useQueryCache } from '@pinia/colada'
import type { FormSubmitEvent } from '@nuxt/ui'
import { useUpdateProfile } from '~/queries/account'
import { SESSION_KEY } from '~/queries/session'
import { profileSchemaFor, type ProfileSchema } from '~/schemas/account'
import type { DetailItem } from '~/types/display'
import { activeUntil } from '~/utils/account'
import { USER_STATUS_COLOR, badgeColor } from '~/utils/status'

// The Profile tab: who the account is (overview) and the names it shows. The phone number has
// its own composable (useAccountPhone).

export function useAccountProfile() {
  const { user, displayName, isSuperuser, isEnterprise } = useAuth()
  const queryCache = useQueryCache()
  const { run } = useApiAction()

  // --- Overview (F-102) ---
  const overview = computed(() => {
    const u = user.value
    if (!u) return null
    const items: DetailItem[] = [
      ...(isEnterprise.value ? [{ label: 'Organization', value: u.root_entity_name, fallback: isSuperuser.value ? 'All organizations' : 'None' }] : []),
      { label: 'Last sign-in', value: u.last_login, type: 'datetime' as const, fallback: 'Never' },
      { label: 'Password last changed', value: u.last_password_change, type: 'datetime' as const, fallback: 'Never' },
      { label: 'Member since', value: u.created_at, type: 'date' as const }
    ]
    return {
      name: displayName.value,
      // An account without a name shows its email as the name; it is not repeated under it.
      subtitle: displayName.value === u.email ? undefined : u.email,
      email: u.email,
      emailVerified: u.email_verified,
      status: { label: statusLabel(u.status), color: badgeColor(USER_STATUS_COLOR, u.status) },
      superuser: u.is_superuser,
      lockedUntil: activeUntil(u.locked_until),
      suspendedUntil: activeUntil(u.suspended_until),
      items
    }
  })

  // --- Names (F-095, F-096) ---
  // The form is filled once per account, and again only while it holds no edits of its own: a
  // background refetch of the session (window focus, another tab, a verified phone) never
  // overwrites what the user is typing. Only changed names are sent; an empty name the account
  // never had is not sent at all.
  const form = useTemplateRef<ActionForm>('profileForm')
  const state = reactive<ProfileSchema>({ first_name: '', last_name: '' })
  const changes = useDirtyPatch(state, s => ({ first_name: s.first_name.trim(), last_name: s.last_name.trim() }))
  const schema = computed(() => profileSchemaFor({ first_name: user.value?.first_name, last_name: user.value?.last_name }))
  let filledFor: string | null = null

  function fill() {
    state.first_name = user.value?.first_name ?? ''
    state.last_name = user.value?.last_name ?? ''
    changes.snapshot()
  }

  watch(
    () => [user.value?.id, user.value?.first_name, user.value?.last_name] as const,
    ([id]) => {
      if (!id) return
      if (id !== filledFor || !changes.dirty.value) {
        filledFor = id
        fill()
      }
    },
    { immediate: true }
  )

  const updateProfile = useUpdateProfile()
  const saving = ref(false)
  async function onSave(_event: FormSubmitEvent<ProfileSchema>) {
    if (!changes.dirty.value) return
    saving.value = true
    const res = await run(() => updateProfile.mutateAsync(changes.patch.value), {
      success: 'Profile updated',
      error: 'Could not update profile',
      form
    })
    if (res.ok) {
      queryCache.setQueryData(SESSION_KEY, res.data)
      fill()
    }
    saving.value = false
  }

  return {
    user,
    overview,
    state,
    schema,
    dirty: changes.dirty,
    saving,
    onSave,
    onReset: fill
  }
}
