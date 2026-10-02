<script setup lang="ts">
// The entity's Activity card (display only; logic in useEntityActivity). Hidden where the server
// offers no audit search; a permission denial shows the compact lock.
const props = defineProps<{ entityId: string, entityName: string }>()
const entityId = computed(() => props.entityId)

const { available, canOpenAudit, page, pageSize, events, total, status, error, refetch, auditLink } = useEntityActivity(entityId)
</script>

<template>
  <UCard v-if="available">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <h2 class="font-semibold text-highlighted">
            Activity
          </h2>
          <p class="mt-1 text-sm text-muted">
            Membership and access events retained for {{ entityName }}.
          </p>
        </div>
        <UButton
          v-if="canOpenAudit"
          :to="auditLink"
          label="Open in Audit"
          color="neutral"
          variant="outline"
          size="sm"
        />
      </div>
    </template>

    <AppPermissionGate section="audit" label="entity activity" compact>
      <AppQueryState
        :status="status"
        :error="error"
        :empty="!events.length"
        error-title="Could not load entity activity"
        empty-title="No activity yet"
        empty-description="No retained membership or access events reference this entity."
        empty-icon="i-lucide-history"
        skeleton="list"
        :skeleton-rows="3"
        compact
        @retry="refetch()"
      >
        <div class="divide-y divide-default">
          <AppAuditEventCard
            v-for="event in events"
            :key="event.id"
            :event="event"
            context="entity"
          />
        </div>
        <AppListPagination
          v-model:page="page"
          :total="total"
          :page-size="pageSize"
          noun="event"
          class="mt-4"
        />
      </AppQueryState>
    </AppPermissionGate>
  </UCard>
</template>
