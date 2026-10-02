<script setup lang="ts">
// The dashboard's "Your access" card for accounts without admin pages (display only; logic in
// useMyAccess, the same reads as Account › Access): how far the account reaches, how many
// permissions it holds and its memberships in force, with a link to the full Access tab.
const { accessScope, permissionNames, permissionsStatus, membershipsShown, membershipRows, membershipsStatus } = useMyAccess()
const inForce = computed(() => membershipRows.value.filter(row => row.inForce).length)
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
</script>

<template>
  <UPageCard variant="subtle" data-testid="dashboard-my-access">
    <template #title>
      <h2>Your access</h2>
    </template>
    <div class="space-y-2 text-sm">
      <p v-if="accessScope">
        <span class="font-medium text-highlighted">{{ accessScope.label }}.</span>{{ ' ' }}<span class="text-muted">{{ accessScope.description }}</span>
      </p>
      <p class="text-muted">
        <template v-if="permissionsStatus === 'success'">
          You hold {{ plural(permissionNames.length, 'permission', 'permissions') }}.
        </template>
        <template v-else-if="permissionsStatus === 'error'">
          Your permissions could not be loaded.
        </template>
        <template v-else>
          Loading your permissions...
        </template>
        <template v-if="membershipsShown && membershipsStatus === 'success'">
          {{ plural(inForce, 'membership is', 'memberships are') }} in force.
        </template>
      </p>
      <ULink to="/app/account/access" class="text-primary hover:underline">
        View your access
      </ULink>
    </div>
  </UPageCard>
</template>
