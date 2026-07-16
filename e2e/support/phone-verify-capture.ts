import { expect, test } from '@playwright/test'

import { e2eApiBaseURL } from './auth-personas'

type PhoneVerifyCapture = {
  email: string
  phone: string
  code: string
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

async function fetchPhoneVerifyCapture(email: string) {
  const response = await fetch(
    `${e2eApiBaseURL}/dev/auth/phone-verify/latest?email=${encodeURIComponent(email)}`
  )
  const payload = (await response.json().catch(() => null)) as unknown

  return {
    ok: response.ok,
    status: response.status,
    detail: getCaptureDetail(payload),
    payload,
  }
}

export async function skipIfPhoneVerifyCaptureDisabled() {
  const probe = await fetchPhoneVerifyCapture('capture-probe@example.com')

  if (probe.status === 404 && probe.detail === 'Not found') {
    test.skip(
      true,
      'Phone-verify debug capture is disabled on the enterprise fixture (enable PHONE_VERIFY_DEBUG_CODES in development).'
    )
  }
}

export async function waitForCapturedPhoneVerifyCode(
  email: string,
  options: { phone?: string } = {}
) {
  let captured: PhoneVerifyCapture | null = null

  await expect
    .poll(
      async () => {
        const result = await fetchPhoneVerifyCapture(email)

        if (result.status === 404 && result.detail === 'Not found') {
          throw new Error('Phone-verify debug capture is disabled.')
        }

        if (!result.ok || !result.payload || typeof result.payload !== 'object') {
          return null
        }

        const record = result.payload as Record<string, unknown>
        if (typeof record.code !== 'string') {
          return null
        }

        const phone = String(record.phone ?? '')
        if (options.phone && phone !== options.phone) {
          return null
        }

        captured = {
          email: String(record.email ?? email),
          phone,
          code: record.code,
        }
        return captured
      },
      {
        timeout: 15_000,
      }
    )
    .not.toBeNull()

  if (!captured) {
    throw new Error(`No phone verification code captured for ${email}`)
  }

  return captured
}
