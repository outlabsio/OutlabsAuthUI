<script setup lang="ts">
const route = useRoute()
const permissionId = computed(() => String(route.params.permissionId))
</script>

<template>
  <UDashboardPanel id="permission-detail">
    <template #header>
      <UDashboardNavbar title="Permission detail">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <AppComingSoon :title="`Permission ${permissionId}`" />
    </template>
  </UDashboardPanel>
</template>
