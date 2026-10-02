// Cross-tab mutual exclusion for refresh-token use. Tabs share one refresh token through
// localStorage, and the backend treats a second use of a rotated refresh token as theft (it
// revokes every session of the user). Every refresh — and a sign-out that may need one — runs
// inside this lock so only one tab presents a given refresh token.
//
// Web Locks (navigator.locks) is the primary mechanism. Browsers or contexts without it (older
// Safari, plain-http deployments, which are not secure contexts) fall back to a short
// localStorage lease that other tabs observe.

export const REFRESH_LOCK_NAME = 'outlabs-auth-refresh'
const LEASE_KEY = 'outlabs-auth.refresh-lock'

// Holders only run bounded work (requests carry their own timeouts), so these are ceilings.
const MAX_WAIT_MS = 35_000
const LEASE_MS = 35_000

export type LockContext = {
  // True when another holder had the lock first: whatever it did with the shared refresh
  // token happened before this callback runs.
  waited: boolean
}

export class RefreshLockTimeoutError extends Error {
  constructor() {
    super('Timed out waiting for another tab to renew the session.')
    this.name = 'RefreshLockTimeoutError'
  }
}

type Lease = { id: string, expiresAt: number }

export type LeaseLockOptions = {
  key?: string
  leaseMs?: number
  maxWaitMs?: number
  settleMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

function defaultSleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

function readLease(raw: string | null): Lease | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<Lease>
    return typeof parsed.id === 'string' && typeof parsed.expiresAt === 'number' ? { id: parsed.id, expiresAt: parsed.expiresAt } : null
  } catch {
    return null
  }
}

function randomId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Storage-lease fallback. A tab claims a free or expired lease, waits `settleMs` for competing
 * writes to land, and proceeds only if the lease still carries its id (last writer wins).
 * Exported for unit tests; production code calls withRefreshLock.
 */
export async function withLeaseLock<T>(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  fn: (context: LockContext) => Promise<T>,
  options: LeaseLockOptions = {}
): Promise<T> {
  const {
    key = LEASE_KEY,
    leaseMs = LEASE_MS,
    maxWaitMs = MAX_WAIT_MS,
    settleMs = 25,
    now = Date.now,
    sleep = defaultSleep
  } = options
  const id = randomId()
  const deadline = now() + maxWaitMs
  let waited = false

  for (;;) {
    const holder = readLease(storage.getItem(key))
    if (!holder || holder.expiresAt <= now()) {
      storage.setItem(key, JSON.stringify({ id, expiresAt: now() + leaseMs }))
      await sleep(settleMs)
      if (readLease(storage.getItem(key))?.id === id) break
    }
    waited = true
    if (now() >= deadline) throw new RefreshLockTimeoutError()
    await sleep(40 + Math.floor(Math.random() * 80))
  }

  try {
    return await fn({ waited })
  } finally {
    if (readLease(storage.getItem(key))?.id === id) storage.removeItem(key)
  }
}

type WebLocks = {
  request: <T>(
    name: string,
    options: { ifAvailable?: boolean, signal?: AbortSignal },
    callback: (lock: unknown) => Promise<T>
  ) => Promise<T>
}

function webLocks(): WebLocks | null {
  if (typeof navigator === 'undefined') return null
  const locks = (navigator as Navigator & { locks?: WebLocks }).locks
  return locks && typeof locks.request === 'function' ? locks : null
}

/** Runs `fn` while holding the cross-tab refresh lock. */
export async function withRefreshLock<T>(fn: (context: LockContext) => Promise<T>): Promise<T> {
  const locks = webLocks()
  if (!locks) {
    return typeof window !== 'undefined'
      ? withLeaseLock(window.localStorage, fn)
      : fn({ waited: false })
  }

  // Try without queueing first so the callback learns whether another tab held the lock.
  const immediate = await locks.request(REFRESH_LOCK_NAME, { ifAvailable: true }, async lock =>
    lock ? { value: await fn({ waited: false }) } : null
  )
  if (immediate) return immediate.value

  // The signal only bounds the wait; once granted, the holder's own request timeouts apply.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MAX_WAIT_MS)
  let granted = false
  try {
    return await locks.request(REFRESH_LOCK_NAME, { signal: controller.signal }, () => {
      granted = true
      clearTimeout(timer)
      return fn({ waited: true })
    })
  } catch (error) {
    if (!granted && controller.signal.aborted) throw new RefreshLockTimeoutError()
    throw error
  } finally {
    clearTimeout(timer)
  }
}
