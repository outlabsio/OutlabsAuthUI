<script setup lang="ts">
import { phoneNumberSchema } from '~/schemas/account'
import { cooldownLabel } from '~/utils/request-cooldown'

// Account › Profile — logic in useAccountProfile and useAccountPhone; display only.
const { overview, state, schema, dirty, saving, onSave, onReset } = useAccountProfile()
const {
  phone,
  verified,
  signInOffered,
  channelsText,
  defaultCountry,
  otpLength,
  dialogOpen,
  dialogError,
  dialogState,
  dialogDirty,
  openDialog,
  onSaveNumber,
  remove,
  step,
  digits,
  code,
  sending,
  confirming,
  sendCooldown,
  confirmCooldown,
  sendCode,
  onConfirm,
  onUseDifferentNumber
} = useAccountPhone()
</script>

<template>
  <!-- Overview: who this account is (F-102). -->
  <UPageCard v-if="overview">
    <template #title>
      <h2>Overview</h2>
    </template>
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <UUser
          :name="overview.name"
          :description="overview.subtitle"
          :avatar="{ alt: overview.name }"
          size="lg"
        />
        <div class="flex flex-wrap gap-1.5">
          <UBadge :color="overview.status.color" variant="subtle">
            {{ overview.status.label }}
          </UBadge>
          <UBadge :color="overview.emailVerified ? 'success' : 'warning'" variant="subtle">
            {{ overview.emailVerified ? 'Email verified' : 'Email not verified' }}
          </UBadge>
          <UBadge
            v-if="overview.superuser"
            color="neutral"
            variant="outline"
            icon="i-lucide-shield-check"
          >
            Superuser
          </UBadge>
        </div>
      </div>
      <p class="text-sm text-muted">
        {{ overview.email }} is your sign-in email. Contact an administrator to change it.
      </p>
      <UAlert
        v-if="overview.lockedUntil"
        color="error"
        variant="subtle"
        icon="i-lucide-lock"
        title="Your account is locked"
      >
        <template #description>
          New sign-ins are refused until <AppTimestamp :value="overview.lockedUntil" relative="never" />, after too many failed attempts.
        </template>
      </UAlert>
      <UAlert
        v-if="overview.suspendedUntil"
        color="warning"
        variant="subtle"
        icon="i-lucide-pause-circle"
        title="Your account is suspended"
      >
        <template #description>
          Until <AppTimestamp :value="overview.suspendedUntil" relative="never" />.
        </template>
      </UAlert>
      <USeparator />
      <AppDetailList :items="overview.items" />
    </div>
  </UPageCard>

  <!-- Names (F-095, F-096): only changed names are sent; Save waits for a change. -->
  <UPageCard description="How your name appears to administrators and in audit history.">
    <template #title>
      <h2>Profile</h2>
    </template>
    <UForm
      ref="profileForm"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="onSave"
      @error="focusFirstFormError"
    >
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <UFormField name="first_name" label="First name">
          <UInput v-model="state.first_name" autocomplete="given-name" class="w-full" />
        </UFormField>
        <UFormField name="last_name" label="Last name">
          <UInput v-model="state.last_name" autocomplete="family-name" class="w-full" />
        </UFormField>
      </div>
      <div class="flex justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          label="Reset"
          :disabled="!dirty || saving"
          @click="onReset"
        />
        <UButton
          type="submit"
          label="Save profile"
          :loading="saving"
          :disabled="!dirty"
        />
      </div>
    </UForm>
  </UPageCard>

  <!-- Phone number (F-099, F-100, F-101). -->
  <UPageCard
    :description="signInOffered
      ? `A verified number can receive sign-in codes by ${channelsText}.`
      : 'A contact number for your account.'"
  >
    <template #title>
      <h2>Phone number</h2>
    </template>
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <span v-if="phone" class="font-mono text-sm text-highlighted" data-testid="account-phone">{{ phone }}</span>
          <span v-else class="text-sm text-muted">No phone number.</span>
          <UBadge
            v-if="phone && signInOffered"
            :color="verified ? 'success' : 'neutral'"
            variant="subtle"
          >
            {{ verified ? 'Verified' : 'Not verified' }}
          </UBadge>
        </div>
        <div class="flex gap-2">
          <UButton
            v-if="phone"
            color="error"
            variant="ghost"
            label="Remove"
            :aria-label="`Remove phone number ${phone}`"
            @click="remove.ask(phone)"
          />
          <UButton
            color="neutral"
            variant="outline"
            :label="phone ? 'Change number' : 'Add phone number'"
            @click="openDialog"
          />
        </div>
      </div>

      <template v-if="phone && signInOffered && !verified">
        <USeparator />
        <div v-if="step === 'idle'" class="flex flex-col gap-3">
          <p class="text-sm text-muted">
            Verify {{ phone }} to sign in with codes sent by {{ channelsText }}.
          </p>
          <div>
            <UButton
              :label="cooldownLabel('Send verification code', sendCooldown)"
              :loading="sending"
              :disabled="sendCooldown > 0"
              @click="sendCode"
            />
          </div>
        </div>
        <div v-else class="flex flex-col gap-4">
          <p class="text-sm text-muted" role="status">
            We sent a {{ otpLength }}-digit code to {{ phone }}.
          </p>
          <div class="flex flex-col items-start gap-4">
            <UPinInput
              ref="phoneCodeInput"
              v-model="digits"
              :length="otpLength"
              type="number"
              otp
              autofocus
              size="lg"
              aria-label="Phone verification code"
              :disabled="confirming"
              @complete="onConfirm"
            />
            <UButton
              :label="cooldownLabel('Verify phone number', confirmCooldown)"
              :loading="confirming"
              :disabled="code.length < otpLength || confirmCooldown > 0"
              @click="onConfirm"
            />
          </div>
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <UButton
              variant="link"
              color="neutral"
              class="px-0"
              :loading="sending"
              :disabled="sending || sendCooldown > 0"
              :label="cooldownLabel('Resend code', sendCooldown)"
              @click="sendCode"
            />
            <UButton
              variant="link"
              color="neutral"
              class="px-0"
              label="Use a different number"
              @click="onUseDifferentNumber"
            />
          </div>
        </div>
      </template>
    </div>
  </UPageCard>

  <AppFormDialog
    ref="phoneDialog"
    v-model:open="dialogOpen"
    :title="phone ? 'Change phone number' : 'Add phone number'"
    :description="signInOffered ? 'The new number is verified with a code before it can be used to sign in.' : undefined"
    :schema="phoneNumberSchema"
    :state="dialogState"
    :dirty="dialogDirty"
    :error="dialogError"
    submit-label="Save number"
    @submit="onSaveNumber"
  >
    <UAlert
      v-if="phone && verified && signInOffered"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Your current number is verified"
      :description="`Saving a new number removes that verification: you can no longer sign in with codes sent to ${phone}, and the new number must be verified first.`"
    />
    <LazyAppAuthPhoneInput
      v-model="dialogState.identifier"
      v-model:country="dialogState.country"
      v-model:dial-code="dialogState.dialCode"
      :default-country="defaultCountry"
    />
  </AppFormDialog>

  <AppConfirmDialog v-model:open="remove.open" v-bind="remove.dialog" @confirm="remove.confirm" />
</template>
