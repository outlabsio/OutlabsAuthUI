import { useEffect } from 'react'

import { Link, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { getAuthConfigQueryOptions } from '@/features/auth/api/auth.query-options'
import { AuthStatusCard } from '@/features/auth/components/auth-status-card'
import { useRequestMagicLinkMutation } from '@/features/auth/hooks/use-request-magic-link-mutation'
import { useVerifyMagicLinkMutation } from '@/features/auth/hooks/use-verify-magic-link-mutation'
import {
  type MagicLinkRequestFormValues,
  magicLinkRequestSchema,
} from '@/features/auth/schemas/magic-link.schema'
import { getAuthErrorMessage } from '@/features/auth/utils/auth-error-message'
import { getApiErrorMessage } from '@/lib/api/errors'
import { routes } from '@/lib/constants/routes'
import { getRuntimeConfig } from '@/lib/runtime-config'

const startedMagicLinkVerifications = new Set<string>()

function buildDashboardRedirectUrl() {
  if (typeof window === 'undefined') {
    return null
  }

  return `${window.location.origin}${routes.app.dashboard}`
}

function getSafeRedirectTarget(redirect?: string) {
  if (!redirect || typeof window === 'undefined') {
    return routes.app.dashboard
  }

  if (redirect.startsWith('/') && !redirect.startsWith('//')) {
    return redirect
  }

  try {
    const url = new URL(redirect, window.location.origin)

    if (url.origin === window.location.origin) {
      return `${url.pathname}${url.search}${url.hash}`
    }
  } catch {
    return routes.app.dashboard
  }

  return routes.app.dashboard
}

export function MagicLinkPage() {
  const runtimeConfig = getRuntimeConfig()
  const { redirect, token } = useSearch({
    from: '/auth/magic-link',
  })
  const authConfigQuery = useQuery(getAuthConfigQueryOptions())
  const requestMagicLinkMutation = useRequestMagicLinkMutation()
  const verifyMagicLinkMutation = useVerifyMagicLinkMutation()
  const form = useForm<MagicLinkRequestFormValues>({
    resolver: zodResolver(magicLinkRequestSchema),
    defaultValues: {
      email: '',
    },
  })
  const emailField = form.register('email')

  const magicLinkEnabled =
    authConfigQuery.data?.auth_methods?.magic_link ??
    authConfigQuery.data?.features.magic_links ??
    true

  const requestSubmitError = requestMagicLinkMutation.error
    ? getApiErrorMessage(
        requestMagicLinkMutation.error,
        'Unable to request a magic link.'
      )
    : null

  const verifySubmitError = verifyMagicLinkMutation.error
    ? getAuthErrorMessage(
        verifyMagicLinkMutation.error,
        'This magic link is invalid or has expired.'
      )
    : null

  useEffect(() => {
    if (!token || startedMagicLinkVerifications.has(token)) {
      return
    }

    startedMagicLinkVerifications.add(token)

    void verifyMagicLinkMutation
      .mutateAsync({ token })
      .then(() => {
        const target = getSafeRedirectTarget(redirect)
        window.location.assign(target)
      })
      .catch(() => undefined)
  }, [redirect, token, verifyMagicLinkMutation])

  if (token) {
    if (verifyMagicLinkMutation.isError) {
      return (
        <AuthStatusCard
          title="Magic link expired"
          description={verifySubmitError ?? 'Request a new sign-in link and try again.'}
          actions={
            <>
              <Button nativeButton={false} render={<Link to={routes.auth.magicLink} />}>
                Request a new link
              </Button>
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link to={routes.auth.login} />}
              >
                Back to sign in
              </Button>
            </>
          }
        />
      )
    }

    return (
      <AuthStatusCard
        title={
          verifyMagicLinkMutation.isSuccess ? 'Signed in' : 'Signing you in'
        }
        description={
          verifyMagicLinkMutation.isSuccess
            ? 'Opening your workspace now.'
            : 'We are verifying this one-time sign-in link.'
        }
      />
    )
  }

  if (!magicLinkEnabled && authConfigQuery.isSuccess) {
    return (
      <AuthStatusCard
        title="Magic links unavailable"
        description="This workspace is not accepting magic-link sign-ins right now."
        actions={
          <Button nativeButton={false} render={<Link to={routes.auth.login} />}>
            Back to sign in
          </Button>
        }
      />
    )
  }

  if (requestMagicLinkMutation.isSuccess) {
    return (
      <AuthStatusCard
        title="Check your email"
        description="If an account exists for that address, a sign-in link has been sent."
        actions={
          <>
            <Button nativeButton={false} render={<Link to={routes.auth.login} />}>
              Back to sign in
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                requestMagicLinkMutation.reset()
                form.reset()
              }}
            >
              Request another link
            </Button>
          </>
        }
      />
    )
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <Card>
        <CardContent className="p-6 sm:p-8">
          <form
            onSubmit={form.handleSubmit(async (values) => {
              try {
                await requestMagicLinkMutation.mutateAsync({
                  email: values.email,
                  redirect_url: buildDashboardRedirectUrl(),
                })
              } catch {
                return
              }
            })}
          >
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="text-xs font-semibold tracking-[0.24em] text-muted-foreground uppercase">
                  {runtimeConfig.authBrand}
                </p>
                <h1 className="text-2xl font-bold">Email sign-in link</h1>
                <p className="text-sm text-muted-foreground">
                  Enter your email and we&apos;ll send a one-time link if the account exists.
                </p>
              </div>
              <Field>
                <FieldLabel htmlFor="magic-link-email">Email</FieldLabel>
                <Input
                  id="magic-link-email"
                  type="email"
                  autoComplete="email"
                  aria-invalid={Boolean(form.formState.errors.email)}
                  disabled={requestMagicLinkMutation.isPending}
                  {...emailField}
                  onChange={(event) => {
                    if (requestMagicLinkMutation.error) {
                      requestMagicLinkMutation.reset()
                    }

                    emailField.onChange(event)
                  }}
                />
                <FieldError errors={[form.formState.errors.email]} />
              </Field>
              <Field>
                <Button
                  type="submit"
                  disabled={requestMagicLinkMutation.isPending}
                >
                  {requestMagicLinkMutation.isPending
                    ? 'Sending link...'
                    : 'Send sign-in link'}
                </Button>
                {requestSubmitError ? (
                  <FieldError>{requestSubmitError}</FieldError>
                ) : null}
              </Field>
              <Field>
                <Button
                  type="button"
                  variant="ghost"
                  nativeButton={false}
                  render={<Link to={routes.auth.login} />}
                >
                  Back to sign in
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
