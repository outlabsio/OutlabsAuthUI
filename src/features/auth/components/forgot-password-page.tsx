import { useState } from 'react'

import { Link } from '@tanstack/react-router'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { AuthCard } from '@/features/auth/components/auth-card'
import { AuthRequestCooldownNote } from '@/features/auth/components/auth-request-cooldown-note'
import { AuthStatusCard } from '@/features/auth/components/auth-status-card'
import { useForgotPasswordMutation } from '@/features/auth/hooks/use-forgot-password-mutation'
import {
  type ForgotPasswordFormValues,
  forgotPasswordSchema,
} from '@/features/auth/schemas/forgot-password.schema'
import {
  formatCooldown,
  getRetryAfterSeconds,
  useAuthRequestCooldown,
} from '@/features/auth/utils/auth-request-cooldown'
import { getApiErrorMessage } from '@/lib/api/errors'
import { routes } from '@/lib/constants/routes'

export function ForgotPasswordPage() {
  const forgotPasswordMutation = useForgotPasswordMutation()
  const [requestedEmail, setRequestedEmail] = useState<string | null>(null)
  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  })
  const emailValue = useWatch({
    control: form.control,
    name: 'email',
  })
  const cooldown = useAuthRequestCooldown({
    email: requestedEmail ?? emailValue,
    kind: 'forgot-password',
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
            <AuthRequestCooldownNote
              actionLabel="You can request another reset link"
              progressPercent={cooldown.progressPercent}
              secondsRemaining={cooldown.secondsRemaining}
            />
            <Button
              type="button"
              variant="outline"
              disabled={cooldown.isCoolingDown}
              onClick={() => {
                forgotPasswordMutation.reset()
                form.reset()
                setRequestedEmail(null)
              }}
            >
              {cooldown.isCoolingDown
                ? `Request another link in ${formatCooldown(cooldown.secondsRemaining)}`
                : 'Request another link'}
            </Button>
          </>
        }
      />
    )
  }

  return (
    <AuthCard
      title="Reset your password"
      description="Enter your email address and we will send a reset link if the account exists."
      footer={
        <div className="text-sm text-muted-foreground">
          Remember your password?{' '}
          <Link
            to={routes.auth.login}
            className="underline underline-offset-4 transition-colors hover:text-primary"
          >
            Back to sign in
          </Link>
        </div>
      }
    >
      <form
        onSubmit={form.handleSubmit(async (values) => {
          if (cooldown.isCoolingDown) {
            return
          }

          try {
            await forgotPasswordMutation.mutateAsync(values)
            setRequestedEmail(values.email)
            cooldown.startCooldown()
          } catch (error) {
            const retryAfterSeconds = getRetryAfterSeconds(error)

            if (retryAfterSeconds != null) {
              setRequestedEmail(values.email)
              cooldown.startCooldown(retryAfterSeconds)
            }

            return
          }
        })}
      >
        <FieldGroup>
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
            <Button
              type="submit"
              disabled={forgotPasswordMutation.isPending || cooldown.isCoolingDown}
            >
              {cooldown.isCoolingDown
                ? `Send again in ${formatCooldown(cooldown.secondsRemaining)}`
                : forgotPasswordMutation.isPending
                  ? 'Sending reset link...'
                  : 'Send reset link'}
            </Button>
            <AuthRequestCooldownNote
              actionLabel="You can request another reset link"
              progressPercent={cooldown.progressPercent}
              secondsRemaining={cooldown.secondsRemaining}
            />
            {submitError ? <FieldError>{submitError}</FieldError> : null}
          </Field>
        </FieldGroup>
      </form>
    </AuthCard>
  )
}
