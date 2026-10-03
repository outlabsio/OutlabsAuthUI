<script setup lang="ts">
import { cooldownLabel } from '~/utils/request-cooldown'

// Account — the actor's own settings, in tabs (dashboard template settings pattern, F-194):
// Profile, Security, Connected accounts (when available) and Access. Logic in useAccount; each
// tab is a child page. A notice a redirect landed with (phone recovery; a failed account link
// where there is no Connected accounts tab to show it) shows above every tab.
const {
  tabs,
  recoveryNotice,
  sendingResetLink,
  resetLinkCooldown,
  onSendResetLink,
  dismissRecovery,
  linkNotice,
  dismissLinkNotice
} = useAccount()
</script>

<template>
  <UDashboardPanel id="account" :ui="{ body: 'lg:py-12' }">
    <template #header>
      <UDashboardNavbar title="Account">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <!-- `-mx-1` aligns the first tab with the navbar, as in the dashboard template. -->
        <UNavigationMenu
          :items="tabs"
          highlight
          class="-mx-1 flex-1"
          aria-label="Account sections"
        />
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full flex-col gap-4 sm:gap-6 lg:max-w-2xl lg:gap-12">
        <!-- Landed here from phone-OTP recovery: say what happened to the reset link, first. -->
        <UAlert
          v-if="recoveryNotice"
          :color="recoveryNotice.color"
          variant="subtle"
          :icon="recoveryNotice.icon"
          title="You're signed in with a one-time code"
          :description="recoveryNotice.description"
          close
          :actions="recoveryNotice.canSend ? [{
            label: cooldownLabel('Send reset link', resetLinkCooldown),
            color: 'warning',
            variant: 'outline',
            loading: sendingResetLink,
            disabled: resetLinkCooldown > 0,
            onClick: onSendResetLink
          }] : undefined"
          @update:open="dismissRecovery"
        />

        <UAlert
          v-if="linkNotice"
          role="alert"
          color="error"
          variant="subtle"
          icon="i-lucide-link-2-off"
          :title="linkNotice.title"
          :description="linkNotice.description"
          close
          @update:open="dismissLinkNotice"
        />

        <NuxtPage />
      </div>
    </template>
  </UDashboardPanel>
</template>
