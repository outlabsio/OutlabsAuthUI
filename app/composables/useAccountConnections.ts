import type { AvatarProps, ButtonProps } from '@nuxt/ui'
import { useStartSocialLink, useUnlinkSocialAccount } from '~/queries/account'
import type { SocialAccount } from '~/types/account'
import { localImageSrc } from '~/utils/avatar'

// The Connected accounts tab: OAuth accounts linked to this account, unlinking one (after a
// confirmation naming it, F-094) and linking another provider (needs the backend's
// oauth_associate router, F-007). Each row shows the provider's icon: the provider's own picture
// (avatar_url) is on a third-party host the CSP does not allow (utils/avatar.ts). A failed link
// the associate callback redirected back with (F-104) is said here until dismissed, with the next
// step (useAccountLinkNotice).

export function useAccountConnections() {
  const { run } = useApiAction()
  const { linkableOauthProviders, providerLabel } = useAuthUiConfig()
  const { available, accounts } = useConnectedAccountsAvailable()
  const rows = computed<SocialAccount[]>(() => accounts.data.value ?? [])

  // Providers the deployment offers that aren't linked yet — each gets a Link button.
  const linkableProviders = computed(() =>
    linkableOauthProviders.value.filter(provider => !rows.value.some(account => account.provider === provider))
  )

  // The provider is the useful cue; a same-origin or data: picture is shown when there is one.
  function accountAvatar(account: SocialAccount): AvatarProps {
    const src = localImageSrc(account.avatar_url, window.location.origin)
    return src
      ? { src, alt: account.display_name || account.email || providerLabel(account.provider) }
      : { icon: `i-simple-icons-${account.provider}`, alt: providerLabel(account.provider) }
  }

  const unlinkSocial = useUnlinkSocialAccount()
  const accountLabel = (account: SocialAccount) => `${providerLabel(account.provider)} account ${account.email || account.display_name || account.provider_user_id}`
  const unlink = useConfirmAction<SocialAccount>({
    describe: account => ({
      title: `Unlink ${accountLabel(account)}`,
      effects: [
        `You can no longer sign in with this ${providerLabel(account.provider)} account.`,
        ...(rows.value.length <= 1
          ? ['It is your only linked account: the server refuses to unlink it unless you can also sign in with a password.']
          : []),
        'You can link it again later.'
      ],
      confirmLabel: 'Unlink account'
    }),
    action: account => unlinkSocial.mutateAsync(account.id),
    success: account => `${providerLabel(account.provider)} account unlinked`,
    error: 'Could not unlink the account'
  })

  const startSocialLink = useStartSocialLink()
  const linkingProvider = ref('')
  async function onLink(provider: string) {
    linkingProvider.value = provider
    const res = await run(() => startSocialLink.mutateAsync(provider), { error: `Could not start linking ${providerLabel(provider)}` })
    if (res.ok) window.location.href = res.data.authorization_url
    else linkingProvider.value = ''
  }
  // Back from the provider can restore this page from the back/forward cache mid-loading (F-199).
  onPageRestore(() => {
    linkingProvider.value = ''
  })

  // --- A failed link (?link_error=, read by useAccount) ---
  // The specific message, and the next step: Try again where the provider can be linked (not
  // while another account of it is linked: provider_conflict), else unlinking that account.
  const linkFailure = useAccountLinkNotice()
  const linkNotice = computed(() => {
    const failure = linkFailure.failure.value
    const message = linkFailure.message.value
    if (!failure || !message) return null
    const provider = failure.provider
    const linkedAccount = provider ? rows.value.find(account => account.provider === provider) : undefined
    const actions: ButtonProps[] = []
    if (provider && linkableProviders.value.includes(provider)) {
      actions.push({ label: 'Try again', color: 'error', variant: 'outline', loading: linkingProvider.value === provider, onClick: () => onLink(provider) })
    } else if (failure.code === 'provider_conflict' && linkedAccount) {
      actions.push({ label: `Unlink ${providerLabel(linkedAccount.provider)} account`, color: 'error', variant: 'outline', onClick: () => unlink.ask(linkedAccount) })
    }
    return { ...message, actions: actions.length ? actions : undefined }
  })

  return {
    available,
    rows,
    status: accounts.status,
    error: accounts.error,
    fetching: accounts.isLoading,
    refetch: accounts.refetch,
    linkableProviders,
    providerLabel,
    accountLabel,
    accountAvatar,
    unlink,
    linkingProvider,
    onLink,
    linkNotice,
    dismissLinkNotice: linkFailure.dismiss
  }
}
