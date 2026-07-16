import { expect, test } from '@playwright/test'

import { e2eApiBaseURL } from './auth-personas'

type MagicLinkCapture = {
  email: string
  token: string
  magic_link_url: string
}

type AccessCodeCapture = {
  email: string
  phone?: string | null
  code: string
  access_code_url: string
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

async function fetchCaptureEndpoint(
  path: string,
  params: { email?: string; phone?: string }
) {
  const search = new URLSearchParams()

  if (params.email) {
    search.set('email', params.email)
  }

  if (params.phone) {
    search.set('phone', params.phone)
  }

  const response = await fetch(`${e2eApiBaseURL}${path}?${search.toString()}`)
  const payload = (await response.json().catch(() => null)) as unknown

  return {
    ok: response.ok,
    status: response.status,
    detail: getCaptureDetail(payload),
    payload,
  }
}

export async function skipIfPasswordlessCaptureDisabled(
  kind: 'magic-link' | 'access-code'
) {
  const path =
    kind === 'magic-link'
      ? '/dev/auth/magic-link/latest'
      : '/dev/auth/access-code/latest'
  const probe = await fetchCaptureEndpoint(path, {
    email: 'capture-probe@example.com',
  })

  if (probe.status === 404 && probe.detail === 'Not found') {
    test.skip(
      true,
      `${kind} debug capture is disabled on the enterprise fixture (enable MAGIC_LINK_DEBUG_TOKENS / ACCESS_CODE_DEBUG_CODES in development).`
    )
  }
}

export async function waitForCapturedMagicLink(email: string) {
  let captured: MagicLinkCapture | null = null

  await expect
    .poll(
      async () => {
        const result = await fetchCaptureEndpoint(
          '/dev/auth/magic-link/latest',
          { email }
        )

        if (result.status === 404 && result.detail === 'Not found') {
          throw new Error('Magic-link debug capture is disabled.')
        }

        if (!result.ok || !result.payload || typeof result.payload !== 'object') {
          return null
        }

        const record = result.payload as Record<string, unknown>
        if (
          typeof record.token !== 'string' ||
          typeof record.magic_link_url !== 'string'
        ) {
          return null
        }

        captured = {
          email: String(record.email ?? email),
          token: record.token,
          magic_link_url: record.magic_link_url,
        }
        return captured
      },
      {
        timeout: 15_000,
      }
    )
    .not.toBeNull()

  if (!captured) {
    throw new Error(`No magic link captured for ${email}`)
  }

  return captured
}

export async function waitForCapturedAccessCode(
  identifier: { email: string } | { phone: string }
) {
  let captured: AccessCodeCapture | null = null
  const lookupLabel =
    'email' in identifier ? identifier.email : identifier.phone

  await expect
    .poll(
      async () => {
        const result = await fetchCaptureEndpoint(
          '/dev/auth/access-code/latest',
          identifier
        )

        if (result.status === 404 && result.detail === 'Not found') {
          throw new Error('Access-code debug capture is disabled.')
        }

        if (!result.ok || !result.payload || typeof result.payload !== 'object') {
          return null
        }

        const record = result.payload as Record<string, unknown>
        if (typeof record.code !== 'string') {
          return null
        }

        if (
          'phone' in identifier &&
          String(record.phone ?? '') !== identifier.phone
        ) {
          return null
        }

        captured = {
          email: String(record.email ?? ''),
          phone:
            typeof record.phone === 'string' || record.phone === null
              ? record.phone
              : null,
          code: record.code,
          access_code_url: String(record.access_code_url ?? ''),
        }
        return captured
      },
      {
        timeout: 15_000,
      }
    )
    .not.toBeNull()

  if (!captured) {
    throw new Error(`No access code captured for ${lookupLabel}`)
  }

  return captured
}
