import { test } from '@playwright/test'

// The example backends allow 20 password logins per 5 minutes per IP. On a backend without the
// dev invite and magic-link captures (SimpleRBAC), every disposable session is a password login,
// so a full run can spend more than that in one window: how many depends only on the run's pace.
// A login the limiter refuses therefore waits the seconds the API names (extending the running
// test's timeout by as much) and is tried once more, instead of failing a test over the pace.
// A second refusal is returned to the caller, which reports it.

const DEFAULT_WAIT_S = 60
const MAX_WAIT_S = 330
const MARGIN_S = 2

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
    // Not inside a test (global setup or teardown): nothing to extend.
  }
}

/** One password login (`attempt` sends POST /auth/login) that waits out the login limiter once. */
export async function loginWithinLimiter(attempt: () => Promise<Response>): Promise<Response> {
  const first = await attempt()
  if (first.status !== 429) return first
  const waitMs = (Math.min(await retryAfterSeconds(first), MAX_WAIT_S) + MARGIN_S) * 1000
  extendRunningTest(waitMs + 30_000)
  await new Promise(resolve => setTimeout(resolve, waitMs))
  return attempt()
}
