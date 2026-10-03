import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loginWithinLimiter } from '../../e2e/support/login-limiter'

// The E2E harness's password logins wait out the backend's login limiter
// (e2e/support/login-limiter.ts). The example backends' limiter has a fixed 300-second window
// and names all of it on every refusal, so a single long wait can be refused again by a window
// other workers already filled: a SimpleRBAC release run failed on exactly that.

const refused = (retryAfter = 300) => new Response(
  JSON.stringify({ error: 'RATE_LIMIT_EXCEEDED', details: { retry_after_seconds: retryAfter } }),
  { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) } }
)
const admitted = () => new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r' }), { status: 200 })

/** An `attempt` that answers with `responses` in turn (the last one from then on), counting calls. */
function attempts(...responses: Array<() => Response>) {
  const calls: number[] = []
  const attempt = vi.fn(async () => {
    calls.push(Date.now())
    return responses[Math.min(calls.length - 1, responses.length - 1)]!()
  })
  return { attempt, calls }
}

describe('loginWithinLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns an admitted login at once', async () => {
    const { attempt } = attempts(admitted)
    await expect(loginWithinLimiter(attempt)).resolves.toHaveProperty('status', 200)
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('keeps trying a refused login until the limiter admits it, not just once more', async () => {
    const { attempt } = attempts(refused, refused, refused, admitted)
    const login = loginWithinLimiter(attempt)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    await expect(login).resolves.toHaveProperty('status', 200)
    expect(attempt).toHaveBeenCalledTimes(4)
  })

  it('tries again within seconds, not after the whole window the refusal names', async () => {
    const { attempt, calls } = attempts(refused, admitted)
    const start = Date.now()
    const login = loginWithinLimiter(attempt)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(attempt).toHaveBeenCalledTimes(2)
    expect(calls[1]! - start).toBe(15_000)
    await expect(login).resolves.toHaveProperty('status', 200)
  })

  it('waits a shorter Retry-After as named, with a small margin', async () => {
    const { attempt, calls } = attempts(() => refused(3), admitted)
    const start = Date.now()
    const login = loginWithinLimiter(attempt)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(attempt).toHaveBeenCalledTimes(2)
    expect(calls[1]! - start).toBe(5_000)
    await expect(login).resolves.toHaveProperty('status', 200)
  })

  it('gives up after two windows and returns the refusal for the caller to report', async () => {
    const { attempt, calls } = attempts(refused)
    const start = Date.now()
    const login = loginWithinLimiter(attempt)
    await vi.advanceTimersByTimeAsync(20 * 60_000)
    await expect(login).resolves.toHaveProperty('status', 429)
    expect(calls.at(-1)! - start).toBe(660_000)
    expect(attempt).toHaveBeenCalledTimes(1 + 660 / 15)
  })
})
