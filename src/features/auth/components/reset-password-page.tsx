import { Link, useSearch } from '@tanstack/react-router'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { AuthCard } from '@/features/auth/components/auth-card'
import { AuthStatusCard } from '@/features/auth/components/auth-status-card'
import { useResetPasswordMutation } from '@/features/auth/hooks/use-reset-password-mutation'
import {
  type PasswordSetupFormValues,
  passwordSetupSchema,
} from '@/features/auth/schemas/password-setup.schema'
import { getApiErrorMessage } from '@/lib/api/errors'
import { routes } from '@/lib/constants/routes'

export function ResetPasswordPage() {
  const { token } = useSearch({
    from: '/auth/reset-password',
  })
  const resetPasswordMutation = useResetPasswordMutation()
  const form = useForm<PasswordSetupFormValues>({
    resolver: zodResolver(passwordSetupSchema),
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
  })

  const submitError = resetPasswordMutation.error
    ? getApiErrorMessage(
        resetPasswordMutation.error,
        'Unable to reset your password.'
      )
    : null

  if (!token) {
    return (
      <AuthStatusCard
        title="Invalid reset link"
        description="This password reset link is missing its token. Request a new one and try again."
        actions={
          <Button
            nativeButton={false}
            render={<Link to={routes.auth.forgotPassword} />}
          >
            Request a new reset link
          </Button>
        }
      />
    )
  }

  if (resetPasswordMutation.isSuccess) {
    return (
      <AuthStatusCard
        title="Password updated"
        description="Your password has been reset. You can sign in with the new password now."
        actions={
          <Button nativeButton={false} render={<Link to={routes.auth.login} />}>
            Back to sign in
          </Button>
        }
      />
    )
  }

  return (
    <AuthCard
      title="Reset your password"
      description="Choose a new password to finish the recovery process."
      footer={
        <div className="text-sm text-muted-foreground">
          Prefer to try again later?{' '}
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
          try {
            await resetPasswordMutation.mutateAsync({
              token,
              new_password: values.newPassword,
            })
          } catch {
            return
          }
        })}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="reset-password-new-password">
              New password
            </FieldLabel>
            <Input
              id="reset-password-new-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(form.formState.errors.newPassword)}
              disabled={resetPasswordMutation.isPending}
              {...form.register('newPassword')}
            />
            <FieldError errors={[form.formState.errors.newPassword]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="reset-password-confirm-password">
              Confirm password
            </FieldLabel>
            <Input
              id="reset-password-confirm-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(form.formState.errors.confirmPassword)}
              disabled={resetPasswordMutation.isPending}
              {...form.register('confirmPassword')}
            />
            <FieldError errors={[form.formState.errors.confirmPassword]} />
          </Field>
          <Field>
            <Button type="submit" disabled={resetPasswordMutation.isPending}>
              {resetPasswordMutation.isPending
                ? 'Resetting password...'
                : 'Reset password'}
            </Button>
            {submitError ? <FieldError>{submitError}</FieldError> : null}
          </Field>
        </FieldGroup>
      </form>
    </AuthCard>
  )
}
