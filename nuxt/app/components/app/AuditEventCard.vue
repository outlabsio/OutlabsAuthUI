<script setup lang="ts">
import type { UserAuditEvent } from '~/types/audit'

// One audit event, rendered as an expandable card (parity with the React AuditEventCard).
// Actor / subject / entity ids are click-to-filter: they emit `filter` and the workspace
// pushes it into the route query. Before/after/metadata payloads expand on demand.
const props = defineProps<{ event: UserAuditEvent }>()
const emit = defineEmits<{ filter: [key: 'actorUserId' | 'subjectUserId' | 'entityId', value: string] }>()

const open = ref(false)

const title = computed(() => {
  const parts = props.event.event_type.split('.')
  return (parts.at(-1) ?? props.event.event_type).replace(/[_-]/g, ' ')
})

const occurredAt = computed(() => {
  const parsed = new Date(props.event.occurred_at)
  return Number.isNaN(parsed.getTime()) ? 'Unknown' : parsed.toLocaleString()
})

const subjectDisplay = computed(() => props.event.subject_email_snapshot || props.event.subject_user_id || null)

const afterStatus = computed(() => {
  const after = props.event.after
  const status = after && typeof after === 'object' ? (after as Record<string, unknown>).status : null
  return typeof status === 'string' ? status : null
})

const contextRows = computed(() => {
  const e = props.event
  return [
    e.event_source ? { label: 'Source', value: e.event_source } : null,
    e.request_id ? { label: 'Request', value: e.request_id } : null,
    e.role_id ? { label: 'Role', value: e.role_id } : null,
    e.root_entity_id ? { label: 'Root entity', value: e.root_entity_id } : null,
    e.ip_address ? { label: 'IP', value: e.ip_address } : null,
    e.user_agent ? { label: 'User agent', value: e.user_agent } : null
  ].filter((row): row is { label: string, value: string } => Boolean(row))
})

function hasPayload(value?: Record<string, unknown> | null) {
  return Boolean(value && Object.keys(value).length > 0)
}
const hasBefore = computed(() => hasPayload(props.event.before))
const hasAfter = computed(() => hasPayload(props.event.after))
const hasMetadata = computed(() => hasPayload(props.event.metadata))
const hasDetails = computed(() => hasBefore.value || hasAfter.value || hasMetadata.value || contextRows.value.length > 0)

function formatJson(value: Record<string, unknown>) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const summary = computed(() => props.event.reason || `${props.event.event_type} · ${subjectDisplay.value ?? 'unknown subject'}`)
</script>

<template>
  <div class="rounded-lg border border-default bg-muted/30 px-4 py-3">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="space-y-1">
        <div class="font-medium capitalize text-highlighted">
          {{ title }}
        </div>
        <div class="text-xs text-muted">
          {{ occurredAt }}
        </div>

        <div v-if="subjectDisplay" class="text-xs text-muted">
          Subject:
          <button
            v-if="event.subject_user_id"
            type="button"
            class="break-all font-mono text-default underline-offset-2 hover:underline"
            :aria-label="`Filter by subject ${event.subject_user_id}`"
            @click="emit('filter', 'subjectUserId', event.subject_user_id)"
          >
            {{ subjectDisplay }}
          </button>
          <span v-else class="break-all font-mono text-default">{{ subjectDisplay }}</span>
        </div>

        <div v-if="event.actor_user_id" class="text-xs text-muted">
          Actor:
          <button
            type="button"
            class="break-all font-mono text-default underline-offset-2 hover:underline"
            :aria-label="`Filter by actor ${event.actor_user_id}`"
            @click="emit('filter', 'actorUserId', event.actor_user_id)"
          >
            {{ event.actor_user_id }}
          </button>
        </div>

        <div v-if="event.entity_id" class="text-xs text-muted">
          Entity:
          <button
            type="button"
            class="break-all font-mono text-default underline-offset-2 hover:underline"
            :aria-label="`Filter by entity ${event.entity_id}`"
            @click="emit('filter', 'entityId', event.entity_id)"
          >
            {{ event.entity_id }}
          </button>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <UBadge color="neutral" variant="outline" class="capitalize">
          {{ event.event_category }}
        </UBadge>
        <UBadge
          v-if="afterStatus"
          color="neutral"
          variant="subtle"
          class="capitalize"
        >
          {{ afterStatus }}
        </UBadge>
      </div>
    </div>

    <div class="mt-3 text-sm text-muted">
      {{ summary }}
    </div>

    <div v-if="hasDetails" class="mt-3">
      <UButton
        :icon="open ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
        color="neutral"
        variant="ghost"
        size="xs"
        :label="open ? 'Hide event details' : 'Show event details'"
        :aria-label="open ? `Hide details for ${event.event_type}` : `Show details for ${event.event_type}`"
        @click="open = !open"
      />

      <div v-if="open" class="mt-3 space-y-3">
        <dl v-if="contextRows.length" class="grid gap-2 rounded-md border border-default bg-muted/20 px-3 py-2 text-xs sm:grid-cols-2">
          <div v-for="row in contextRows" :key="row.label" class="min-w-0 space-y-0.5">
            <dt class="font-medium uppercase tracking-wide text-muted">
              {{ row.label }}
            </dt>
            <dd class="break-all text-default">
              {{ row.value }}
            </dd>
          </div>
        </dl>

        <div v-if="hasBefore && event.before" class="space-y-1.5">
          <div class="text-xs font-medium uppercase tracking-wide text-muted">
            Before
          </div>
          <pre class="overflow-x-auto rounded-md border border-default bg-muted/40 px-3 py-2 font-mono text-xs whitespace-pre-wrap">{{ formatJson(event.before) }}</pre>
        </div>

        <div v-if="hasAfter && event.after" class="space-y-1.5">
          <div class="text-xs font-medium uppercase tracking-wide text-muted">
            After
          </div>
          <pre class="overflow-x-auto rounded-md border border-default bg-muted/40 px-3 py-2 font-mono text-xs whitespace-pre-wrap">{{ formatJson(event.after) }}</pre>
        </div>

        <div v-if="hasMetadata && event.metadata" class="space-y-1.5">
          <div class="text-xs font-medium uppercase tracking-wide text-muted">
            Metadata
          </div>
          <pre class="overflow-x-auto rounded-md border border-default bg-muted/40 px-3 py-2 font-mono text-xs whitespace-pre-wrap">{{ formatJson(event.metadata) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
