import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { AuthCard } from '@/features/auth/components/auth-card'
import { AuthStatusCard } from '@/features/auth/components/auth-status-card'
import { useAcceptInviteMutation } from '@/features/auth/hooks/use-accept-invite-mutation'
import {
  type PasswordSetupFormValues,
  passwordSetupSchema,
} from '@/features/auth/schemas/password-setup.schema'
import { getAuthErrorMessage } from '@/features/auth/utils/auth-error-message'
import { routes } from '@/lib/constants/routes'

export function AcceptInvitePage() {
  const navigate = useNavigate()
  const { token } = useSearch({
    from: '/auth/accept-invite',
  })
  const acceptInviteMutation = useAcceptInviteMutation()
  const form = useForm<PasswordSetupFormValues>({
    resolver: zodResolver(passwordSetupSchema),
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
  })

  const submitError = acceptInviteMutation.error
    ? getAuthErrorMessage(
        acceptInviteMutation.error,
        'Unable to accept this invitation.'
      )
    : null

  if (!token) {
    return (
      <AuthStatusCard
        title="Invalid invitation link"
        description="This invite link is missing its token. Request a fresh invitation and try again."
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
      title="Accept your invitation"
      description="Set your password to activate the account."
      footer={
        <div className="text-sm text-muted-foreground">
          Not ready to accept?{' '}
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
            await acceptInviteMutation.mutateAsync({
              token,
              new_password: values.newPassword,
            })

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
            <FieldLabel htmlFor="accept-invite-new-password">
              New password
            </FieldLabel>
            <Input
              id="accept-invite-new-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(form.formState.errors.newPassword)}
              disabled={acceptInviteMutation.isPending}
              {...form.register('newPassword')}
            />
            <FieldError errors={[form.formState.errors.newPassword]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="accept-invite-confirm-password">
              Confirm password
            </FieldLabel>
            <Input
              id="accept-invite-confirm-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(form.formState.errors.confirmPassword)}
              disabled={acceptInviteMutation.isPending}
              {...form.register('confirmPassword')}
            />
            <FieldError errors={[form.formState.errors.confirmPassword]} />
          </Field>
          <FieldDescription className="text-sm">
            If you are currently signed in as another user in this browser, this
            will replace that active session.
          </FieldDescription>
          <Field>
            <Button type="submit" disabled={acceptInviteMutation.isPending}>
              {acceptInviteMutation.isPending
                ? 'Accepting invitation...'
                : 'Accept invitation'}
            </Button>
            {submitError ? <FieldError>{submitError}</FieldError> : null}
          </Field>
        </FieldGroup>
      </form>
    </AuthCard>
  )
}
