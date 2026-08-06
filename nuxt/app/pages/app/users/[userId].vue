<script setup lang="ts">
const route = useRoute()
const userId = computed(() => String(route.params.userId))
</script>

<template>
  <UDashboardPanel id="user-detail">
    <template #header>
      <UDashboardNavbar title="User detail">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <AppComingSoon :title="`User ${userId}`" />
    </template>
  </UDashboardPanel>
</template>
