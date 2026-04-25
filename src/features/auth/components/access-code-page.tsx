import { useState } from 'react'

import { Link, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { REGEXP_ONLY_DIGITS } from 'input-otp'
import { RefreshCwIcon } from 'lucide-react'
import { Controller, useForm, useWatch } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@/components/ui/input-otp'
import { getAuthConfigQueryOptions } from '@/features/auth/api/auth.query-options'
import { AuthCard } from '@/features/auth/components/auth-card'
import { AuthRequestCooldownNote } from '@/features/auth/components/auth-request-cooldown-note'
import { AuthStatusCard } from '@/features/auth/components/auth-status-card'
import { useRequestAccessCodeMutation } from '@/features/auth/hooks/use-request-access-code-mutation'
import { useVerifyAccessCodeMutation } from '@/features/auth/hooks/use-verify-access-code-mutation'
import {
  type AccessCodeRequestFormValues,
  type AccessCodeVerifyFormValues,
  accessCodeRequestSchema,
  accessCodeVerifySchema,
} from '@/features/auth/schemas/access-code.schema'
import { getAuthErrorMessage } from '@/features/auth/utils/auth-error-message'
import {
  formatCooldown,
  getRetryAfterSeconds,
  useAuthRequestCooldown,
} from '@/features/auth/utils/auth-request-cooldown'
import { getApiErrorMessage } from '@/lib/api/errors'
import { routes } from '@/lib/constants/routes'

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

function buildRedirectUrl(redirect?: string) {
  if (typeof window === 'undefined') {
    return null
  }

  return `${window.location.origin}${getSafeRedirectTarget(redirect)}`
}

export function AccessCodePage() {
  const { mode, redirect } = useSearch({
    from: '/auth/access-code',
  })
  const authConfigQuery = useQuery(getAuthConfigQueryOptions())
  const requestAccessCodeMutation = useRequestAccessCodeMutation()
  const verifyAccessCodeMutation = useVerifyAccessCodeMutation()
  const [requestedEmail, setRequestedEmail] = useState<string | null>(null)
  const [isEnteringCode, setIsEnteringCode] = useState(mode === 'verify')
  const requestForm = useForm<AccessCodeRequestFormValues>({
    resolver: zodResolver(accessCodeRequestSchema),
    defaultValues: {
      email: '',
    },
  })
  const verifyForm = useForm<AccessCodeVerifyFormValues>({
    resolver: zodResolver(accessCodeVerifySchema),
    defaultValues: {
      email: '',
      code: '',
    },
  })
  const requestEmailField = requestForm.register('email')
  const verifyEmailField = verifyForm.register('email')
  const requestEmailValue = useWatch({
    control: requestForm.control,
    name: 'email',
  })
  const verifyEmailValue = useWatch({
    control: verifyForm.control,
    name: 'email',
  })
  const cooldown = useAuthRequestCooldown({
    email: requestedEmail || verifyEmailValue || requestEmailValue,
    kind: 'access-code',
  })

  const accessCodeEnabled =
    authConfigQuery.data?.auth_methods?.access_code ??
    authConfigQuery.data?.features.access_codes ??
    true

  const requestSubmitError = requestAccessCodeMutation.error
    ? getApiErrorMessage(
        requestAccessCodeMutation.error,
        'Unable to request an access code.'
      )
    : null

  const verifySubmitError = verifyAccessCodeMutation.error
    ? getAuthErrorMessage(
        verifyAccessCodeMutation.error,
        'This access code is invalid or has expired.'
      )
    : null

  async function requestCode(email: string) {
    if (cooldown.isCoolingDown) {
      return
    }

    try {
      await requestAccessCodeMutation.mutateAsync({
        email,
        redirect_url: buildRedirectUrl(redirect),
      })
      setRequestedEmail(email)
      setIsEnteringCode(true)
      verifyForm.reset({
        email,
        code: '',
      })
      cooldown.startCooldown()
    } catch (error) {
      const retryAfterSeconds = getRetryAfterSeconds(error)

      if (retryAfterSeconds != null) {
        cooldown.startCooldown(retryAfterSeconds)
      }
    }
  }

  if (!accessCodeEnabled && authConfigQuery.isSuccess) {
    return (
      <AuthStatusCard
        title="Access codes unavailable"
        description="This workspace is not accepting email code sign-ins right now."
        actions={
          <Button nativeButton={false} render={<Link to={routes.auth.login} />}>
            Back to sign in
          </Button>
        }
      />
    )
  }

  if (isEnteringCode) {
    const lockedEmail = requestedEmail != null
    const verificationEmail = requestedEmail ?? verifyEmailValue
    const canResendCode = Boolean(verificationEmail)

    return (
      <form
        className="w-[calc(100vw-2rem)] min-w-0 max-w-[23.5rem]"
        onSubmit={verifyForm.handleSubmit(async (values) => {
          try {
            await verifyAccessCodeMutation.mutateAsync({
              email: requestedEmail ?? values.email,
              code: values.code,
            })
            window.location.assign(getSafeRedirectTarget(redirect))
          } catch {
            return
          }
        })}
      >
        <Card className="mx-auto w-full max-w-[23.5rem]">
          <CardHeader>
            <CardTitle>Verify your login</CardTitle>
            <CardDescription>
              {verificationEmail
                ? 'Enter the verification code we sent to your email address: '
                : 'Enter your email address and the verification code we sent you.'}
              {verificationEmail ? (
                <span className="font-medium">{verificationEmail}</span>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              {!lockedEmail ? (
                <Field>
                  <FieldLabel htmlFor="access-code-verify-email">
                    Email address
                  </FieldLabel>
                  <Input
                    id="access-code-verify-email"
                    type="email"
                    autoComplete="email"
                    aria-invalid={Boolean(verifyForm.formState.errors.email)}
                    disabled={verifyAccessCodeMutation.isPending}
                    {...verifyEmailField}
                    onChange={(event) => {
                      if (verifyAccessCodeMutation.error) {
                        verifyAccessCodeMutation.reset()
                      }

                      verifyEmailField.onChange(event)
                    }}
                  />
                  <FieldError errors={[verifyForm.formState.errors.email]} />
                </Field>
              ) : null}
              <Field>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="access-code-code">
                    Verification code
                  </FieldLabel>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={
                      !canResendCode ||
                      requestAccessCodeMutation.isPending ||
                      cooldown.isCoolingDown
                    }
                    onClick={() => {
                      if (verificationEmail) {
                        void requestCode(verificationEmail)
                      }
                    }}
                  >
                    <RefreshCwIcon />
                    {cooldown.isCoolingDown
                      ? formatCooldown(cooldown.secondsRemaining)
                      : 'Resend Code'}
                  </Button>
                </div>
                <Controller
                  control={verifyForm.control}
                  name="code"
                  render={({ field }) => (
                    <InputOTP
                      id="access-code-code"
                      aria-label="Verification code"
                      aria-invalid={Boolean(verifyForm.formState.errors.code)}
                      autoComplete="one-time-code"
                      disabled={verifyAccessCodeMutation.isPending}
                      inputMode="numeric"
                      maxLength={6}
                      pattern={REGEXP_ONLY_DIGITS}
                      required
                      value={field.value}
                      onBlur={field.onBlur}
                      onChange={(value) => {
                        if (verifyAccessCodeMutation.error) {
                          verifyAccessCodeMutation.reset()
                        }

                        field.onChange(value)
                      }}
                    >
                      <InputOTPGroup className="*:data-[slot=input-otp-slot]:h-12 *:data-[slot=input-otp-slot]:w-11 *:data-[slot=input-otp-slot]:text-xl">
                        <InputOTPSlot
                          aria-invalid={Boolean(
                            verifyForm.formState.errors.code
                          )}
                          index={0}
                        />
                        <InputOTPSlot
                          aria-invalid={Boolean(
                            verifyForm.formState.errors.code
                          )}
                          index={1}
                        />
                        <InputOTPSlot
                          aria-invalid={Boolean(
                            verifyForm.formState.errors.code
                          )}
                          index={2}
                        />
                      </InputOTPGroup>
                      <InputOTPSeparator className="mx-2" />
                      <InputOTPGroup className="*:data-[slot=input-otp-slot]:h-12 *:data-[slot=input-otp-slot]:w-11 *:data-[slot=input-otp-slot]:text-xl">
                        <InputOTPSlot
                          aria-invalid={Boolean(
                            verifyForm.formState.errors.code
                          )}
                          index={3}
                        />
                        <InputOTPSlot
                          aria-invalid={Boolean(
                            verifyForm.formState.errors.code
                          )}
                          index={4}
                        />
                        <InputOTPSlot
                          aria-invalid={Boolean(
                            verifyForm.formState.errors.code
                          )}
                          index={5}
                        />
                      </InputOTPGroup>
                    </InputOTP>
                  )}
                />
                <FieldError errors={[verifyForm.formState.errors.code]} />
                <FieldDescription>
                  <Link to={routes.auth.accessCode}>Need a new code?</Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <Field>
              <Button
                type="submit"
                className="w-full"
                disabled={verifyAccessCodeMutation.isPending}
              >
                {verifyAccessCodeMutation.isPending ? 'Verifying...' : 'Verify'}
              </Button>
              {verifySubmitError ? (
                <FieldError>{verifySubmitError}</FieldError>
              ) : null}
              <div className="text-sm text-muted-foreground">
                Having trouble signing in?{' '}
                <Link
                  to={routes.auth.login}
                  className="underline underline-offset-4 transition-colors hover:text-primary"
                >
                  Back to sign in
                </Link>
              </div>
            </Field>
          </CardFooter>
        </Card>
      </form>
    )
  }

  return (
    <AuthCard
      title="Email sign-in code"
      description="Enter your email and we will send a one-time code if the account exists."
      footer={
        <div className="text-sm text-muted-foreground">
          Already have a code?{' '}
          <button
            type="button"
            className="underline underline-offset-4 transition-colors hover:text-primary"
            onClick={() => {
              setRequestedEmail(null)
              setIsEnteringCode(true)
              requestAccessCodeMutation.reset()
              verifyAccessCodeMutation.reset()
              verifyForm.reset({
                email: requestEmailValue ?? '',
                code: '',
              })
            }}
          >
            Enter it here
          </button>
        </div>
      }
    >
      <form
        onSubmit={requestForm.handleSubmit(async (values) => {
          await requestCode(values.email)
        })}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="access-code-email">Email</FieldLabel>
            <Input
              id="access-code-email"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(requestForm.formState.errors.email)}
              disabled={requestAccessCodeMutation.isPending}
              {...requestEmailField}
              onChange={(event) => {
                if (requestAccessCodeMutation.error) {
                  requestAccessCodeMutation.reset()
                }

                requestEmailField.onChange(event)
              }}
            />
            <FieldError errors={[requestForm.formState.errors.email]} />
          </Field>
          <Field>
            <Button
              type="submit"
              disabled={
                requestAccessCodeMutation.isPending || cooldown.isCoolingDown
              }
            >
              {cooldown.isCoolingDown
                ? `Send again in ${formatCooldown(cooldown.secondsRemaining)}`
                : requestAccessCodeMutation.isPending
                  ? 'Sending code...'
                  : 'Send sign-in code'}
            </Button>
            <AuthRequestCooldownNote
              actionLabel="You can request another sign-in code"
              progressPercent={cooldown.progressPercent}
              secondsRemaining={cooldown.secondsRemaining}
            />
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
    </AuthCard>
  )
}
