<script setup lang="ts">
const route = useRoute()
const roleId = computed(() => String(route.params.roleId))
</script>

<template>
  <UDashboardPanel id="role-detail">
    <template #header>
      <UDashboardNavbar title="Role detail">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <AppComingSoon :title="`Role ${roleId}`" />
    </template>
  </UDashboardPanel>
</template>
