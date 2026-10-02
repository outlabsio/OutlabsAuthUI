<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { UserAuditEvent } from '~/types/audit'
import type { AuditChange } from '~/utils/audit'

// What an audit event changed and where it came from (display only; logic in
// useAuditEventView): the before/after changes, the context fields (the actor named by
// AppUserLabel), links that pivot the Audit workspace onto this event's account, actor, entity or
// type, and the redacted raw payloads. Before, After and the pivot links wrap anywhere: they
// break at spaces first (a date stays whole where it fits) and split a long token (a hash, an id,
// an email) only when nothing else fits, so the details never widen the table past the screen.
const props = defineProps<{ event: UserAuditEvent }>()

const { label, changes, contextItems, rawPayloads, pivots } = useAuditEventView(() => props.event)

const changeColumns: TableColumn<AuditChange>[] = [
  { accessorKey: 'label', header: 'Field' },
  { accessorKey: 'before', header: 'Before' },
  { accessorKey: 'after', header: 'After' }
]
const rawOpen = ref(false)
</script>

<template>
  <div class="space-y-4 whitespace-normal">
    <section v-if="changes.length" :aria-label="`Changes in ${label}`">
      <h4 class="mb-1 text-xs font-medium text-muted">
        Changes
      </h4>
      <UTable :data="changes" :columns="changeColumns" data-testid="audit-changes">
        <template #label-cell="{ row }">
          <span class="whitespace-normal break-words font-medium text-default">{{ row.original.label }}</span>
        </template>
        <template #before-cell="{ row }">
          <span class="whitespace-normal wrap-anywhere text-muted">{{ row.original.before }}</span>
        </template>
        <template #after-cell="{ row }">
          <span class="whitespace-normal wrap-anywhere text-default">{{ row.original.after }}</span>
        </template>
      </UTable>
    </section>

    <AppDetailList :items="contextItems">
      <template v-if="event.actor_user_id" #value-actor>
        <AppUserLabel :user-id="event.actor_user_id" :subject-id="event.subject_user_id ?? undefined" />
      </template>
    </AppDetailList>

    <nav v-if="pivots.length" :aria-label="`Related audit events for ${label}`" class="flex flex-wrap gap-x-4 gap-y-1">
      <ULink
        v-for="pivot in pivots"
        :key="pivot.key"
        :to="pivot.to"
        class="wrap-anywhere text-sm text-primary hover:underline"
      >
        {{ pivot.label }}
      </ULink>
    </nav>

    <UCollapsible v-if="rawPayloads.length" v-model:open="rawOpen">
      <UButton
        :label="rawOpen ? 'Hide raw payload' : 'Show raw payload'"
        :trailing-icon="rawOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        color="neutral"
        variant="link"
        size="sm"
        class="px-0"
      />
      <template #content>
        <div class="mt-2 space-y-3">
          <div v-for="part in rawPayloads" :key="part.key" class="space-y-1">
            <h4 class="text-xs font-medium text-muted">
              {{ part.label }}
            </h4>
            <pre class="overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-default bg-elevated px-3 py-2 font-mono text-xs">{{ part.json }}</pre>
          </div>
        </div>
      </template>
    </UCollapsible>
  </div>
</template>
