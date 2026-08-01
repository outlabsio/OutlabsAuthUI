import { useEffect, useState } from 'react'

import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { AuthCard } from '@/features/auth/components/auth-card'
import { finalizeAuthSession } from '@/features/auth/utils/finalize-auth-session'
import { routes } from '@/lib/constants/routes'
import { cn } from '@/lib/utils/cn'

function readOAuthTokensFromHash() {
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash) {
    return null
  }

  const params = new URLSearchParams(hash)
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')

  if (!accessToken || !refreshToken) {
    return null
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: params.get('token_type') || 'bearer',
  }
}

type OAuthCallbackPageProps = {
  className?: string
}

export function OAuthCallbackPage({ className }: OAuthCallbackPageProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function completeOAuthLogin() {
      const tokens = readOAuthTokensFromHash()

      if (!tokens) {
        if (!cancelled) {
          setError('Google sign-in did not return a usable session.')
        }
        return
      }

      try {
        await finalizeAuthSession(queryClient, tokens)
        window.history.replaceState(
          {},
          '',
          `${window.location.pathname}${window.location.search}`
        )
        if (!cancelled) {
          await navigate({
            to: routes.app.dashboard,
            replace: true,
          })
        }
      } catch {
        if (!cancelled) {
          setError('Google sign-in could not be completed.')
        }
      }
    }

    void completeOAuthLogin()

    return () => {
      cancelled = true
    }
  }, [navigate, queryClient])

  return (
    <div className={cn('w-full', className)}>
      <AuthCard
        title="Signing you in"
        description={
          error
            ? error
            : 'Finishing Google sign-in and loading your console session…'
        }
        footer={
          error ? (
            <a
              href={routes.auth.login}
              className="text-sm underline underline-offset-4 transition-colors hover:text-primary"
            >
              Back to sign in
            </a>
          ) : null
        }
      >
        {!error ? (
          <p className="text-sm text-muted-foreground">Please wait a moment.</p>
        ) : null}
      </AuthCard>
    </div>
  )
}
