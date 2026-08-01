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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { getAuthConfigQueryOptions } from '@/features/auth/api/auth.query-options'
import { AuthCard } from '@/features/auth/components/auth-card'
import { AuthRequestCooldownNote } from '@/features/auth/components/auth-request-cooldown-note'
import { AuthStatusCard } from '@/features/auth/components/auth-status-card'
import { useRequestAccessCodeMutation } from '@/features/auth/hooks/use-request-access-code-mutation'
import { useVerifyAccessCodeMutation } from '@/features/auth/hooks/use-verify-access-code-mutation'
import {
  type AccessCodeChannel,
  type AccessCodeRequestFormValues,
  type AccessCodeVerifyFormValues,
  accessCodeRequestSchema,
  accessCodeVerifySchema,
} from '@/features/auth/schemas/access-code.schema'
import type {
  AccessCodeRequestInput,
  AccessCodeVerifyInput,
} from '@/features/auth/types/auth.types'
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

function buildAccessCodeRequestInput(
  values: AccessCodeRequestFormValues,
  redirect?: string
): AccessCodeRequestInput {
  if (values.channel === 'whatsapp' || values.channel === 'sms') {
    return {
      phone: values.phone,
      channel: values.channel,
      redirect_url: buildRedirectUrl(redirect),
    }
  }

  return {
    email: values.email,
    channel: 'email',
    redirect_url: buildRedirectUrl(redirect),
  }
}

function buildAccessCodeVerifyInput(
  values: AccessCodeVerifyFormValues
): AccessCodeVerifyInput {
  if (values.channel === 'whatsapp' || values.channel === 'sms') {
    return {
      phone: values.phone,
      channel: values.channel,
      code: values.code,
    }
  }

  return {
    email: values.email,
    channel: 'email',
    code: values.code,
  }
}

function getIdentifierLabel(channel: AccessCodeChannel) {
  if (channel === 'whatsapp') {
    return 'WhatsApp number'
  }
  if (channel === 'sms') {
    return 'SMS number'
  }
  return 'email address'
}

function getFieldError(
  errors: Record<string, unknown>,
  name: string
) {
  const error = errors[name]
  return error && typeof error === 'object' ? error : undefined
}

