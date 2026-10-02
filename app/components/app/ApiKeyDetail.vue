<script setup lang="ts">
import type { ApiKey } from '~/types/api-key'
import type { DetailItem } from '~/types/display'
import { API_KEY_ACTION_LABELS, apiKeyState, apiKeyTypeLabel, rateLimitLabel, scopeCountLabel, type ApiKeyAction, type ApiKeyActionState } from '~/utils/api-keys'

// One API key, inspected from its list without leaving it (F-028): what it can do (scopes),
// where (the entity it is restricted to), for how long (expiry), from where (IP allowlist), how
// often (rate limit) and whether it works right now, with the reasons when it does not. Footer
// actions come from the list's own rules (apiKeyActionStates); a disabled one says why. Display
// only: the caller owns the key, the actions and their dialogs. Who the key acts as is the
// `owner` text, or the #owner slot when it is a linked label (the entity key inventory renders
// AppApiKeyOwner there).
const props = withDefaults(defineProps<{
  apiKey: ApiKey | null
  /** Who the key acts as ("You", the service account, the user). The #owner slot overrides it. */
  owner?: string | null
  actions?: readonly ApiKeyActionState[]
  /** The detail is being re-read from the server. */
  refreshing?: boolean
  /** The re-read failed (the list's copy is shown). */
  refreshError?: string | null
}>(), { owner: null, actions: () => [], refreshing: false, refreshError: null })
const emit = defineEmits<{ action: [action: ApiKeyAction] }>()
const slots = defineSlots<{
  /** The "Acts as" value, rendered (for example a linked user or service-account label). */
  owner?: () => unknown
}>()
const open = defineModel<boolean>('open', { default: false })

const { isEnterprise } = useAuth()
const now = useRelativeNow()
const state = computed(() => (props.apiKey ? apiKeyState(props.apiKey, now.value.getTime()) : null))

const ALERT_TITLE = {
  ineffective: 'This key is not in effect',
  suspended: 'This key is suspended',
  expired: 'This key has expired'
} as const
const alert = computed(() => {
  const s = state.value
  if (!s || (s.kind !== 'ineffective' && s.kind !== 'suspended' && s.kind !== 'expired')) return null
  const reasons = s.kind === 'suspended' ? ['Requests signed with it are refused until it is reactivated.', ...s.reasons] : s.reasons
  return { title: ALERT_TITLE[s.kind], color: s.kind === 'expired' ? 'neutral' as const : 'warning' as const, reasons }
})

const items = computed<DetailItem[]>(() => {
  const key = props.apiKey
  if (!key) return []
  return [
    { key: 'status', label: 'Status', value: key.status },
    { key: 'type', label: 'Key type', value: apiKeyTypeLabel(key.prefix) },
    { key: 'prefix', label: 'Prefix', value: key.prefix, type: 'code' },
    ...(props.owner || slots.owner ? [{ key: 'owner', label: 'Acts as', value: props.owner }] : []),
    ...(isEnterprise.value ? [{ key: 'anchor', label: 'Restricted to', value: key.entity_ids?.[0] ?? null }] : []),
    { key: 'rate', label: 'Rate limit', value: rateLimitLabel(key.rate_limit_per_minute) },
    { key: 'ips', label: 'IP allowlist', value: key.ip_whitelist?.length ? key.ip_whitelist.join(', ') : null, fallback: 'Any IP address' },
    { key: 'created', label: 'Created', value: key.created_at, type: 'datetime' },
    { key: 'expires', label: 'Expires', value: key.expires_at ?? null, type: 'datetime', fallback: 'Never' },
    { key: 'last-used', label: 'Last used', value: key.last_used_at ?? null, type: 'datetime', fallback: 'Never' },
    { key: 'uses', label: 'Uses', value: key.usage_count },
    { key: 'description', label: 'Description', value: key.description ?? null, full: true }
  ]
})

const buttons = computed(() => props.actions.map(({ action, disabledReason }) => ({ action, disabledReason, ...API_KEY_ACTION_LABELS[action] })))
const disabledNotes = computed(() => buttons.value.filter(b => b.disabledReason).map(b => `${b.label}: ${b.disabledReason}`))
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="apiKey?.name ?? 'API key'"
    :description="apiKey ? `Prefix ${apiKey.prefix}` : undefined"
  >
    <template #body>
      <div v-if="apiKey" class="space-y-6" data-testid="api-key-detail">
        <UAlert
          v-if="refreshError"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Could not refresh this key"
          :description="refreshError"
        />
        <UAlert
          v-if="alert"
          :color="alert.color"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="alert.title"
          data-testid="api-key-ineffective"
        >
          <template #description>
            <ul class="list-disc space-y-0.5 pl-4">
              <li v-for="reason in alert.reasons" :key="reason">
                {{ reason }}
              </li>
            </ul>
          </template>
        </UAlert>

        <AppDetailList :items="items">
          <template #value-status>
            <AppApiKeyStatus :api-key="apiKey" />
          </template>
          <template v-if="slots.owner" #value-owner>
            <slot name="owner" />
          </template>
          <template #value-anchor>
            <AppApiKeyAnchor :entity-id="apiKey.entity_ids?.[0] ?? null" :inherit-from-tree="apiKey.inherit_from_tree" detailed />
          </template>
          <template v-if="apiKey.ip_whitelist?.length" #value-ips>
            <span class="flex flex-wrap gap-1">
              <UBadge
                v-for="ip in apiKey.ip_whitelist"
                :key="ip"
                color="neutral"
                variant="subtle"
                class="font-mono"
                :label="ip"
              />
            </span>
          </template>
        </AppDetailList>

        <section class="space-y-2">
          <h3 class="text-sm font-semibold text-highlighted">
            Scopes <span class="font-normal text-muted">· {{ scopeCountLabel(apiKey.scopes.length) }}</span>
          </h3>
          <p class="text-xs text-muted">
            The key can do at most this, and only while its owner still holds these permissions.
          </p>
          <AppPermissionList :names="apiKey.scopes" detailed empty-text="No scopes: this key can do nothing." />
        </section>
      </div>
    </template>
    <template v-if="buttons.length" #footer>
      <div class="flex w-full flex-col gap-2">
        <ul v-if="disabledNotes.length" class="space-y-0.5 text-xs text-muted" data-testid="api-key-disabled-actions">
          <li v-for="note in disabledNotes" :key="note">
            {{ note }}
          </li>
        </ul>
        <div class="flex w-full flex-wrap justify-end gap-2">
          <UButton
            v-for="button in buttons"
            :key="button.action"
            :label="button.label"
            :icon="button.icon"
            :color="button.color ?? (button.action === 'edit' || button.action === 'replace' ? 'primary' : 'neutral')"
            :variant="button.action === 'edit' || button.action === 'replace' ? 'solid' : 'outline'"
            :disabled="Boolean(button.disabledReason) || refreshing"
            @click="emit('action', button.action)"
          />
        </div>
      </div>
    </template>
  </USlideover>
</template>
