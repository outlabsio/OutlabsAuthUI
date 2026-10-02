import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useUiStore } from '~/stores/ui'
import {
  DEFAULT_REQUEST_COOLDOWN_SECONDS,
  cooldownLabel,
  isRateLimitedError,
  retryAfterSecondsFrom
} from '~/utils/request-cooldown'

// Per-identifier cooldowns for requests the backend rate-limits (sign-in codes, magic links,
// reset links, phone verification codes). A successful send starts the default wait; a 429
// starts the wait the API asked for. The state is the ui store's (stores/ui.ts): shared by
// every page in the tab and kept across a reload. These are its accessors; features use them
// rather than the store.

/** Starts (or extends) the cooldown for `key`: after a successful send, the default wait. */
export function startRequestCooldown(key: string | null | undefined, seconds = DEFAULT_REQUEST_COOLDOWN_SECONDS) {
  if (!key) return
  useUiStore().startCooldown(key, seconds)
}

/** After a failed send: a 429 starts the wait the API asked for. True when a cooldown started. */
export function startRequestCooldownFromError(key: string | null | undefined, error: unknown): boolean {
  if (!key || !isRateLimitedError(error)) return false
  startRequestCooldown(key, retryAfterSecondsFrom(error) ?? DEFAULT_REQUEST_COOLDOWN_SECONDS)
  return true
}

/** Seconds left on `key` right now (non-reactive; for request guards and messages). */
export function requestCooldownSecondsLeft(key: string | null | undefined): number {
  return key ? useUiStore().cooldownRemainingNow(key) : 0
}

/** Whether `key` is cooling down right now (non-reactive; for request guards). */
export function requestCooldownActive(key: string | null | undefined): boolean {
  return requestCooldownSecondsLeft(key) > 0
}

export type RequestCooldown = ReturnType<typeof useRequestCooldown>

/**
 * Reactive view of one limit. `key` is usually `cooldownKey(kind, identifier)`; null means
 * nothing to limit yet (no identifier typed). Returns the seconds left, whether it is active,
 * `start(seconds?)` after a successful send, `startFromError(error)` for a failure (true when
 * it was a 429 and a cooldown started), and `label(text)` for a button ("Resend code in 42s").
 */
export function useRequestCooldown(key: MaybeRefOrGetter<string | null | undefined>) {
  const store = useUiStore()
  store.syncCooldownClock()

  const remaining = computed(() => {
    const current = toValue(key)
    return current ? store.cooldownRemaining(current) : 0
  })
  const active = computed(() => remaining.value > 0)

  return {
    remaining,
    active,
    start: (seconds?: number) => startRequestCooldown(toValue(key), seconds),
    startFromError: (error: unknown) => startRequestCooldownFromError(toValue(key), error),
    label: (text: string) => cooldownLabel(text, remaining.value)
  }
}
