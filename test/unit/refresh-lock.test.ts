import { describe, expect, it } from 'vitest'
import { RefreshLockTimeoutError, withLeaseLock } from '../../app/auth/refresh-lock'

// The storage-lease fallback used when navigator.locks is unavailable. Tabs share one
// localStorage; here several holders share one in-memory storage.
function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    map
  }
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

describe('withLeaseLock', () => {
  it('never lets two holders overlap', async () => {
    const storage = memoryStorage()
    const events: string[] = []
    let active = 0
    let maxActive = 0

    await Promise.all(Array.from({ length: 5 }, (_, i) => withLeaseLock(storage, async () => {
      active++
      maxActive = Math.max(maxActive, active)
      events.push(`start-${i}`)
      await sleep(15)
      events.push(`end-${i}`)
      active--
    }, { settleMs: 5 })))

    expect(maxActive).toBe(1)
    expect(events).toHaveLength(10)
    for (let i = 0; i < events.length; i += 2) {
      expect(events[i]!.replace('start-', '')).toBe(events[i + 1]!.replace('end-', ''))
    }
    expect(storage.map.size).toBe(0)
  })

  it('tells a holder whether it had to wait for another', async () => {
    const storage = memoryStorage()
    const waits: boolean[] = []
    await Promise.all([
      withLeaseLock(storage, async ({ waited }) => {
        waits.push(waited)
        await sleep(30)
      }, { settleMs: 5 }),
      sleep(10).then(() => withLeaseLock(storage, async ({ waited }) => {
        waits.push(waited)
      }, { settleMs: 5 }))
    ])
    expect(waits).toEqual([false, true])
  })

  it('takes over an expired lease left by a closed tab', async () => {
    const storage = memoryStorage()
    storage.setItem('outlabs-auth.refresh-lock', JSON.stringify({ id: 'closed-tab', expiresAt: Date.now() - 1 }))
    const result = await withLeaseLock(storage, async ({ waited }) => waited, { settleMs: 5 })
    expect(result).toBe(false)
  })

  it('gives up after the wait ceiling instead of hanging', async () => {
    const storage = memoryStorage()
    storage.setItem('outlabs-auth.refresh-lock', JSON.stringify({ id: 'busy-tab', expiresAt: Date.now() + 60_000 }))
    await expect(withLeaseLock(storage, async () => 'ran', { settleMs: 5, maxWaitMs: 150 })).rejects.toBeInstanceOf(RefreshLockTimeoutError)
  })

  it('releases the lease when the holder throws', async () => {
    const storage = memoryStorage()
    await expect(withLeaseLock(storage, async () => {
      throw new Error('boom')
    }, { settleMs: 5 })).rejects.toThrow('boom')
    expect(storage.map.size).toBe(0)
  })
})
