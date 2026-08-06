<script setup lang="ts">
const route = useRoute()
const entityId = computed(() => String(route.params.entityId))
</script>

<template>
  <UDashboardPanel id="entity-detail">
    <template #header>
      <UDashboardNavbar title="Entity detail">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <AppComingSoon :title="`Entity ${entityId}`" />
    </template>
  </UDashboardPanel>
</template>
