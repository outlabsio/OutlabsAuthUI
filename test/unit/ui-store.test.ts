import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REQUEST_COOLDOWN_STORAGE_KEY, useUiStore } from '~/stores/ui'
import {
  requestCooldownActive,
  requestCooldownSecondsLeft,
  startRequestCooldown,
  startRequestCooldownFromError,
  useRequestCooldown
} from '~/composables/useRequestCooldown'

const NOW = Date.UTC(2026, 8, 30, 12, 0, 0)

function memoryStorage() {
  const items = new Map<string, string>()
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key)
  }
}

describe('ui store: request cooldowns', () => {
  let sessionStorage: ReturnType<typeof memoryStorage>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    sessionStorage = memoryStorage()
    vi.stubGlobal('window', { sessionStorage })
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts a started cooldown down with the tab clock and stops at zero', () => {
    const resend = useRequestCooldown(() => 'code:email:admin@acme.com')
    expect(resend.active.value).toBe(false)

    resend.start()
    expect(resend.remaining.value).toBe(60)
    expect(resend.label('Resend code')).toBe('Resend code in 60s')

    vi.advanceTimersByTime(30_000)
    expect(resend.remaining.value).toBe(30)

    vi.advanceTimersByTime(30_000)
    expect(resend.active.value).toBe(false)
    expect(resend.label('Resend code')).toBe('Resend code')
    // The ticker stops once nothing is cooling down.
    expect(vi.getTimerCount()).toBe(0)
  })

  it('shares one limit per key across every view in the tab', () => {
    const signIn = useRequestCooldown(() => 'magic-link:admin@acme.com')
    const recovery = useRequestCooldown(() => 'magic-link:admin@acme.com')
    const other = useRequestCooldown(() => 'magic-link:agent@sf.acme.com')

    startRequestCooldown('magic-link:admin@acme.com', 20)
    expect(signIn.remaining.value).toBe(20)
    expect(recovery.remaining.value).toBe(20)
    expect(other.active.value).toBe(false)
    expect(requestCooldownActive('magic-link:admin@acme.com')).toBe(true)
    expect(requestCooldownSecondsLeft('magic-link:admin@acme.com')).toBe(20)
    expect(requestCooldownSecondsLeft(null)).toBe(0)
  })

  it('starts the wait a 429 asked for, and ignores other failures', () => {
    expect(startRequestCooldownFromError('verify:+15550001', { status: 400, data: {} })).toBe(false)
    expect(requestCooldownActive('verify:+15550001')).toBe(false)

    expect(startRequestCooldownFromError('verify:+15550001', { status: 429, data: { details: { retry_after_seconds: 42 } } })).toBe(true)
    expect(requestCooldownSecondsLeft('verify:+15550001')).toBe(42)

    // A 429 without a stated wait falls back to the default minute.
    expect(startRequestCooldownFromError('verify:+15550002', { status: 429, data: null })).toBe(true)
    expect(requestCooldownSecondsLeft('verify:+15550002')).toBe(60)
  })

  it('does nothing without a key', () => {
    const idle = useRequestCooldown(() => null)
    idle.start()
    expect(idle.active.value).toBe(false)
    expect(Object.keys(useUiStore().cooldowns)).toEqual([])
  })

  it('keeps running cooldowns across a reload and drops expired ones', () => {
    startRequestCooldown('code:sms:+15550001', 45)
    startRequestCooldown('code:whatsapp:+15550001', 5)
    expect(JSON.parse(sessionStorage.getItem(REQUEST_COOLDOWN_STORAGE_KEY) ?? '{}')).toEqual({
      'code:sms:+15550001': NOW + 45_000,
      'code:whatsapp:+15550001': NOW + 5_000
    })

    vi.advanceTimersByTime(10_000)
    // A reload: a fresh store reads sessionStorage.
    setActivePinia(createPinia())
    const store = useUiStore()
    expect(store.cooldowns).toEqual({ 'code:sms:+15550001': NOW + 45_000 })
    expect(useRequestCooldown(() => 'code:sms:+15550001').remaining.value).toBe(35)
  })

  it('works without sessionStorage', () => {
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: () => {
          throw new Error('blocked')
        },
        setItem: () => {
          throw new Error('blocked')
        }
      }
    })
    setActivePinia(createPinia())
    startRequestCooldown('reset-link:admin@acme.com')
    expect(requestCooldownSecondsLeft('reset-link:admin@acme.com')).toBe(60)
  })
})

describe('ui store: account-picker latch', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { sessionStorage: memoryStorage() })
    setActivePinia(createPinia())
  })

  it('starts unopened and records the account that opened a picker', () => {
    const store = useUiStore()
    expect(store.userPickerOpenedBy).toBeNull()
    store.markUserPickerOpened('account-a')
    expect(store.userPickerOpenedBy).toBe('account-a')
    // Another account opening one takes the latch over.
    store.markUserPickerOpened('account-b')
    expect(store.userPickerOpenedBy).toBe('account-b')
  })

  it('lives in memory only: a reload starts unopened', () => {
    useUiStore().markUserPickerOpened('account-a')
    setActivePinia(createPinia())
    expect(useUiStore().userPickerOpenedBy).toBeNull()
  })
})
