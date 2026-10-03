<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { DataStateStatus } from '@pinia/colada'
import type { UserSession } from '~/types/account'
import { formatRelativeTime } from '~/utils/format-date'
import { hideBelowSm, srOnlyHeader } from '~/utils/table'
import { describeUserAgent, type DeviceKind } from '~/utils/user-agent'

// Sessions (refresh-token families) of one user, for the account page and user detail (F-093).
// Rows are identifiable: browser and OS from the user agent (full header in a tooltip), the
// device name when the client sent one, IP, when the session was last active and when it
// expires. Most recent first. Loading, error (with Retry) and empty states come from
// AppQueryState. Revoking is optional: with `revocable` each row gets a Revoke button whose
// accessible name says which session it ends, and the table emits `revoke`. The row the server
// marks as the one making the request (`is_current`, outlabs-auth 0.1.0a35: only on one's own
// sessions) comes first, is marked "This browser" and, when revocable, offers Sign out instead
// (`sign-out`), since revoking it would end the session this tab is using.
//   <AppSessionsTable
//     :sessions="sessions" :status="status" :error="error" :refreshing="isLoading"
//     revocable :revoking-id="revokingId" @revoke="onRevoke" @retry="refetch()"
//   />
const props = withDefaults(defineProps<{
  sessions: UserSession[]
  status: DataStateStatus
  error?: unknown
  enabled?: boolean
  refreshing?: boolean
  // The query still holds sessions from an earlier load (AppQueryState `has-data`).
  hasData?: boolean
  revocable?: boolean
  // Row whose revoke request is in flight.
  revokingId?: string | null
  // This browser's sign-out is running (the current row's button spins).
  signingOut?: boolean
  emptyTitle?: string
  emptyDescription?: string
}>(), {
  error: undefined,
  enabled: true,
  refreshing: false,
  hasData: false,
  revocable: false,
  revokingId: null,
  signingOut: false,
  // Avoid repeating the card heading ("Active sessions") so the two stay distinct headings.
  emptyTitle: 'No sessions',
  emptyDescription: 'No one is signed in to this account.'
})

const emit = defineEmits<{
  revoke: [session: UserSession]
  signOut: []
  retry: []
}>()

const now = useRelativeNow()

const DEVICE_ICON: Record<DeviceKind, string> = {
  desktop: 'i-lucide-monitor',
  mobile: 'i-lucide-smartphone',
  tablet: 'i-lucide-tablet',
  client: 'i-lucide-terminal',
  unknown: 'i-lucide-circle-help'
}

// A refreshed session is a new row (rotation), so created_at is when it was last renewed:
// the best "last active" signal until the API carries last_used_at forward.
const lastActive = (s: UserSession) => s.last_used_at ?? s.created_at

type SessionRow = UserSession & { device: ReturnType<typeof describeUserAgent>, lastActiveAt: string, current: boolean }

// This browser first, then the most recently active.
const rows = computed<SessionRow[]>(() => props.sessions
  .map(s => ({ ...s, device: describeUserAgent(s.user_agent), lastActiveAt: lastActive(s), current: s.is_current === true }))
  .sort((a, b) => Number(b.current) - Number(a.current) || Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt)))

// The table has to fit a max-w-3xl card on a desktop and a 390px phone without scrolling
// sideways, with Revoke always on screen. So the IP sits under the device name (it wraps,
// which also covers long IPv6 addresses); below `sm` "Last active" moves there too and Expires
// is dropped; and the actions column is pinned to the right edge (stock UTable column
// pinning) in case a long device name still makes the table wider than its card.
const columns = computed<TableColumn<SessionRow>[]>(() => [
  { id: 'device', header: 'Device' },
  { id: 'last_active', header: 'Last active', meta: hideBelowSm },
  { accessorKey: 'expires_at', header: 'Expires', meta: hideBelowSm },
  ...(props.revocable ? [{ id: 'actions', header: srOnlyHeader('Actions') } as TableColumn<SessionRow>] : [])
])
const columnPinning = computed(() => ({ left: [], right: props.revocable ? ['actions'] : [] }))

