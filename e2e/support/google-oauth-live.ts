import { test } from '@playwright/test'

function liveGoogleEnabled() {
  return process.env.E2E_LIVE_GOOGLE?.trim().toLowerCase() === '1'
}

export function skipUnlessLiveGoogleOAuthConfigured() {
  if (!liveGoogleEnabled()) {
    test.skip(
      true,
      'Set E2E_LIVE_GOOGLE=1 to run the opt-in live Google OAuth suite (backend must mount Google with GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).'
    )
  }
}
