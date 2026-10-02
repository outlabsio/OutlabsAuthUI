<script setup lang="ts">
import type { UserAuditEvent } from '~/types/audit'

// One audit event in a feed on another page (a user's History tab, an entity's Activity card):
// the humanized event with its severity badge, who it was about and who did it (named, linked),
// the reason, and a disclosure with the changes, context, pivots into the Audit workspace and
// the redacted raw payload (AppAuditEventDetails). Logic in useAuditEventView.
// `context` drops what the surrounding page already says: on a user's page every event is
// about that user, on an entity's page every event is at that entity.
const props = defineProps<{ event: UserAuditEvent, context?: 'user' | 'entity' }>()

const { label, badge, toneLabel, categoryLabel, entityName, subjectLabel, subjectTo } = useAuditEventView(() => props.event)
const { isEnterprise } = useAuth()
const open = ref(false)
const headingId = useId()
</script>

<template>
  <article class="space-y-1.5 py-3" :aria-labelledby="headingId">
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <h3 :id="headingId" class="text-sm font-medium text-highlighted">
          {{ label }}
        </h3>
        <UBadge
          v-if="toneLabel"
          :color="badge.color"
          variant="subtle"
          size="sm"
          :label="toneLabel"
        />
        <span class="text-xs text-muted">{{ categoryLabel }}</span>
      </div>
      <span class="text-xs text-muted">
        <AppTimestamp :value="event.occurred_at" fallback="Unknown time" />
      </span>
    </div>

    <p class="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted">
      <span v-if="context !== 'user' && subjectLabel">
        About
        <ULink v-if="subjectTo" :to="subjectTo" class="break-words font-medium text-default hover:underline">{{ subjectLabel }}</ULink>
        <span v-else class="break-words text-default">{{ subjectLabel }}</span>
      </span>
      <span v-if="event.actor_user_id">
        By <AppUserLabel :user-id="event.actor_user_id" :subject-id="event.subject_user_id ?? undefined" />
      </span>
      <span v-else>Actor not recorded</span>
      <span v-if="context !== 'entity' && isEnterprise && entityName">At <span class="text-default">{{ entityName }}</span></span>
    </p>

    <p v-if="event.reason" class="break-words text-sm text-muted">
      Reason: <span class="text-default">{{ event.reason }}</span>
    </p>

    <UCollapsible v-model:open="open">
      <UButton
        :label="open ? 'Hide details' : 'Show details'"
        :trailing-icon="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        color="neutral"
        variant="link"
        size="sm"
        class="px-0"
      />
      <template #content>
        <div class="pt-2">
          <AppAuditEventDetails :event="event" />
        </div>
      </template>
    </UCollapsible>
  </article>
</template>
