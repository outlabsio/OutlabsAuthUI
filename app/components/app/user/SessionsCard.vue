<script setup lang="ts">
import type { User } from '~/types/user'

// The user detail's Active sessions card (display only; logic in useUserSessionsCard).
const props = defineProps<{ user: User }>()
const user = computed(() => props.user)

const {
  sessions,
  status,
  error,
  isLoading,
  hasData,
  refetch,
  canRevoke,
  revoke,
  canSignOutEverywhere,
  signOutEverywhere,
  askSignOutEverywhere
} = useUserSessionsCard(user)
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-semibold text-highlighted">
          Active sessions
        </h2>
        <UButton
          v-if="canSignOutEverywhere"
          icon="i-lucide-log-out"
          size="sm"
          color="error"
          variant="outline"
          label="Sign out everywhere"
          @click="askSignOutEverywhere"
        />
      </div>
    </template>
    <AppSessionsTable
      :sessions="sessions"
      :status="status"
      :error="error"
      :refreshing="isLoading"
      :has-data="hasData"
      :revocable="canRevoke"
      :revoking-id="revoke.pending ? revoke.target?.id : null"
      empty-title="No sessions"
      empty-description="This user is not signed in anywhere."
      @revoke="revoke.ask"
      @retry="refetch()"
    />
  </UCard>

  <AppConfirmDialog v-model:open="revoke.open" v-bind="revoke.dialog" @confirm="revoke.confirm" />
  <AppConfirmDialog v-model:open="signOutEverywhere.open" v-bind="signOutEverywhere.dialog" @confirm="signOutEverywhere.confirm" />
</template>
