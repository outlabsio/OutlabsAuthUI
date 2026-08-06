<script setup lang="ts">
import { useQuery, useQueryCache } from '@pinia/colada'
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'
import {
  mySessionsQuery,
  useChangePassword,
  useRevokeAllSessions,
  useRevokeSession,
  useUpdateProfile
} from '~/queries/account'
import { SESSION_KEY } from '~/queries/session'
import {
  changePasswordSchema,
  type ChangePasswordSchema,
  updateProfileSchema,
  type UpdateProfileSchema
} from '~/schemas/account'
import { getApiErrorMessage } from '~/utils/api'
import type { UserSession } from '~/types/account'

// P2 account vertical — the actor's own profile, password, and active sessions.
const { user } = useAuth()
const queryCache = useQueryCache()
const toast = useToast()

// --- Profile ---
const profileState = reactive<UpdateProfileSchema>({ first_name: '', last_name: '', phone: '' })
watchEffect(() => {
  if (user.value) {
    profileState.first_name = user.value.first_name ?? ''
    profileState.last_name = user.value.last_name ?? ''
    profileState.phone = user.value.phone ?? ''
  }
})
const updateProfile = useUpdateProfile()
const savingProfile = ref(false)
async function onSaveProfile(event: FormSubmitEvent<UpdateProfileSchema>) {
  savingProfile.value = true
  try {
    const updated = await updateProfile.mutateAsync({
      first_name: event.data.first_name,
      last_name: event.data.last_name,
      phone: event.data.phone === '' ? null : event.data.phone
    })
    queryCache.setQueryData(SESSION_KEY, updated)
    toast.add({ title: 'Profile updated', color: 'success', icon: 'i-lucide-check' })
  } catch (err) {
    toast.add({ title: 'Could not update profile', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    savingProfile.value = false
  }
}

// --- Password ---
const passwordState = reactive<ChangePasswordSchema>({ current_password: '', new_password: '', confirm_password: '' })
const changePassword = useChangePassword()
const changingPassword = ref(false)
async function onChangePassword(event: FormSubmitEvent<ChangePasswordSchema>) {
  changingPassword.value = true
  try {
    await changePassword.mutateAsync({
      current_password: event.data.current_password,
      new_password: event.data.new_password
    })
    toast.add({ title: 'Password changed', color: 'success', icon: 'i-lucide-check' })
    Object.assign(passwordState, { current_password: '', new_password: '', confirm_password: '' })
  } catch (err) {
    toast.add({ title: 'Could not change password', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    changingPassword.value = false
  }
}

// --- Sessions ---
const { data: sessions, status: sessionsStatus } = useQuery(mySessionsQuery)
const sessionRows = computed<UserSession[]>(() => sessions.value ?? [])
const revokeSession = useRevokeSession()
const revokeAll = useRevokeAllSessions()

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
                @click="revokeAll.mutate()"
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
                @click="revokeSession.mutate(row.original.id)"
              />
            </template>
          </UTable>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
