import { useEffect } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import { AppLoadingState } from '@/components/app/app-loading-state'
import { AppPage } from '@/components/app/app-page'
import { AppStatusBadge } from '@/components/app/app-status-badge'
import { AppStatusCallout } from '@/components/app/app-status-callout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useChangeCurrentUserPasswordMutation } from '@/features/account/hooks/use-change-current-user-password-mutation'
import { useUpdateCurrentUserMutation } from '@/features/account/hooks/use-update-current-user-mutation'
import {
  changeAccountPasswordSchema,
  type ChangeAccountPasswordFormValues,
} from '@/features/account/schemas/change-account-password.schema'
import {
  updateAccountProfileSchema,
  type UpdateAccountProfileFormValues,
} from '@/features/account/schemas/update-account-profile.schema'
import { useSessionQuery } from '@/features/auth/hooks/use-session-query'
import type { SessionUser } from '@/features/auth/types/auth.types'
import { getApiErrorMessage } from '@/lib/api/errors'
import type { AppStatusTone } from '@/components/app/app-status'

function formatDateTime(value?: string | null, fallback = 'Not yet recorded') {
  if (!value) {
    return fallback
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return fallback
  }
}

function formatStatusLabel(status: SessionUser['status']) {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function getStatusTone(status: SessionUser['status']): AppStatusTone {
  switch (status) {
    case 'active':
      return 'success'
    case 'invited':
      return 'info'
    case 'suspended':
      return 'warning'
    case 'banned':
    case 'deleted':
      return 'error'
  }
}

export function AccountPage() {
  const sessionQuery = useSessionQuery()
  const updateProfileMutation = useUpdateCurrentUserMutation()
  const changePasswordMutation = useChangeCurrentUserPasswordMutation()
  const profileForm = useForm<UpdateAccountProfileFormValues>({
    resolver: zodResolver(updateAccountProfileSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
    },
  })
  const passwordForm = useForm<ChangeAccountPasswordFormValues>({
    resolver: zodResolver(changeAccountPasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  const sessionUser = sessionQuery.data ?? null

  useEffect(() => {
    if (!sessionUser) {
      return
    }

    profileForm.reset({
      firstName: sessionUser.first_name ?? '',
      lastName: sessionUser.last_name ?? '',
      email: sessionUser.email,
    })
  }, [profileForm, sessionUser])

  const profileErrorMessage = updateProfileMutation.error
    ? getApiErrorMessage(
        updateProfileMutation.error,
        'Your profile could not be updated.'
      )
    : null
  const passwordErrorMessage = changePasswordMutation.error
    ? getApiErrorMessage(
        changePasswordMutation.error,
        'Your password could not be updated.'
      )
    : null

  if (sessionQuery.isPending) {
    return <AppLoadingState title="Loading account workspace" />
  }

  if (sessionQuery.isError || !sessionUser) {
    return (
      <AppPage title="Account" padded>
        <AppStatusCallout tone="error" role="alert">
          {getApiErrorMessage(
            sessionQuery.error,
            'The current account session could not be loaded.'
          )}
        </AppStatusCallout>
      </AppPage>
    )
  }

  const firstNameField = profileForm.register('firstName')
  const lastNameField = profileForm.register('lastName')
  const emailField = profileForm.register('email')
  const currentPasswordField = passwordForm.register('currentPassword')
  const newPasswordField = passwordForm.register('newPassword')
  const confirmPasswordField = passwordForm.register('confirmPassword')

  return (
    <AppPage
      title="Account"
      padded
      description="Manage your own profile, session-facing lifecycle state, and password using the current self-service backend endpoints."
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Card className="border border-border/70">
          <CardHeader className="gap-3">
            <div className="space-y-2">
              <CardTitle className="text-xl">Session snapshot</CardTitle>
              <p className="text-sm text-muted-foreground">
                This card reflects the current <code>/users/me</code> response that
                drives the app shell.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <AppStatusBadge tone={getStatusTone(sessionUser.status)}>
                {formatStatusLabel(sessionUser.status)}
              </AppStatusBadge>
              <Badge variant={sessionUser.email_verified ? 'secondary' : 'outline'}>
                {sessionUser.email_verified ? 'Email verified' : 'Email unverified'}
              </Badge>
              {sessionUser.is_superuser ? (
                <Badge variant="outline">Superuser</Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {sessionUser.locked_until ? (
              <AppStatusCallout tone="warning">
                A temporary lockout is active until{' '}
                <span className="font-medium">
                  {formatDateTime(sessionUser.locked_until)}
                </span>
                . OAuth login and invite auto-login remain blocked during this window.
              </AppStatusCallout>
            ) : (
              <div className="rounded-2xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                No active lockout is recorded for this account.
              </div>
            )}

            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <dt className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                  Email
                </dt>
                <dd className="text-sm font-medium">{sessionUser.email}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                  Root entity
                </dt>
                <dd className="text-sm font-medium">
                  {sessionUser.root_entity_name ?? 'No root entity'}
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                  Last login
                </dt>
                <dd className="text-sm">
                  {formatDateTime(sessionUser.last_login, 'No login recorded')}
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                  Last activity
                </dt>
                <dd className="text-sm">
                  {formatDateTime(
                    sessionUser.last_activity,
                    'No activity recorded'
                  )}
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                  Password changed
                </dt>
                <dd className="text-sm">
                  {formatDateTime(
                    sessionUser.last_password_change,
                    'Password has not been changed yet'
                  )}
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                  Account created
                </dt>
                <dd className="text-sm">
                  {formatDateTime(
                    sessionUser.created_at,
                    'Creation time unavailable'
                  )}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="border border-border/70">
            <CardHeader className="gap-3">
              <div className="space-y-2">
                <CardTitle className="text-xl">Self-service profile</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Update the same identity fields available through
                  <code> PATCH /users/me</code>.
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-5"
                onSubmit={profileForm.handleSubmit(async (values) => {
                  try {
                    const updatedUser = await updateProfileMutation.mutateAsync({
                      email: values.email,
                      first_name: values.firstName,
                      last_name: values.lastName,
                    })

                    profileForm.reset({
                      firstName: updatedUser.first_name ?? '',
                      lastName: updatedUser.last_name ?? '',
                      email: updatedUser.email,
                    })
                  } catch {
                    return
                  }
                })}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="account-first-name">First name</FieldLabel>
                    <Input
                      id="account-first-name"
                      autoComplete="given-name"
                      disabled={updateProfileMutation.isPending}
                      {...firstNameField}
                      onChange={(event) => {
                        if (updateProfileMutation.error) {
                          updateProfileMutation.reset()
                        }

                        firstNameField.onChange(event)
                      }}
                    />
                    <FieldError errors={[profileForm.formState.errors.firstName]} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="account-last-name">Last name</FieldLabel>
                    <Input
                      id="account-last-name"
                      autoComplete="family-name"
                      disabled={updateProfileMutation.isPending}
                      {...lastNameField}
                      onChange={(event) => {
                        if (updateProfileMutation.error) {
                          updateProfileMutation.reset()
                        }

                        lastNameField.onChange(event)
                      }}
                    />
                    <FieldError errors={[profileForm.formState.errors.lastName]} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="account-email">Email</FieldLabel>
                    <Input
                      id="account-email"
                      type="email"
                      autoComplete="email"
                      disabled={updateProfileMutation.isPending}
                      {...emailField}
                      onChange={(event) => {
                        if (updateProfileMutation.error) {
                          updateProfileMutation.reset()
                        }

                        emailField.onChange(event)
                      }}
                    />
                    <FieldDescription>
                      The backend keeps deleted emails reserved, so email updates must
                      still land on a unique live identity.
                    </FieldDescription>
                    <FieldError errors={[profileForm.formState.errors.email]} />
                  </Field>
                  <Field>
                    <Button
                      type="submit"
                      disabled={
                        updateProfileMutation.isPending ||
                        !profileForm.formState.isDirty
                      }
                    >
                      {updateProfileMutation.isPending
                        ? 'Saving profile...'
                        : 'Save profile'}
                    </Button>
                    {profileErrorMessage ? (
                      <FieldError>{profileErrorMessage}</FieldError>
                    ) : null}
                  </Field>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>

          <Card className="border border-border/70">
            <CardHeader className="gap-3">
              <div className="space-y-2">
                <CardTitle className="text-xl">Password</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Change your password through <code>/users/me/change-password</code>{' '}
                  without using the admin reset flow.
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-5"
                onSubmit={passwordForm.handleSubmit(async (values) => {
                  try {
                    await changePasswordMutation.mutateAsync({
                      current_password: values.currentPassword,
                      new_password: values.newPassword,
                    })

                    passwordForm.reset({
                      currentPassword: '',
                      newPassword: '',
                      confirmPassword: '',
                    })
                  } catch {
                    return
                  }
                })}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="account-current-password">
                      Current password
                    </FieldLabel>
                    <Input
                      id="account-current-password"
                      type="password"
                      autoComplete="current-password"
                      disabled={changePasswordMutation.isPending}
                      {...currentPasswordField}
                      onChange={(event) => {
                        if (changePasswordMutation.error) {
                          changePasswordMutation.reset()
                        }

                        currentPasswordField.onChange(event)
                      }}
                    />
                    <FieldError
                      errors={[passwordForm.formState.errors.currentPassword]}
                    />
                  </Field>
                  <FieldSeparator />
                  <Field>
                    <FieldLabel htmlFor="account-new-password">
                      New password
                    </FieldLabel>
                    <Input
                      id="account-new-password"
                      type="password"
                      autoComplete="new-password"
                      disabled={changePasswordMutation.isPending}
                      {...newPasswordField}
                      onChange={(event) => {
                        if (changePasswordMutation.error) {
                          changePasswordMutation.reset()
                        }

                        newPasswordField.onChange(event)
                      }}
                    />
                    <FieldError errors={[passwordForm.formState.errors.newPassword]} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="account-confirm-password">
                      Confirm password
                    </FieldLabel>
                    <Input
                      id="account-confirm-password"
                      type="password"
                      autoComplete="new-password"
                      disabled={changePasswordMutation.isPending}
                      {...confirmPasswordField}
                      onChange={(event) => {
                        if (changePasswordMutation.error) {
                          changePasswordMutation.reset()
                        }

                        confirmPasswordField.onChange(event)
                      }}
                    />
                    <FieldError
                      errors={[passwordForm.formState.errors.confirmPassword]}
                    />
                  </Field>
                  <Field>
                    <FieldDescription>
                      Successful password changes update the account audit trail and the
                      last password change timestamp shown in this workspace.
                    </FieldDescription>
                  </Field>
                  <Field>
                    <Button
                      type="submit"
                      disabled={
                        changePasswordMutation.isPending ||
                        !passwordForm.formState.isDirty
                      }
                    >
                      {changePasswordMutation.isPending
                        ? 'Updating password...'
                        : 'Update password'}
                    </Button>
                    {passwordErrorMessage ? (
                      <FieldError>{passwordErrorMessage}</FieldError>
                    ) : null}
                  </Field>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppPage>
  )
}
