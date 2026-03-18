import { Link } from '@tanstack/react-router'
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
import { AuthStatusCard } from '@/features/auth/components/auth-status-card'
import { useForgotPasswordMutation } from '@/features/auth/hooks/use-forgot-password-mutation'
import {
  type ForgotPasswordFormValues,
  forgotPasswordSchema,
} from '@/features/auth/schemas/forgot-password.schema'
import { getApiErrorMessage } from '@/lib/api/errors'
import { routes } from '@/lib/constants/routes'

export function ForgotPasswordPage() {
  const forgotPasswordMutation = useForgotPasswordMutation()
  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  })

  const submitError = forgotPasswordMutation.error
    ? getApiErrorMessage(
        forgotPasswordMutation.error,
        'Unable to request a password reset.'
      )
    : null

  if (forgotPasswordMutation.isSuccess) {
    return (
      <AuthStatusCard
        title="Check your email"
        description="If an account exists for that address, a password reset link has been sent."
        actions={
          <>
            <Button nativeButton={false} render={<Link to={routes.auth.login} />}>
              Back to sign in
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                forgotPasswordMutation.reset()
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
                await forgotPasswordMutation.mutateAsync(values)
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
                <h1 className="text-2xl font-bold">Forgot your password?</h1>
                <p className="text-sm text-muted-foreground">
                  Enter your email address and we&apos;ll send a reset link if the account exists.
                </p>
              </div>
              <Field>
                <FieldLabel htmlFor="forgot-password-email">Email</FieldLabel>
                <Input
                  id="forgot-password-email"
                  type="email"
                  autoComplete="email"
                  aria-invalid={Boolean(form.formState.errors.email)}
                  disabled={forgotPasswordMutation.isPending}
                  {...form.register('email')}
                />
                <FieldError errors={[form.formState.errors.email]} />
              </Field>
              <Field>
                <Button type="submit" disabled={forgotPasswordMutation.isPending}>
                  {forgotPasswordMutation.isPending
                    ? 'Sending reset link...'
                    : 'Send reset link'}
                </Button>
                {submitError ? <FieldError>{submitError}</FieldError> : null}
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
