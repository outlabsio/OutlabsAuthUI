<script setup lang="ts">
// Account › Access — what this account may do (F-103). Logic in useMyAccess; display only.
usePageMeta('Access')

const {
  isSuperuser,
  accessScope,
  permissionNames,
  permissionsStatus,
  permissionsError,
  permissionsFetching,
  refetchPermissions,
  membershipsShown,
  membershipRows,
  membershipsStatus,
  membershipsError,
  membershipsFetching,
  refetchMemberships,
  namesLimited
} = useMyAccess()
</script>

<template>
  <!-- EnterpriseRBAC only: which organizations the account reaches. -->
  <UPageCard v-if="accessScope">
    <template #title>
      <h2>Organization</h2>
    </template>
    <div class="flex flex-col gap-2" data-testid="account-access-scope">
      <div class="flex flex-wrap items-center gap-2">
        <span class="font-medium text-highlighted">{{ accessScope.label }}</span>
        <UBadge
          v-if="isSuperuser"
          color="neutral"
          variant="outline"
          icon="i-lucide-shield-check"
        >
          Superuser
        </UBadge>
      </div>
      <p class="text-sm text-muted">
        {{ accessScope.description }}
      </p>
    </div>
  </UPageCard>

  <UPageCard
    v-if="membershipsShown"
    description="The entities you belong to and the roles you hold in each."
  >
    <template #title>
      <h2>Memberships</h2>
    </template>
    <AppQueryState
      :status="membershipsStatus"
      :error="membershipsError"
      :empty="!membershipRows.length"
      :refreshing="membershipsFetching"
      error-title="Could not load your memberships"
      empty-title="No memberships"
      empty-description="You are not a member of any entity."
      empty-icon="i-lucide-building-2"
      skeleton="list"
      :skeleton-rows="2"
      loading-label="Loading memberships"
      compact
      @retry="refetchMemberships()"
    >
      <ul class="flex flex-col divide-y divide-default">
        <li
          v-for="row in membershipRows"
          :key="row.id"
          class="flex flex-col gap-2 py-3 first:pt-0 last:pb-0"
          data-testid="my-membership"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span v-if="row.entityName" class="font-medium text-highlighted">{{ row.entityName }}</span>
            <span v-else class="text-muted">An entity your account cannot read</span>
            <UBadge :color="row.statusColor" variant="subtle">
              {{ statusLabel(row.status) }}
            </UBadge>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <AppRoleChip v-for="roleId in row.roleIds" :key="roleId" :role="{ id: roleId }" />
            <span v-if="!row.roleIds.length" class="text-sm text-muted">No roles</span>
          </div>
          <p v-if="row.validFrom || row.validUntil" class="text-xs text-muted">
            <template v-if="row.validFrom">
              From <AppTimestamp :value="row.validFrom" date-only />
            </template>
            <template v-if="row.validUntil">
              until <AppTimestamp :value="row.validUntil" date-only />
            </template>
          </p>
        </li>
      </ul>
    </AppQueryState>
    <p v-if="namesLimited && membershipRows.length" class="text-xs text-muted">
      Entity and role names show where your account can read them.
    </p>
  </UPageCard>

  <UPageCard description="Everything your account is allowed to do, from all of its roles.">
    <template #title>
      <h2>Permissions</h2>
    </template>
    <p v-if="isSuperuser" class="text-sm text-muted">
      As a superuser you can do everything, whatever your roles grant.
    </p>
    <AppQueryState
      v-else
      :status="permissionsStatus"
      :error="permissionsError"
      :empty="!permissionNames.length"
      :refreshing="permissionsFetching"
      error-title="Could not load your permissions"
      empty-title="No permissions"
      empty-description="Your roles grant no permissions. Ask an administrator for access."
      empty-icon="i-lucide-lock"
      skeleton="lines"
      loading-label="Loading permissions"
      compact
      @retry="refetchPermissions()"
    >
      <AppPermissionList :names="permissionNames" />
    </AppQueryState>
  </UPageCard>
</template>
