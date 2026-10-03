<script setup lang="ts">
// Account › Connected accounts — logic in useAccountConnections; display only. A failed link the
// provider round trip landed with is said above the list (where this tab is not available the
// account frame says it instead).
usePageMeta('Connected accounts')

const {
  available,
  rows,
  status,
  error,
  fetching,
  refetch,
  linkableProviders,
  providerLabel,
  accountLabel,
  accountAvatar,
  unlink,
  linkingProvider,
  onLink,
  linkNotice,
  dismissLinkNotice
} = useAccountConnections()
</script>

<template>
  <UAlert
    v-if="available && linkNotice"
    role="alert"
    color="error"
    variant="subtle"
    icon="i-lucide-link-2-off"
    :title="linkNotice.title"
    :description="linkNotice.description"
    :actions="linkNotice.actions"
    close
    @update:open="dismissLinkNotice"
  />

  <UPageCard description="Accounts from other providers you can sign in with.">
    <template #title>
      <h2>Connected accounts</h2>
    </template>
    <UEmpty
      v-if="!available"
      icon="i-lucide-link-2-off"
      title="No sign-in providers"
      description="This server offers no providers to link, and no account is linked."
      variant="naked"
      size="sm"
    />
    <AppQueryState
      v-else
      :status="status"
      :error="error"
      :refreshing="fetching"
      error-title="Could not load connected accounts"
      skeleton="list"
      :skeleton-rows="1"
      loading-label="Loading connected accounts"
      @retry="refetch()"
    >
      <div class="flex flex-col gap-4">
        <p v-if="rows.length === 0" class="text-sm text-muted">
          No linked accounts{{ linkableProviders.length ? '. Link one below to sign in with it.' : '.' }}
        </p>
        <ul v-else class="flex flex-col divide-y divide-default">
          <li
            v-for="account in rows"
            :key="account.id"
            class="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <UUser
              :name="account.display_name || account.email"
              :avatar="accountAvatar(account)"
              class="min-w-0"
            >
              <template #description>
                <span class="flex flex-wrap items-center gap-x-1.5">
                  <span>{{ providerLabel(account.provider) }}</span>
                  <span v-if="account.email && account.display_name">· {{ account.email }}</span>
                  <UBadge
                    v-if="account.email && !account.email_verified"
                    color="warning"
                    variant="subtle"
                    size="sm"
                  >Unverified email</UBadge>
                </span>
                <span class="block">
                  Linked <AppTimestamp :value="account.linked_at" /> · Last used <AppTimestamp :value="account.last_used_at" relative="always" fallback="never" />
                </span>
              </template>
            </UUser>
            <UButton
              color="error"
              variant="ghost"
              size="sm"
              label="Unlink"
              :aria-label="`Unlink ${accountLabel(account)}`"
              :loading="unlink.pending && unlink.target?.id === account.id"
              @click="unlink.ask(account)"
            />
          </li>
        </ul>
        <div v-if="linkableProviders.length" class="flex flex-col gap-2">
          <UButton
            v-for="provider in linkableProviders"
            :key="provider"
            block
            color="neutral"
            variant="subtle"
            :icon="`i-simple-icons-${provider}`"
            :loading="linkingProvider === provider"
            :label="`Link ${providerLabel(provider)}`"
            @click="onLink(provider)"
          />
        </div>
      </div>
    </AppQueryState>
  </UPageCard>

  <AppConfirmDialog v-model:open="unlink.open" v-bind="unlink.dialog" @confirm="unlink.confirm" />
</template>
