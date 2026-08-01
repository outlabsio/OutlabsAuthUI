import { expect, test } from '@playwright/test'

import { e2eApiBaseURL } from './auth-personas'

type InviteCapture = {
  email: string
  token: string
  invite_url: string
}

function getCaptureDetail(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const record = payload as Record<string, unknown>
  const details = record.details

  if (details && typeof details === 'object') {
    const detail = (details as Record<string, unknown>).detail
    if (typeof detail === 'string') {
      return detail
    }
  }

  if (typeof record.detail === 'string') {
    return record.detail
  }

  if (typeof record.message === 'string') {
    return record.message
  }

  return null
}

async function fetchInviteCapture(email: string) {
  const response = await fetch(
    `${e2eApiBaseURL}/dev/auth/invite/latest?email=${encodeURIComponent(email)}`
  )
  const payload = (await response.json().catch(() => null)) as unknown

  return {
    ok: response.ok,
    status: response.status,
    detail: getCaptureDetail(payload),
    payload,
  }
}

export async function skipIfInviteCaptureDisabled() {
  const probe = await fetchInviteCapture('capture-probe@example.com')

  if (probe.status === 404 && probe.detail === 'Not found') {
    test.skip(
      true,
      'Invite debug capture is disabled on the enterprise fixture (enable INVITE_DEBUG_TOKENS in development).'
    )
  }
}

export async function waitForCapturedInvite(email: string) {
  let captured: InviteCapture | null = null

  await expect
    .poll(
      async () => {
        const result = await fetchInviteCapture(email)

        if (result.status === 404 && result.detail === 'Not found') {
          throw new Error('Invite debug capture is disabled.')
        }

        if (!result.ok || !result.payload || typeof result.payload !== 'object') {
          return null
        }

        const record = result.payload as Record<string, unknown>
        if (
          typeof record.token !== 'string' ||
          typeof record.invite_url !== 'string'
        ) {
          return null
        }

        captured = {
          email: String(record.email ?? email),
          token: record.token,
          invite_url: record.invite_url,
        }
        return captured
      },
      {
        timeout: 15_000,
      }
    )
    .not.toBeNull()

  if (!captured) {
    throw new Error(`No invite captured for ${email}`)
  }

  return captured
}
