import { useEffect } from 'react'

import { Link } from '@tanstack/react-router'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useLoginMutation } from '@/features/auth/hooks/use-login-mutation'
import { loginSchema } from '@/features/auth/schemas/login.schema'
import type { LoginCredentials } from '@/features/auth/types/auth.types'
import { getAuthErrorMessage } from '@/features/auth/utils/auth-error-message'
import { hasStoredAuthTokens } from '@/lib/api/auth-token'
import { apiConfig } from '@/lib/api/config'
import { routes } from '@/lib/constants/routes'
import { cn } from '@/lib/utils/cn'

type LoginPageProps = {
  className?: string
}

export function LoginPage({ className }: LoginPageProps) {
  const navigate = useNavigate()
  const loginMutation = useLoginMutation()
  const apiTarget = `${apiConfig.baseUrl}${apiConfig.authPrefix}`
  const previewAdminEmail =
    import.meta.env.VITE_LOCAL_ADMIN_EMAIL ?? 'admin@demo.com'
  const previewAdminPassword =
    import.meta.env.VITE_LOCAL_ADMIN_PASSWORD ?? 'DiverseDemo123'
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
    <div className={cn('flex w-full max-w-5xl flex-col gap-6', className)}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form
            className="p-6 md:p-8"
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
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="text-xs font-semibold tracking-[0.24em] text-muted-foreground uppercase">
                  OutlabsAuth
                </p>
                <h1 className="text-2xl font-bold">Welcome back</h1>
                <p className="text-balance text-muted-foreground">
                  Sign in against the local OutlabsAuth backend to access the admin console.
                </p>
              </div>
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
              <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                Local preview
              </FieldSeparator>
              <FieldDescription className="text-center">
                Known local superuser: <code>{previewAdminEmail}</code> /{' '}
                <code>{previewAdminPassword}</code>.
              </FieldDescription>
            </FieldGroup>
          </form>
          <div className="relative hidden bg-muted md:block">
            <div className="absolute inset-0 p-8">
              <div className="flex h-full flex-col justify-between rounded-xl border bg-background p-6 text-foreground shadow-sm">
                <div className="space-y-3">
                  <p className="text-xs font-semibold tracking-[0.24em] uppercase text-muted-foreground">
                    External admin UI
                  </p>
                  <h2 className="text-2xl font-semibold">
                    External admin frontend for OutlabsAuth.
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    This screen targets the live login and current-user endpoints from whichever
                    auth backend is configured for the current environment.
                  </p>
                </div>
                <div className="grid gap-3">
                  <div className="rounded-lg border bg-muted px-4 py-3 text-sm">
                    Shell: mixed `sidebar-07` collapse behavior with `sidebar-08` inset styling
                  </div>
                  <div className="rounded-lg border bg-muted px-4 py-3 text-sm">
                    API target: <code>{apiTarget}</code>, overridable via <code>VITE_API_BASE_URL</code> and <code>VITE_AUTH_API_PREFIX</code>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
