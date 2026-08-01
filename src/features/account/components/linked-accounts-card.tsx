import { useEffect, useState } from 'react'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { AppEmptyState } from '@/components/app/app-empty-state'
import { AppErrorState } from '@/components/app/app-error-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { accountKeys } from '@/features/account/api/account.keys'
import { getMySocialAccountsQueryOptions } from '@/features/account/api/account.query-options'
import { useStartOAuthAssociateMutation } from '@/features/account/hooks/use-start-oauth-associate-mutation'
import { useUnlinkMySocialAccountMutation } from '@/features/account/hooks/use-unlink-my-social-account-mutation'
import { getApiErrorMessage } from '@/lib/api/errors'

const LINKABLE_PROVIDERS = ['google'] as const

function formatProvider(provider: string) {
  if (!provider) {
    return 'Provider'
  }

  return provider.charAt(0).toUpperCase() + provider.slice(1).toLowerCase()
}

export function LinkedAccountsCard() {
  const queryClient = useQueryClient()
  const socialAccountsQuery = useQuery(getMySocialAccountsQueryOptions())
  const unlinkMutation = useUnlinkMySocialAccountMutation()
  const startAssociateMutation = useStartOAuthAssociateMutation()
  const [confirmingAccountId, setConfirmingAccountId] = useState<string | null>(
    null
  )
  const accounts = socialAccountsQuery.data ?? []
  const linkedProviders = new Set(
    accounts.map((account) => account.provider.toLowerCase())
  )
  const availableProviders = LINKABLE_PROVIDERS.filter(
    (provider) => !linkedProviders.has(provider)
  )

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const linked = params.get('linked')

    if (!linked) {
      return
    }

    toast.success(`${formatProvider(linked)} linked to your account.`)
    void queryClient.invalidateQueries({
      queryKey: accountKeys.socialAccounts(),
    })

    params.delete('linked')
    const nextSearch = params.toString()
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
    window.history.replaceState({}, '', nextUrl)
  }, [queryClient])

  return (
    <Card className="border border-border/70">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <CardTitle className="text-xl">Linked accounts</CardTitle>
            <p className="text-sm text-muted-foreground">
              OAuth providers linked to this account. Unlinking removes that sign-in
              method; you must keep at least one way to sign in.
            </p>
          </div>
          {availableProviders.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {availableProviders.map((provider) => (
                <Button
                  key={provider}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={startAssociateMutation.isPending}
                  onClick={() => {
                    startAssociateMutation.mutate(provider)
                  }}
                >
                  {startAssociateMutation.isPending &&
                  startAssociateMutation.variables === provider
                    ? `Opening ${formatProvider(provider)}…`
                    : `Link ${formatProvider(provider)}`}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {socialAccountsQuery.isError ? (
          <AppErrorState>
            {getApiErrorMessage(
              socialAccountsQuery.error,
              'Linked accounts could not be loaded.'
            )}
          </AppErrorState>
        ) : socialAccountsQuery.isPending ? (
          <AppEmptyState title="Loading linked accounts…" compact />
        ) : accounts.length > 0 ? (
          <div className="space-y-3">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="rounded-lg border bg-muted/30 px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">
                        {formatProvider(account.provider)}
                      </div>
                      {account.email_verified ? (
                        <Badge variant="secondary">Verified email</Badge>
                      ) : (
                        <Badge variant="outline">Unverified email</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {account.display_name?.trim() || account.email || account.provider_user_id}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={unlinkMutation.isPending}
                    onClick={() => {
                      setConfirmingAccountId((current) =>
                        current === account.id ? null : account.id
                      )
                    }}
                  >
                    Unlink
                  </Button>
                </div>
                {confirmingAccountId === account.id ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/80 px-3 py-2">
                    <span className="text-sm text-muted-foreground">
                      Unlink {formatProvider(account.provider)} from this account?
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={unlinkMutation.isPending}
                        onClick={() => {
                          setConfirmingAccountId(null)
                        }}
                      >
                        Keep linked
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={unlinkMutation.isPending}
                        onClick={async () => {
                          try {
                            await unlinkMutation.mutateAsync(account.id)
                            setConfirmingAccountId(null)
                          } catch {
                            return
                          }
                        }}
                      >
                        {unlinkMutation.isPending &&
                        unlinkMutation.variables === account.id
                          ? 'Unlinking…'
                          : 'Confirm unlink'}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <AppEmptyState
            title="No linked accounts"
            description={
              availableProviders.length > 0
                ? 'No OAuth providers are linked yet. Use Link Google above to connect a provider.'
                : 'No OAuth providers are linked yet. Hosts can mount associate routes when provider credentials are configured.'
            }
            compact
          />
        )}
      </CardContent>
    </Card>
  )
}
