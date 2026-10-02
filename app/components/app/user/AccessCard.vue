<script setup lang="ts">
import type { User } from '~/types/user'

// The user detail's Effective permissions card with the Check access dialog (display only;
// logic in useUserAccess).
const props = defineProps<{ user: User }>()
const user = computed(() => props.user)

const {
  canRead,
  sources,
  status,
  error,
  isLoading,
  hasData,
  refetch,
  groups,
  shownCount,
  search,
  term,
  clearSearch,
  sourceRole,
  origins,
  canCheck,
  checkOpen
} = useUserAccess(user)

const formatResource = (resource: string) => resource.replace(/[_-]/g, ' ')
</script>

<template>
  <UCard v-if="canRead">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <h2 class="font-semibold text-highlighted">
            Effective permissions
          </h2>
          <span v-if="status === 'success'" class="text-sm text-muted">{{ sources.length }}</span>
        </div>
        <UButton
          v-if="canCheck"
          icon="i-lucide-shield-question"
          size="sm"
          variant="outline"
          color="neutral"
          label="Check access"
          @click="checkOpen = true"
        />
      </div>
    </template>
    <div class="space-y-4">
      <UAlert
        v-if="user.is_superuser"
        color="info"
        variant="subtle"
        icon="i-lucide-shield"
        title="Superuser"
        description="A superuser passes every permission check, whatever the roles below grant."
      />
      <p class="text-sm text-muted">
        What this account's roles in force grant, in any entity, with a role that grants each. ABAC conditions are not evaluated. Ask about one entity with Check access.
      </p>
      <AppQueryState
        :status="status"
        :error="error"
        :empty="!sources.length"
        :refreshing="isLoading"
        :has-data="hasData"
        error-title="Could not load effective permissions"
        empty-title="No permissions"
        empty-description="None of this account's grants in force gives it a permission."
        empty-icon="i-lucide-shield-off"
        skeleton="lines"
        :skeleton-rows="4"
        loading-label="Loading effective permissions"
        compact
        @retry="refetch()"
      >
        <div class="space-y-4">
          <UInput
            v-model="search"
            type="search"
            icon="i-lucide-search"
            placeholder="Search permissions or roles..."
            aria-label="Search effective permissions"
            class="w-full sm:max-w-xs"
          />
          <UEmpty
            v-if="!shownCount"
            size="sm"
            variant="naked"
            icon="i-lucide-search-x"
            title="No permission matches"
            :description="`Nothing matches “${term}”.`"
            :actions="[{ label: 'Clear search', color: 'neutral', variant: 'outline', onClick: clearSearch }]"
          />
          <div v-else class="space-y-4" data-testid="effective-permissions">
            <section v-for="group in groups" :key="group.resource" :aria-label="`${formatResource(group.resource)} permissions`">
              <div class="mb-1.5 flex items-center gap-2">
                <span class="text-xs font-medium uppercase tracking-wide text-muted">{{ formatResource(group.resource) }}</span>
                <span class="text-xs text-dimmed">{{ group.items.length }}</span>
              </div>
              <ul class="space-y-2">
                <li
                  v-for="item in group.items"
                  :key="item.name"
                  class="flex flex-wrap items-center gap-x-2 gap-y-1"
                  data-testid="effective-permission"
                >
                  <UBadge
                    color="neutral"
                    variant="subtle"
                    size="sm"
                    class="shrink-0 font-mono"
                  >
                    {{ item.action }}
                  </UBadge>
                  <span class="min-w-0 text-sm text-default">{{ item.displayName }}</span>
                  <template v-if="sourceRole(item.sourceId, item.sourceName)">
                    <span class="text-xs text-dimmed">via</span>
                    <AppRoleChip :role="sourceRole(item.sourceId, item.sourceName)!" />
                    <span v-if="origins(item.sourceId)" class="text-xs text-muted">{{ origins(item.sourceId) }}</span>
                  </template>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </AppQueryState>
    </div>
  </UCard>

  <AppUserCheckAccessDialog v-if="canCheck" v-model:open="checkOpen" :user="user" />
</template>