export function AccessCodePage() {
  const { mode, redirect } = useSearch({
    from: '/auth/access-code',
  })
  const authConfigQuery = useQuery(getAuthConfigQueryOptions())
  const requestAccessCodeMutation = useRequestAccessCodeMutation()
  const verifyAccessCodeMutation = useVerifyAccessCodeMutation()
  const [channel, setChannel] = useState<AccessCodeChannel>('email')
  const [requestedIdentifier, setRequestedIdentifier] = useState<string | null>(
    null
  )
  const [isEnteringCode, setIsEnteringCode] = useState(mode === 'verify')
  const requestForm = useForm<AccessCodeRequestFormValues>({
    resolver: zodResolver(accessCodeRequestSchema),
    defaultValues: {
      channel: 'email',
      email: '',
    },
  })
  const verifyForm = useForm<AccessCodeVerifyFormValues>({
    resolver: zodResolver(accessCodeVerifySchema),
    defaultValues: {
      channel: 'email',
      email: '',
      code: '',
    },
  })
  const requestEmailField = requestForm.register('email')
  const requestPhoneField = requestForm.register('phone')
  const verifyEmailField = verifyForm.register('email')
  const verifyPhoneField = verifyForm.register('phone')
  const requestEmailValue = useWatch({
    control: requestForm.control,
    name: 'email',
  })
  const requestPhoneValue = useWatch({
    control: requestForm.control,
    name: 'phone',
  })
  const verifyEmailValue = useWatch({
    control: verifyForm.control,
    name: 'email',
  })
  const verifyPhoneValue = useWatch({
    control: verifyForm.control,
    name: 'phone',
  })
  const activeIdentifier =
    requestedIdentifier ||
    (channel === 'email'
      ? (verifyEmailValue ?? requestEmailValue)
      : (verifyPhoneValue ?? requestPhoneValue))
  const cooldown = useAuthRequestCooldown({
    identifier: activeIdentifier,
    kind: 'access-code',
  })

  const accessCodeEnabled =
    authConfigQuery.data?.auth_methods?.access_code ??
    authConfigQuery.data?.features.access_codes ??
    true

  const requestSubmitError = requestAccessCodeMutation.error
    ? getApiErrorMessage(
        requestAccessCodeMutation.error,
        channel === 'sms'
          ? 'SMS sign-in is not configured on this backend yet.'
          : 'Unable to request an access code.'
      )
    : null

  const verifySubmitError = verifyAccessCodeMutation.error
    ? getAuthErrorMessage(
        verifyAccessCodeMutation.error,
        'This access code is invalid or has expired.'
      )
    : null

  function switchChannel(nextChannel: AccessCodeChannel) {
    if (nextChannel === channel) {
      return
    }

    setChannel(nextChannel)
    setRequestedIdentifier(null)
    requestAccessCodeMutation.reset()
    verifyAccessCodeMutation.reset()

    if (nextChannel === 'email') {
      requestForm.reset({ channel: 'email', email: '' })
      verifyForm.reset({ channel: 'email', email: '', code: '' })
      return
    }

    requestForm.reset({ channel: nextChannel, phone: '' })
    verifyForm.reset({ channel: nextChannel, phone: '', code: '' })
  }

  async function requestCode(values: AccessCodeRequestFormValues) {
    if (cooldown.isCoolingDown) {
      return
    }

    const identifier =
      values.channel === 'email' ? values.email : values.phone

    try {
      await requestAccessCodeMutation.mutateAsync(
        buildAccessCodeRequestInput(values, redirect)
      )
      setChannel(values.channel)
      setRequestedIdentifier(identifier)
      setIsEnteringCode(true)
      if (values.channel === 'email') {
        verifyForm.reset({
          channel: 'email',
          email: values.email,
          code: '',
        })
      } else {
        verifyForm.reset({
          channel: values.channel,
          phone: values.phone,
          code: '',
        })
      }
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
        description="This workspace is not accepting sign-in codes right now."
        actions={
          <Button nativeButton={false} render={<Link to={routes.auth.login} />}>
            Back to sign in
          </Button>
        }
      />
    )
  }

  if (isEnteringCode) {
    const lockedIdentifier = requestedIdentifier != null
    const verificationIdentifier = requestedIdentifier ?? activeIdentifier
    const canResendCode = Boolean(verificationIdentifier)

    return (
      <form
        className="w-[calc(100vw-2rem)] min-w-0 max-w-[23.5rem]"
        onSubmit={verifyForm.handleSubmit(async (values) => {
          try {
            await verifyAccessCodeMutation.mutateAsync(
              buildAccessCodeVerifyInput(values)
            )
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
              {verificationIdentifier
                ? `Enter the verification code we sent to your ${getIdentifierLabel(channel)}: `
                : `Enter your ${getIdentifierLabel(channel)} and the verification code we sent you.`}
              {verificationIdentifier ? (
                <span className="font-medium">{verificationIdentifier}</span>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              {!lockedIdentifier ? (
                channel === 'email' ? (
                  <Field>
                    <FieldLabel htmlFor="access-code-verify-email">
                      Email address
                    </FieldLabel>
                    <Input
                      id="access-code-verify-email"
                      type="email"
                      autoComplete="email"
                      aria-invalid={Boolean(
                        getFieldError(
                          verifyForm.formState.errors as Record<string, unknown>,
                          'email'
                        )
                      )}
                      disabled={verifyAccessCodeMutation.isPending}
                      {...verifyEmailField}
                      onChange={(event) => {
                        if (verifyAccessCodeMutation.error) {
                          verifyAccessCodeMutation.reset()
                        }

                        verifyEmailField.onChange(event)
                      }}
                    />
                    <FieldError
                      errors={[
                        getFieldError(
                          verifyForm.formState.errors as Record<string, unknown>,
                          'email'
                        ),
                      ]}
                    />
                  </Field>
                ) : (
                  <Field>
                    <FieldLabel htmlFor="access-code-verify-phone">
                      {channel === 'sms' ? 'SMS number' : 'WhatsApp number'}
                    </FieldLabel>
                    <Input
                      id="access-code-verify-phone"
                      type="tel"
                      autoComplete="tel"
                      inputMode="tel"
                      placeholder="+15551234567"
                      aria-invalid={Boolean(
                        getFieldError(
                          verifyForm.formState.errors as Record<string, unknown>,
                          'phone'
                        )
                      )}
                      disabled={verifyAccessCodeMutation.isPending}
                      {...verifyPhoneField}
                      onChange={(event) => {
                        if (verifyAccessCodeMutation.error) {
                          verifyAccessCodeMutation.reset()
                        }

                        verifyPhoneField.onChange(event)
                      }}
                    />
                    <FieldError
                      errors={[
                        getFieldError(
                          verifyForm.formState.errors as Record<string, unknown>,
                          'phone'
                        ),
                      ]}
                    />
                  </Field>
                )
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
                      if (!verificationIdentifier) {
                        return
                      }

                      if (channel === 'email') {
                        void requestCode({
                          channel: 'email',
                          email: verificationIdentifier,
                        })
                      } else {
                        void requestCode({
                          channel,
                          phone: verificationIdentifier,
                        })
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
      title="Sign-in code"
      description="Choose email, WhatsApp, or SMS. We send a one-time code if the account exists and the number is verified. SMS requires a configured SMS host."
      footer={
        <div className="text-sm text-muted-foreground">
          Already have a code?{' '}
          <button
            type="button"
            className="underline underline-offset-4 transition-colors hover:text-primary"
            onClick={() => {
              setRequestedIdentifier(null)
              setIsEnteringCode(true)
              requestAccessCodeMutation.reset()
              verifyAccessCodeMutation.reset()
              if (channel === 'email') {
                verifyForm.reset({
                  channel: 'email',
                  email: requestEmailValue ?? '',
                  code: '',
                })
              } else {
                verifyForm.reset({
                  channel,
                  phone: requestPhoneValue ?? '',
                  code: '',
                })
              }
            }}
          >
            Enter it here
          </button>
        </div>
      }
    >
      <form
        onSubmit={requestForm.handleSubmit(async (values) => {
          await requestCode(values)
        })}
      >
        <FieldGroup>
          <Field>
            <FieldLabel>Send code via</FieldLabel>
            <ToggleGroup
              aria-label="Access code channel"
              className="w-full"
              variant="outline"
              value={[channel]}
              onValueChange={(nextValue) => {
                const [selected] = nextValue

                if (
                  selected === 'email' ||
                  selected === 'whatsapp' ||
                  selected === 'sms'
                ) {
                  switchChannel(selected)
                }
              }}
            >
              <ToggleGroupItem className="flex-1" value="email">
                Email
              </ToggleGroupItem>
              <ToggleGroupItem className="flex-1" value="whatsapp">
                WhatsApp
              </ToggleGroupItem>
              <ToggleGroupItem className="flex-1" value="sms">
                SMS
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>
          {channel === 'email' ? (
            <Field>
              <FieldLabel htmlFor="access-code-email">Email</FieldLabel>
              <Input
                id="access-code-email"
                type="email"
                autoComplete="email"
                aria-invalid={Boolean(
                  getFieldError(
                    requestForm.formState.errors as Record<string, unknown>,
                    'email'
                  )
                )}
                disabled={requestAccessCodeMutation.isPending}
                {...requestEmailField}
                onChange={(event) => {
                  if (requestAccessCodeMutation.error) {
                    requestAccessCodeMutation.reset()
                  }

                  requestEmailField.onChange(event)
                }}
              />
              <FieldError
                errors={[
                  getFieldError(
                    requestForm.formState.errors as Record<string, unknown>,
                    'email'
                  ),
                ]}
              />
            </Field>
          ) : (
            <Field>
              <FieldLabel htmlFor="access-code-phone">
                {channel === 'sms' ? 'SMS number' : 'WhatsApp number'}
              </FieldLabel>
              <Input
                id="access-code-phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                placeholder="+15551234567"
                aria-invalid={Boolean(
                  getFieldError(
                    requestForm.formState.errors as Record<string, unknown>,
                    'phone'
                  )
                )}
                disabled={requestAccessCodeMutation.isPending}
                {...requestPhoneField}
                onChange={(event) => {
                  if (requestAccessCodeMutation.error) {
                    requestAccessCodeMutation.reset()
                  }

                  requestPhoneField.onChange(event)
                }}
              />
              <FieldDescription>
                {channel === 'sms'
                  ? 'SMS delivery depends on host configuration. Use the verified E.164 number on your account.'
                  : 'Use the verified E.164 number on your account.'}
              </FieldDescription>
              <FieldError
                errors={[
                  getFieldError(
                    requestForm.formState.errors as Record<string, unknown>,
                    'phone'
                  ),
                ]}
              />
            </Field>
          )}
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
