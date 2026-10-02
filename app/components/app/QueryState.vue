<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'
import type { DataStateStatus } from '@pinia/colada'

// The one way a card, panel or list renders a query (F-123, F-210). Four explicit states, so
// "could not load" never reads as "none" and a disabled query never shows a false sentence:
// - disabled (`enabled` false): the query may not run — the #disabled slot, a lock (when
//   `disabled-title` is set) or nothing. Never a skeleton, never the empty copy.
// - pending with nothing to show: a USkeleton shaped like the content (`skeleton`).
// - error: an error UAlert with the API message and Retry (emits `retry`). Stale rows are
//   hidden, never shown beside the error.
// - stale (`has-data` while the status is error): a refresh failed but the query still holds
//   what it loaded before. Pinia Colada keeps that data only after a transient failure (no
//   answer, timeout, 429, 5xx); the stale-data plugin drops it after a refusal (403, 404, 422).
//   A blip must not blank a loaded page (F-122): the content stays, under a warning with Retry.
// - success: the #empty slot / UEmpty when `empty`, otherwise the default slot.
// With `placeholderData: keepPreviousData` a list keeps its rows while the next page loads
// (Colada reports 'success'), so there is no empty flash between pages.
//
//   <AppQueryState
//     :status="status" :error="error" :enabled="canRead" :empty="!rows.length" :refreshing="isLoading"
//     error-title="Could not load sessions" empty-title="No active sessions" skeleton="table"
//     @retry="refetch()"
//   >
//     <UTable ... />
//   </AppQueryState>
const props = withDefaults(defineProps<{
  // The query's `status` ('pending' | 'error' | 'success').
  status: DataStateStatus
  error?: unknown
  // False when the query is disabled (no permission, capability absent, missing id).
  enabled?: boolean
  // True when the successful result has nothing to show.
  empty?: boolean
  // The query's asyncStatus === 'loading'; puts the Retry button in its loading state.
  refreshing?: boolean
  // The query still holds data from an earlier success (`data !== undefined`): an error then
  // keeps the content under a "Couldn't refresh" warning instead of replacing it.
  hasData?: boolean
  errorTitle?: string
  emptyTitle?: string
  emptyDescription?: string
  emptyIcon?: string
  emptyActions?: ButtonProps[]
  // Shown as a lock UEmpty while disabled; without it the disabled state renders nothing.
  disabledTitle?: string
  disabledDescription?: string
  // Skeleton shape while pending: rows of cells, a list of avatar rows, label/value pairs, or
  // plain text lines.
  skeleton?: 'table' | 'list' | 'detail' | 'lines'
  skeletonRows?: number
  skeletonColumns?: number
  // Announced to screen readers while pending, e.g. "Loading sessions".
  loadingLabel?: string
  // Smaller empty/lock states for cards.
  compact?: boolean
}>(), {
  error: undefined,
  enabled: true,
  empty: false,
  refreshing: false,
  hasData: false,
  errorTitle: 'Could not load data',
  emptyTitle: 'Nothing here yet',
  emptyDescription: undefined,
  emptyIcon: 'i-lucide-inbox',
  emptyActions: undefined,
  disabledTitle: undefined,
  disabledDescription: undefined,
  skeleton: 'lines',
  skeletonRows: 3,
  skeletonColumns: 4,
  loadingLabel: 'Loading',
  compact: false
})

const emit = defineEmits<{ retry: [] }>()

const state = computed<'disabled' | 'pending' | 'error' | 'stale' | 'empty' | 'success'>(() => {
  if (!props.enabled) return 'disabled'
  if (props.status === 'error') return props.hasData ? 'stale' : 'error'
  if (props.status === 'pending') return 'pending'
  return props.empty ? 'empty' : 'success'
})

const errorMessage = useApiErrorMessage(() => props.error)
const retryAction = computed<ButtonProps[]>(() => [{
  label: 'Retry',
  icon: 'i-lucide-refresh-cw',
  color: 'neutral',
  variant: 'outline',
  loading: props.refreshing,
  onClick: () => emit('retry')
}])

// Vary the skeleton widths so it reads as content, not as a grid of bars.
const cellWidths = ['w-2/3', 'w-1/2', 'w-3/4', 'w-1/3', 'w-2/5', 'w-1/4']
const cellWidth = (row: number, col: number) => cellWidths[(row + col) % cellWidths.length]
</script>

<template>
  <div :data-query-state="state">
    <template v-if="state === 'disabled'">
      <slot name="disabled">
        <UEmpty
          v-if="disabledTitle"
          icon="i-lucide-lock"
          :title="disabledTitle"
          :description="disabledDescription"
          :size="compact ? 'sm' : 'md'"
          :variant="compact ? 'naked' : 'outline'"
        />
      </slot>
    </template>

    <!-- One polite "Loading …" announcement; every USkeleton carries its own role=alert, so the
         shapes are hidden from assistive technology. -->
    <div v-else-if="state === 'pending'" role="status">
      <span class="sr-only">{{ loadingLabel }}</span>
      <div aria-hidden="true">
        <slot name="loading">
          <div v-if="skeleton === 'table'" class="space-y-4">
            <div class="flex gap-4">
              <USkeleton v-for="col in skeletonColumns" :key="`h${col}`" class="h-3 flex-1" />
            </div>
            <div v-for="row in skeletonRows" :key="row" class="flex gap-4">
              <div v-for="col in skeletonColumns" :key="col" class="flex-1">
                <USkeleton class="h-4" :class="cellWidth(row, col)" />
              </div>
            </div>
          </div>

          <div v-else-if="skeleton === 'list'" class="space-y-4">
            <div v-for="row in skeletonRows" :key="row" class="flex items-center gap-3">
              <USkeleton class="size-8 shrink-0 rounded-full" />
              <div class="flex-1 space-y-2">
                <USkeleton class="h-4" :class="cellWidth(row, 0)" />
                <USkeleton class="h-3" :class="cellWidth(row, 3)" />
              </div>
            </div>
          </div>

          <div v-else-if="skeleton === 'detail'" class="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <div v-for="row in skeletonRows" :key="row" class="space-y-2">
              <USkeleton class="h-3 w-20" />
              <USkeleton class="h-4" :class="cellWidth(row, 1)" />
            </div>
          </div>

          <div v-else class="space-y-3">
            <USkeleton
              v-for="row in skeletonRows"
              :key="row"
              class="h-4"
              :class="cellWidth(row, 2)"
            />
          </div>
        </slot>
      </div>
    </div>

    <UAlert
      v-else-if="state === 'error'"
      role="alert"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="errorTitle"
      :description="errorMessage"
      :actions="retryAction"
    />

    <template v-else-if="state === 'stale'">
      <UAlert
        role="alert"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Couldn't refresh"
        :description="`${errorMessage} Showing what was loaded before.`"
        :actions="retryAction"
        class="mb-4"
      />
      <slot v-if="!empty" />
      <slot v-else name="empty">
        <UEmpty
          :icon="emptyIcon"
          :title="emptyTitle"
          :description="emptyDescription"
          :actions="emptyActions"
          :size="compact ? 'sm' : 'md'"
          :variant="compact ? 'naked' : 'outline'"
        />
      </slot>
    </template>

    <template v-else-if="state === 'empty'">
      <slot name="empty">
        <UEmpty
          :icon="emptyIcon"
          :title="emptyTitle"
          :description="emptyDescription"
          :actions="emptyActions"
          :size="compact ? 'sm' : 'md'"
          :variant="compact ? 'naked' : 'outline'"
        />
      </slot>
    </template>

    <slot v-else />
  </div>
</template>
