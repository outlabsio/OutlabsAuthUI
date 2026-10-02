import { useStartSocialLink, useUnlinkSocialAccount } from '~/queries/account'
import type { SocialAccount } from '~/types/account'

// The Connected accounts tab: OAuth accounts linked to this account, unlinking one (after a
// confirmation naming it, F-094) and linking another provider (needs the backend's
// oauth_associate router, F-007).

export function useAccountConnections() {
  const { run } = useApiAction()
  const { linkableOauthProviders, providerLabel } = useAuthUiConfig()
  const { available, accounts } = useConnectedAccountsAvailable()
  const rows = computed<SocialAccount[]>(() => accounts.data.value ?? [])

  // Providers the deployment offers that aren't linked yet — each gets a Link button.
  const linkableProviders = computed(() =>
    linkableOauthProviders.value.filter(provider => !rows.value.some(account => account.provider === provider))
  )

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
    unlink,
    linkingProvider,
    onLink
  }
}
