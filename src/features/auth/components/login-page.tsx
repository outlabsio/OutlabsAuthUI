import { useEffect } from 'react'

import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { getAuthConfigQueryOptions } from '@/features/auth/api/auth.query-options'
import { AuthCard } from '@/features/auth/components/auth-card'
import { useLoginMutation } from '@/features/auth/hooks/use-login-mutation'
import { loginSchema } from '@/features/auth/schemas/login.schema'
import type { LoginCredentials } from '@/features/auth/types/auth.types'
import { getAuthErrorMessage } from '@/features/auth/utils/auth-error-message'
import { hasStoredAuthTokens } from '@/lib/api/auth-token'
import { routes } from '@/lib/constants/routes'
import { getRuntimeConfig } from '@/lib/runtime-config'
import { cn } from '@/lib/utils/cn'

type LoginPageProps = {
  className?: string
}

export function LoginPage({ className }: LoginPageProps) {
  const runtimeConfig = getRuntimeConfig()
  const navigate = useNavigate()
  const authConfigQuery = useQuery(getAuthConfigQueryOptions())
  const loginMutation = useLoginMutation()
  const form = useForm<LoginCredentials>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const submitError = loginMutation.error
    ? getAuthErrorMessage(loginMutation.error, 'Unable to sign in.')
    : null

  const emailField = form.register('email')
  const passwordField = form.register('password')
  const magicLinkEnabled =
    authConfigQuery.data?.auth_methods?.magic_link ??
    authConfigQuery.data?.features.magic_links ??
    true
  const accessCodeEnabled =
    authConfigQuery.data?.auth_methods?.access_code ??
    authConfigQuery.data?.features.access_codes ??
    true
  const passwordlessEnabled = magicLinkEnabled || accessCodeEnabled

  useEffect(() => {
    if (!hasStoredAuthTokens()) {
      return
    }

    void navigate({
      to: routes.app.dashboard,
      replace: true,
    })
  }, [navigate])

  return (
    <div className={cn('w-full', className)}>
      <AuthCard
        title="Welcome back"
        description={runtimeConfig.signInDescription}
        footer={
          <div className="text-sm text-muted-foreground">
            Need another option?{' '}
            <Link
              to={routes.auth.accessCode}
              search={{ mode: 'verify' }}
              className="underline underline-offset-4 transition-colors hover:text-primary"
            >
              Enter code
            </Link>
          </div>
        }
      >
        <form
          onSubmit={form.handleSubmit(async (values) => {
            try {
              await loginMutation.mutateAsync(values)
              await navigate({
                to: routes.app.dashboard,
              })
            } catch {
              return
            }
          })}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                aria-invalid={Boolean(form.formState.errors.email)}
                disabled={loginMutation.isPending}
                {...emailField}
                onChange={(event) => {
                  if (loginMutation.error) {
                    loginMutation.reset()
                  }

                  emailField.onChange(event)
                }}
              />
              <FieldError errors={[form.formState.errors.email]} />
            </Field>
            <Field>
              <div className="flex items-center">
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="ml-auto h-auto px-0 text-sm"
                  nativeButton={false}
                  render={<Link to={routes.auth.forgotPassword} />}
                >
                  Forgot password?
                </Button>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                autoComplete="current-password"
                aria-invalid={Boolean(form.formState.errors.password)}
                disabled={loginMutation.isPending}
                {...passwordField}
                onChange={(event) => {
                  if (loginMutation.error) {
                    loginMutation.reset()
                  }

                  passwordField.onChange(event)
                }}
              />
              <FieldError errors={[form.formState.errors.password]} />
            </Field>
            <Field>
              <Button type="submit" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? 'Signing in...' : 'Sign in'}
              </Button>
              {submitError ? <FieldError>{submitError}</FieldError> : null}
            </Field>
            {passwordlessEnabled ? (
              <>
                <FieldSeparator>or</FieldSeparator>
                <div className="grid gap-2">
                  {magicLinkEnabled ? (
                    <Button
                      type="button"
                      variant="outline"
                      nativeButton={false}
                      render={<Link to={routes.auth.magicLink} />}
                    >
                      Email me a sign-in link
                    </Button>
                  ) : null}
                  {accessCodeEnabled ? (
                    <Button
                      type="button"
                      variant="outline"
                      nativeButton={false}
                      render={<Link to={routes.auth.accessCode} />}
                    >
                      Email me a sign-in code
                    </Button>
                  ) : null}
                </div>
              </>
            ) : null}
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <Link
                to={routes.auth.magicLink}
                className="underline underline-offset-4 transition-colors hover:text-primary"
              >
                Magic link
              </Link>
              <Link
                to={routes.auth.accessCode}
                className="underline underline-offset-4 transition-colors hover:text-primary"
              >
                Request code
              </Link>
              <Link
                to={routes.auth.forgotPassword}
                className="underline underline-offset-4 transition-colors hover:text-primary"
              >
                Reset password
              </Link>
            </div>
          </FieldGroup>
        </form>
      </AuthCard>
    </div>
  )
}
