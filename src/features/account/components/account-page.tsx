import { useEffect } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'

import { AppErrorState } from '@/components/app/app-error-state'
import { AppLoadingState } from '@/components/app/app-loading-state'
import { AppPage } from '@/components/app/app-page'
import { AppSection } from '@/components/app/app-section'
import { AppStatusBadge } from '@/components/app/app-status-badge'
import { AppStatusCallout } from '@/components/app/app-status-callout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { getMySessionsQueryOptions } from '@/features/account/api/account.query-options'
import { useChangeCurrentUserPasswordMutation } from '@/features/account/hooks/use-change-current-user-password-mutation'
import { useConfirmPhoneVerificationMutation } from '@/features/account/hooks/use-confirm-phone-verification-mutation'
import { useRequestPhoneVerificationMutation } from '@/features/account/hooks/use-request-phone-verification-mutation'
import { useRevokeAllMySessionsMutation } from '@/features/account/hooks/use-revoke-all-my-sessions-mutation'
import { useRevokeMySessionMutation } from '@/features/account/hooks/use-revoke-my-session-mutation'
import { useUpdateCurrentUserMutation } from '@/features/account/hooks/use-update-current-user-mutation'
import { LinkedAccountsCard } from '@/features/account/components/linked-accounts-card'
import { UserSessionsPanel } from '@/features/users/components/user-sessions-panel'
import {
  changeAccountPasswordSchema,
  type ChangeAccountPasswordFormValues,
} from '@/features/account/schemas/change-account-password.schema'
import {
  updateAccountProfileSchema,
  type UpdateAccountProfileFormValues,
} from '@/features/account/schemas/update-account-profile.schema'
import {
  type VerifyPhoneFormValues,
  verifyPhoneSchema,
} from '@/features/account/schemas/verify-phone.schema'
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
  const sessionsQuery = useQuery(getMySessionsQueryOptions())
  const updateProfileMutation = useUpdateCurrentUserMutation()
  const changePasswordMutation = useChangeCurrentUserPasswordMutation()
  const requestPhoneVerificationMutation = useRequestPhoneVerificationMutation()
  const confirmPhoneVerificationMutation = useConfirmPhoneVerificationMutation()
  const revokeMySessionMutation = useRevokeMySessionMutation()
  const revokeAllMySessionsMutation = useRevokeAllMySessionsMutation()
  const profileForm = useForm<UpdateAccountProfileFormValues>({
    resolver: zodResolver(updateAccountProfileSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
    },
  })
  const verifyPhoneForm = useForm<VerifyPhoneFormValues>({
    resolver: zodResolver(verifyPhoneSchema),
    defaultValues: {
      code: '',
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
      phone: sessionUser.phone ?? '',
    })
  }, [profileForm, sessionUser])

  const profileErrorMessage = updateProfileMutation.error
    ? getApiErrorMessage(
        updateProfileMutation.error,
        'Your profile could not be updated.'
      )
    : null
  const requestPhoneErrorMessage = requestPhoneVerificationMutation.error
    ? getApiErrorMessage(
        requestPhoneVerificationMutation.error,
        'Unable to send a verification code.'
      )
    : null
  const confirmPhoneErrorMessage = confirmPhoneVerificationMutation.error
    ? getApiErrorMessage(
        confirmPhoneVerificationMutation.error,
        'Unable to verify this phone number.'
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
      <AppPage title="Account" hideTitle padded>
        <AppErrorState>
          {getApiErrorMessage(
            sessionQuery.error,
            'The current account session could not be loaded.'
          )}
        </AppErrorState>
      </AppPage>
    )
  }

  const firstNameField = profileForm.register('firstName')
  const lastNameField = profileForm.register('lastName')
  const emailField = profileForm.register('email')
  const phoneField = profileForm.register('phone')
  const phoneVerifyCodeField = verifyPhoneForm.register('code')
  const currentPasswordField = passwordForm.register('currentPassword')
  const newPasswordField = passwordForm.register('newPassword')
  const confirmPasswordField = passwordForm.register('confirmPassword')

  return (
    <AppPage title="Account" hideTitle padded>
      <div className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <AppSection
            title="Session snapshot"
            description="Reflects the current /users/me response that drives the app shell."
            contentClassName="space-y-5"
          >
            <div className="flex flex-wrap gap-2">
              <AppStatusBadge tone={getStatusTone(sessionUser.status)}>
                {formatStatusLabel(sessionUser.status)}
              </AppStatusBadge>
              <Badge variant={sessionUser.email_verified ? 'secondary' : 'outline'}>
                {sessionUser.email_verified ? 'Email verified' : 'Email unverified'}
              </Badge>
              {sessionUser.phone ? (
                <Badge variant={sessionUser.phone_verified ? 'secondary' : 'outline'}>
                  {sessionUser.phone_verified
                    ? 'WhatsApp phone verified'
                    : 'WhatsApp phone unverified'}
                </Badge>
              ) : null}
              {sessionUser.is_superuser ? (
                <Badge variant="outline">Superuser</Badge>
              ) : null}
            </div>

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
          </AppSection>

          <div className="grid gap-4">
            <AppSection
              title="Self-service profile"
              description="Update the same identity fields available through PATCH /users/me."
            >
              <form
                className="space-y-5"
                onSubmit={profileForm.handleSubmit(async (values) => {
                  try {
                    const updatedUser = await updateProfileMutation.mutateAsync({
                      email: values.email,
                      first_name: values.firstName,
                      last_name: values.lastName,
                      phone: values.phone.trim() ? values.phone.trim() : null,
                    })

                    profileForm.reset({
                      firstName: updatedUser.first_name ?? '',
                      lastName: updatedUser.last_name ?? '',
                      email: updatedUser.email,
                      phone: updatedUser.phone ?? '',
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
                    <FieldLabel htmlFor="account-phone">WhatsApp phone</FieldLabel>
                    <Input
                      id="account-phone"
                      type="tel"
                      autoComplete="tel"
                      placeholder="+15551234567"
                      disabled={updateProfileMutation.isPending}
                      {...phoneField}
                      onChange={(event) => {
                        if (updateProfileMutation.error) {
                          updateProfileMutation.reset()
                        }

                        phoneField.onChange(event)
                      }}
                    />
                    <FieldDescription>
                      Optional E.164 number used as a delivery destination for
                      access codes. Changing it clears phone verification until you
                      confirm a new code.
                    </FieldDescription>
                    <FieldError errors={[profileForm.formState.errors.phone]} />
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

              {sessionUser.phone && !sessionUser.phone_verified ? (
                <form
                  className="mt-6 space-y-4 border-t border-border/60 pt-5"
                  onSubmit={verifyPhoneForm.handleSubmit(async (values) => {
                    try {
                      await confirmPhoneVerificationMutation.mutateAsync({
                        code: values.code.trim(),
                      })
                      verifyPhoneForm.reset({ code: '' })
                    } catch {
                      return
                    }
                  })}
                >
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium">Verify WhatsApp phone</h3>
                    <p className="text-sm text-muted-foreground">
                      Send a one-time code to {sessionUser.phone}, then enter it
                      below to mark the number verified for WhatsApp delivery.
                    </p>
                  </div>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="account-phone-verify-code">
                        Verification code
                      </FieldLabel>
                      <Input
                        id="account-phone-verify-code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        disabled={confirmPhoneVerificationMutation.isPending}
                        {...phoneVerifyCodeField}
                        onChange={(event) => {
                          if (confirmPhoneVerificationMutation.error) {
                            confirmPhoneVerificationMutation.reset()
                          }
                          phoneVerifyCodeField.onChange(event)
                        }}
                      />
                      <FieldError
                        errors={[verifyPhoneForm.formState.errors.code]}
                      />
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={
                          requestPhoneVerificationMutation.isPending ||
                          confirmPhoneVerificationMutation.isPending ||
                          profileForm.formState.isDirty
                        }
                        onClick={() => {
                          requestPhoneVerificationMutation.reset()
                          void requestPhoneVerificationMutation.mutateAsync()
                        }}
                      >
                        {requestPhoneVerificationMutation.isPending
                          ? 'Sending code...'
                          : 'Send verification code'}
                      </Button>
                      <Button
                        type="submit"
                        disabled={
                          confirmPhoneVerificationMutation.isPending ||
                          requestPhoneVerificationMutation.isPending ||
                          profileForm.formState.isDirty
                        }
                      >
                        {confirmPhoneVerificationMutation.isPending
                          ? 'Verifying...'
                          : 'Verify phone'}
                      </Button>
                    </div>
                    {profileForm.formState.isDirty ? (
                      <FieldDescription>
                        Save your profile before requesting a verification code.
                      </FieldDescription>
                    ) : null}
                    {requestPhoneErrorMessage ? (
                      <FieldError>{requestPhoneErrorMessage}</FieldError>
                    ) : null}
                    {confirmPhoneErrorMessage ? (
                      <FieldError>{confirmPhoneErrorMessage}</FieldError>
                    ) : null}
                  </FieldGroup>
                </form>
              ) : null}
            </AppSection>

            <AppSection
              title="Password"
              description="Change your password through /users/me/change-password without using the admin reset flow."
            >
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
            </AppSection>
          </div>
        </div>

        <div className="grid gap-4">
          <UserSessionsPanel
            title="Active sessions"
            description="Sign out other devices by revoking their refresh-token sessions. Revoking all sessions will also end this browser session after the next refresh."
            canRevoke
            sessionsQuery={sessionsQuery}
            isRevokingSession={revokeMySessionMutation.isPending}
            isRevokingAll={revokeAllMySessionsMutation.isPending}
            revokingSessionId={revokeMySessionMutation.variables ?? null}
            onRevokeSession={async (sessionId) => {
              await revokeMySessionMutation.mutateAsync(sessionId)
            }}
            onRevokeAll={async () => {
              await revokeAllMySessionsMutation.mutateAsync()
            }}
          />
          <LinkedAccountsCard />
        </div>
      </div>
    </AppPage>
  )
}
