<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { changePasswordSchema, updateProfileSchema } from '~/schemas/account'
import type { UserSession } from '~/types/account'

// Account — logic in useAccount; this file is display only.
const {
  user,
  profileState,
  savingProfile,
  onSaveProfile,
  passwordState,
  changingPassword,
  onChangePassword,
  sessionRows,
  sessionsStatus,
  onRevokeSession,
  onRevokeAll
} = useAccount()

// --- Pure display config ---
const sessionColumns: TableColumn<UserSession>[] = [
  { accessorKey: 'device_name', header: 'Device' },
  { accessorKey: 'ip_address', header: 'IP address' },
  { accessorKey: 'last_used_at', header: 'Last used' },
  { id: 'actions', header: '' }
]
</script>

<template>
  <UDashboardPanel id="account">
    <template #header>
      <UDashboardNavbar title="Account">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-2xl space-y-6">
        <!-- Profile -->
        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">
              Profile
            </h2>
          </template>
          <UForm
            :schema="updateProfileSchema"
            :state="profileState"
            class="space-y-4"
            @submit="onSaveProfile"
          >
            <UFormField label="Email">
              <UInput :model-value="user?.email" disabled class="w-full" />
            </UFormField>
            <div class="grid grid-cols-2 gap-3">
              <UFormField name="first_name" label="First name">
                <UInput v-model="profileState.first_name" class="w-full" />
              </UFormField>
              <UFormField name="last_name" label="Last name">
                <UInput v-model="profileState.last_name" class="w-full" />
              </UFormField>
            </div>
            <UFormField name="phone" label="Phone" description="E.164 format, e.g. +15551234567.">
              <UInput v-model="profileState.phone" class="w-full" placeholder="+15551234567" />
            </UFormField>
            <div class="flex justify-end">
              <UButton type="submit" label="Save profile" :loading="savingProfile" />
            </div>
          </UForm>
        </UCard>

        <!-- Password -->
        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">
              Change password
            </h2>
          </template>
          <UForm
            :schema="changePasswordSchema"
            :state="passwordState"
            class="space-y-4"
            @submit="onChangePassword"
          >
            <UFormField name="current_password" label="Current password" required>
              <UInput
                v-model="passwordState.current_password"
                type="password"
                autocomplete="current-password"
                class="w-full"
              />
            </UFormField>
            <UFormField name="new_password" label="New password" required>
              <UInput
                v-model="passwordState.new_password"
                type="password"
                autocomplete="new-password"
                class="w-full"
              />
            </UFormField>
            <UFormField name="confirm_password" label="Confirm new password" required>
              <UInput
                v-model="passwordState.confirm_password"
                type="password"
                autocomplete="new-password"
                class="w-full"
              />
            </UFormField>
            <div class="flex justify-end">
              <UButton type="submit" label="Change password" :loading="changingPassword" />
            </div>
          </UForm>
        </UCard>

        <!-- Sessions -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="font-semibold text-highlighted">
                Active sessions
              </h2>
              <UButton
                color="error"
                variant="ghost"
                size="sm"
                label="Revoke all others"
                @click="onRevokeAll"
              />
            </div>
          </template>
          <UTable :data="sessionRows" :columns="sessionColumns" :loading="sessionsStatus === 'pending'">
            <template #last_used_at-cell="{ row }">
              {{ row.original.last_used_at ?? '—' }}
            </template>
            <template #actions-cell="{ row }">
              <UButton
                color="error"
                variant="ghost"
                size="xs"
                icon="i-lucide-x"
                aria-label="Revoke session"
                @click="onRevokeSession(row.original.id)"
              />
            </template>
          </UTable>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
