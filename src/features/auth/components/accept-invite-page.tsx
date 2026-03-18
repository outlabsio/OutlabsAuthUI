import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { AuthStatusCard } from '@/features/auth/components/auth-status-card'
import { useAcceptInviteMutation } from '@/features/auth/hooks/use-accept-invite-mutation'
import {
  type PasswordSetupFormValues,
  passwordSetupSchema,
} from '@/features/auth/schemas/password-setup.schema'
import { getApiErrorMessage } from '@/lib/api/errors'
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
    ? getApiErrorMessage(
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
    <div className="flex w-full max-w-md flex-col gap-6">
      <Card>
        <CardContent className="p-6 sm:p-8">
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
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="text-xs font-semibold tracking-[0.24em] text-muted-foreground uppercase">
                  OutlabsAuth
                </p>
                <h1 className="text-2xl font-bold">Accept your invitation</h1>
                <p className="text-sm text-muted-foreground">
                  Set your password to activate the account. This will sign you in immediately.
                </p>
              </div>
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
                If you are currently signed in as another user in this browser,
                this will replace that active session.
              </FieldDescription>
              <Field>
                <Button type="submit" disabled={acceptInviteMutation.isPending}>
                  {acceptInviteMutation.isPending
                    ? 'Accepting invitation...'
                    : 'Accept invitation'}
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