// An IPv6 address may break after any colon, never inside a group; an IPv4 one never breaks.
const ipParts = (ip: string) => (ip.includes(':') ? ip.split(/(?<=:)/) : [ip])

// Sessions live for days, so both timestamps are relative ("3 days ago", "in 29 days"), with
// the absolute value in the tooltip; that also keeps the columns narrow.

// "Revoke session: Chrome 128 on macOS, 127.0.0.1, active 5 minutes ago"
function revokeLabel(row: SessionRow) {
  const parts = [row.device.label, row.ip_address, `active ${formatRelativeTime(row.lastActiveAt, now.value.getTime())}`].filter(Boolean)
  return `Revoke session: ${parts.join(', ')}`
}
</script>

<template>
  <AppQueryState
    :status="status"
    :error="error"
    :enabled="enabled"
    :empty="!rows.length"
    :refreshing="refreshing"
    :has-data="hasData"
    error-title="Could not load sessions"
    :empty-title="emptyTitle"
    :empty-description="emptyDescription"
    empty-icon="i-lucide-monitor-off"
    skeleton="table"
    :skeleton-columns="3"
    loading-label="Loading sessions"
    compact
    @retry="emit('retry')"
  >
    <UTable
      :data="rows"
      :columns="columns"
      :column-pinning="columnPinning"
      :loading="refreshing"
    >
      <template #device-cell="{ row }">
        <div class="flex items-center gap-3">
          <UIcon :name="DEVICE_ICON[row.original.device.kind]" class="size-5 shrink-0 text-muted" />
          <!-- Cells are nowrap by default; this one wraps so the table can shrink to its card. -->
          <div class="min-w-0 whitespace-normal">
            <div class="flex flex-wrap items-center gap-1.5">
              <UTooltip :text="row.original.user_agent || 'The client sent no user agent.'">
                <span class="font-medium text-highlighted">{{ row.original.device.label }}</span>
              </UTooltip>
              <UBadge
                v-if="row.original.current"
                color="primary"
                variant="subtle"
                size="sm"
              >
                This browser
              </UBadge>
              <UBadge
                v-if="row.original.device_name"
                color="neutral"
                variant="outline"
                size="sm"
              >
                {{ row.original.device_name }}
              </UBadge>
            </div>
            <p v-if="row.original.ip_address" class="break-words font-mono text-xs text-muted">
              <span class="sr-only">IP address </span>
              <template v-for="(part, i) in ipParts(row.original.ip_address)" :key="i">
                <span>{{ part }}</span><wbr>
              </template>
            </p>
            <p class="text-xs text-muted sm:hidden">
              Active <AppTimestamp :value="row.original.lastActiveAt" relative="always" />
            </p>
          </div>
        </div>
      </template>
      <template #last_active-cell="{ row }">
        <AppTimestamp :value="row.original.lastActiveAt" relative="always" />
      </template>
      <template #expires_at-cell="{ row }">
        <AppTimestamp :value="row.original.expires_at" relative="always" />
      </template>
      <template #actions-cell="{ row }">
        <div class="text-right">
          <!-- Icon-only on phones; the accessible name always says which session. -->
          <UButton
            v-if="row.original.current"
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-log-out"
            :aria-label="`Sign out of this browser: ${row.original.device.label}`"
            :loading="signingOut"
            :disabled="Boolean(revokingId)"
            @click="emit('signOut')"
          >
            <span class="hidden sm:inline">Sign out</span>
          </UButton>
          <UButton
            v-else
            color="error"
            variant="ghost"
            size="sm"
            icon="i-lucide-log-out"
            :aria-label="revokeLabel(row.original)"
            :loading="revokingId === row.original.id"
            :disabled="Boolean(revokingId) && revokingId !== row.original.id"
            @click="emit('revoke', row.original)"
          >
            <span class="hidden sm:inline">Revoke</span>
          </UButton>
        </div>
      </template>
    </UTable>
  </AppQueryState>
</template>
