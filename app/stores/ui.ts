import { defineStore } from 'pinia'
import { onScopeDispose, ref } from 'vue'
import {
  DEFAULT_REQUEST_COOLDOWN_SECONDS,
  cooldownSecondsLeft,
  parseCooldownStore,
  pruneCooldowns,
  type CooldownEntries
} from '~/utils/request-cooldown'

// The console's one Pinia store: global, cross-route client state (ARCHITECTURE.md, layer 4).
// Server data never goes here; Pinia Colada owns it.
//
// Request cooldowns: per-identifier waits for requests the auth API rate-limits (sign-in codes,
// magic links, reset links, phone verification codes). One tab shares them, so the same email
// on the sign-in and recovery pages is one limit, and they are kept in sessionStorage, so a
// reload or Back cannot reset a Resend button into a lockout. Features read and start them
// through useRequestCooldown / startRequestCooldown* (composables/useRequestCooldown.ts), never
// through this store directly.
//
// Account pickers: whether an AppUserPicker has been opened in this tab, and by which account.
// useUserPicker (composables/useUserPicker.ts) is its only reader and writer.

export const REQUEST_COOLDOWN_STORAGE_KEY = 'outlabs-auth.request-cooldowns'

function readStoredCooldowns(now: number): CooldownEntries {
  try {
    if (typeof window === 'undefined') return {}
    return parseCooldownStore(window.sessionStorage.getItem(REQUEST_COOLDOWN_STORAGE_KEY), now)
  } catch {
    return {}
  }
}

function writeStoredCooldowns(entries: CooldownEntries) {
  try {
    if (typeof window === 'undefined') return
    window.sessionStorage.setItem(REQUEST_COOLDOWN_STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Storage unavailable: the cooldown still holds for this page's lifetime.
  }
}

export const useUiStore = defineStore('ui', () => {
  // ── Request cooldowns ──
  // key (cooldownKey(kind, identifier)) → epoch ms when another request may be sent.
  const cooldowns = ref<CooldownEntries>(readStoredCooldowns(Date.now()))
  // The clock countdown labels read. One ticker per tab advances it, and only while a
  // cooldown is running.
  const cooldownClock = ref(Date.now())
  let ticker: ReturnType<typeof setInterval> | undefined

  function anyCooldownRunning() {
    return Object.values(cooldowns.value).some(expiresAt => expiresAt > cooldownClock.value)
  }

  function stopTicker() {
    if (ticker === undefined) return
    clearInterval(ticker)
    ticker = undefined
  }

  function tick() {
    cooldownClock.value = Date.now()
    if (!anyCooldownRunning()) stopTicker()
  }

  function startTicker() {
    if (ticker === undefined && anyCooldownRunning()) ticker = setInterval(tick, 1000)
  }

  /** Re-reads the clock and resumes the countdown if a cooldown is running (a view mounting). */
  function syncCooldownClock() {
    cooldownClock.value = Date.now()
    startTicker()
  }

  /** Starts (or extends) the wait for `key`: `seconds` from now. */
  function startCooldown(key: string, seconds = DEFAULT_REQUEST_COOLDOWN_SECONDS) {
    cooldownClock.value = Date.now()
    cooldowns.value = { ...pruneCooldowns(cooldowns.value, cooldownClock.value), [key]: cooldownClock.value + seconds * 1000 }
    writeStoredCooldowns(cooldowns.value)
    startTicker()
  }

  /** Seconds left on `key` by the ticking clock: reactive, for countdown labels. */
  function cooldownRemaining(key: string): number {
    return cooldownSecondsLeft(cooldowns.value[key], cooldownClock.value)
  }

  /** Seconds left on `key` at this instant: for request guards between ticks. */
  function cooldownRemainingNow(key: string): number {
    return cooldownSecondsLeft(cooldowns.value[key], Date.now())
  }

  onScopeDispose(stopTicker)

  // ── Account pickers ──
  // The id of the account that first opened an AppUserPicker in this tab, or null. Every picker
  // observes the same unsearched account list, so they share one `enabled` (ARCHITECTURE.md
  // "One `enabled` per key") and none loads it before one has opened. Keyed to the account, so
  // after a sign-out, or with another account signed in, the pickers are unopened again.
  const userPickerOpenedBy = ref<string | null>(null)

  /** Records that `accountId` opened an account picker. */
  function markUserPickerOpened(accountId: string) {
    userPickerOpenedBy.value = accountId
  }

  return {
    cooldowns,
    cooldownClock,
    syncCooldownClock,
    startCooldown,
    cooldownRemaining,
    cooldownRemainingNow,
    userPickerOpenedBy,
    markUserPickerOpened
  }
})
