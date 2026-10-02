import type { DropdownMenuItem } from '@nuxt/ui'

type ColorPreference = 'system' | 'light' | 'dark'

const APPEARANCE: { value: ColorPreference, label: string, icon: string }[] = [
  { value: 'system', label: 'System', icon: 'i-lucide-monitor' },
  { value: 'light', label: 'Light', icon: 'i-lucide-sun' },
  { value: 'dark', label: 'Dark', icon: 'i-lucide-moon' }
]

// The signed-in actor's menu in the sidebar footer (dashboard template idiom): who is signed in
// (with their organization and a superuser mark), their own pages (Account, My API keys: the
// 'user' nav group, in its own order, with the same gate as every nav item), Appearance and Sign
// out. It works the same collapsed, expanded and in the mobile drawer.
export function useUserMenu() {
  const { user, displayName, isSuperuser, isEnterprise } = useAuth()
  const { userSections } = useAppNavigation()
  const colorMode = useColorMode()
  const { signOut } = useSignOut()

  const email = computed(() => user.value?.email ?? '')
  const name = computed(() => displayName.value || email.value)
  // Visible name first so the accessible name contains the visible label (WCAG 2.5.3).
  const triggerLabel = computed(() => (name.value ? `${name.value}, user menu` : 'User menu'))

  const items = computed<DropdownMenuItem[][]>(() => [
    [
      {
        type: 'label' as const,
        label: name.value,
        description: displayName.value && displayName.value !== email.value ? email.value : undefined,
        avatar: { alt: name.value || 'User' }
      },
      // Which organization a delegated admin administers, and whether the account is a superuser
      // (F-103): the cue the shell otherwise never gives.
      ...(isEnterprise.value && user.value?.root_entity_name
        ? [{ type: 'label' as const, label: user.value.root_entity_name, icon: 'i-lucide-building-2' }]
        : []),
      ...(isSuperuser.value ? [{ type: 'label' as const, label: 'Superuser', icon: 'i-lucide-shield-check' }] : [])
    ],
    userSections.value.map(section => ({
      label: section.label,
      icon: section.icon,
      to: section.to
    })),
    [{
      label: 'Appearance',
      icon: 'i-lucide-sun-moon',
      children: APPEARANCE.map(option => ({
        label: option.label,
        icon: option.icon,
        type: 'checkbox' as const,
        checked: colorMode.preference === option.value,
        // Keep the menu open so the change is visible in place.
        onSelect(event: Event) {
          event.preventDefault()
          colorMode.preference = option.value
        }
      }))
    }],
    [{ label: 'Sign out', icon: 'i-lucide-log-out', onSelect: () => void signOut() }]
  ].filter(group => group.length > 0))

  return { items, name, triggerLabel }
}
