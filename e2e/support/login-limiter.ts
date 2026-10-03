import { test } from '@playwright/test'

// The example backends allow 20 password logins per 5 minutes per IP. On a backend without the
// dev invite and magic-link captures (SimpleRBAC), every disposable session is a password login,
// so a full run spends several windows' worth: how many depends only on the run's pace. A login
// the limiter refuses is therefore tried again until the limiter admits it, extending the running
// test's timeout by each wait, instead of failing a test over the pace.
//
// The limiter's window is fixed: it opens with its first login and closes 300 seconds later, and
// every refusal names the whole window (Retry-After: 300) however soon it closes. One wait of that
// length (what this helper did before) can land after the next window has opened and filled with
// other workers' logins, and be refused again: a SimpleRBAC release run failed that way. So a
// refused login is tried again every POLL_S seconds (sooner when the API names a shorter wait):
// it reaches a new window within seconds of its opening, and the waiting logins, at most one per
// worker, fit in the 20 it admits. After MAX_TOTAL_WAIT_S in all (two of the examples' windows)
// the last refusal is returned to the caller, which reports it.

const DEFAULT_WAIT_S = 60
const POLL_S = 15
const MAX_TOTAL_WAIT_S = 660
const MARGIN_S = 2
// Added to the running test's timeout at the first refusal: the work left after the login.
const AFTER_LOGIN_MS = 30_000

async function retryAfterSeconds(response: Response): Promise<number> {
  const header = Number(response.headers.get('retry-after'))
  if (Number.isFinite(header) && header > 0) return header
  const body = await response.clone().json().catch(() => null) as { details?: { retry_after_seconds?: number } } | null
  const seconds = Number(body?.details?.retry_after_seconds)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_WAIT_S
}

function extendRunningTest(ms: number) {
  try {
    const info = test.info()
    // 0 = no timeout; leave it so.
    if (info.timeout > 0) info.setTimeout(info.timeout + ms)
  } catch {
    // Not inside a test (global setup or teardown, a unit test): nothing to extend.
  }
}

/**
 * One password login (`attempt` sends POST /auth/login) that waits out the login limiter: a
 * refused attempt is tried again every few seconds until the limiter admits it, for at most
 * MAX_TOTAL_WAIT_S in all; the last refusal is returned when that runs out.
 */
export async function loginWithinLimiter(attempt: () => Promise<Response>): Promise<Response> {
  let response = await attempt()
  let waitedMs = 0
  while (response.status === 429 && waitedMs < MAX_TOTAL_WAIT_S * 1000) {
    const waitMs = Math.min(await retryAfterSeconds(response) + MARGIN_S, POLL_S, MAX_TOTAL_WAIT_S - waitedMs / 1000) * 1000
    extendRunningTest(waitMs + (waitedMs === 0 ? AFTER_LOGIN_MS : 0))
    await new Promise(resolve => setTimeout(resolve, waitMs))
    waitedMs += waitMs
    response = await attempt()
  }
  return response
}
