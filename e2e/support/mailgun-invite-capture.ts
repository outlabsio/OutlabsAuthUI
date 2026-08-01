import { expect, test } from '@playwright/test'

type MailgunEventItem = {
  event?: string
  timestamp?: number
  recipient?: string
  tags?: string[]
  'user-variables'?: Record<string, unknown>
  message?: {
    headers?: Record<string, string>
  }
}

function liveMailEnabled() {
  return process.env.E2E_LIVE_MAIL?.trim().toLowerCase() === '1'
}

function getMailgunConfig() {
  const apiKey = process.env.MAILGUN_API_KEY?.trim()
  const domain = process.env.MAILGUN_DOMAIN?.trim()
  const baseUrl = (
    process.env.MAILGUN_API_BASE_URL?.trim() || 'https://api.mailgun.net'
  ).replace(/\/+$/, '')
  const override =
    process.env.MAIL_RECIPIENT_OVERRIDE?.trim() ||
    process.env.MAILGUN_RECIPIENT_OVERRIDE?.trim()

  return { apiKey, domain, baseUrl, override }
}

export function skipUnlessLiveMailgunInviteConfigured() {
  if (!liveMailEnabled()) {
    test.skip(
      true,
      'Set E2E_LIVE_MAIL=1 to run the opt-in live Mailgun invite suite.'
    )
  }

  const { apiKey, domain, override } = getMailgunConfig()
  if (!apiKey || !domain || !override) {
    test.skip(
      true,
      'Live Mailgun invite E2E needs MAILGUN_API_KEY, MAILGUN_DOMAIN, and MAIL_RECIPIENT_OVERRIDE (or MAILGUN_RECIPIENT_OVERRIDE).'
    )
  }
}

function eventMatchesInvite(
  item: MailgunEventItem,
  intendedRecipient: string,
  beginUnix: number
) {
  if ((item.timestamp ?? 0) < beginUnix - 5) {
    return false
  }

  const tags = item.tags ?? []
  if (!tags.includes('invite') && !tags.includes('enterprise-example')) {
    // Still allow match via intended recipient metadata alone.
  }

  const userVariables = item['user-variables'] ?? {}
  const intended = userVariables.intended_recipient
  if (typeof intended === 'string' && intended.toLowerCase() === intendedRecipient) {
    return true
  }

  // Some Mailgun payloads JSON-encode user variables.
  if (
    typeof intended === 'string' &&
    intended.replace(/^"|"$/g, '').toLowerCase() === intendedRecipient
  ) {
    return true
  }

  return false
}

export async function waitForMailgunInviteAccepted(intendedRecipient: string) {
  const { apiKey, domain, baseUrl } = getMailgunConfig()
  if (!apiKey || !domain) {
    throw new Error('Mailgun credentials are required for live mail polling.')
  }

  const beginUnix = Math.floor(Date.now() / 1000) - 30
  const auth = Buffer.from(`api:${apiKey}`).toString('base64')
  let matched: MailgunEventItem | null = null

  await expect
    .poll(
      async () => {
        const url = new URL(`${baseUrl}/v3/${domain}/events`)
        url.searchParams.set('begin', String(beginUnix))
        url.searchParams.set('ascending', 'yes')
        url.searchParams.set('limit', '50')
        url.searchParams.set('event', 'accepted')

        const response = await fetch(url, {
          headers: {
            Authorization: `Basic ${auth}`,
          },
        })

        if (!response.ok) {
          return null
        }

        const payload = (await response.json()) as {
          items?: MailgunEventItem[]
        }
        const items = payload.items ?? []
        matched =
          items.find((item) =>
            eventMatchesInvite(item, intendedRecipient.toLowerCase(), beginUnix)
          ) ?? null
        return matched
      },
      {
        timeout: 60_000,
        intervals: [1_000, 2_000, 3_000, 5_000],
      }
    )
    .not.toBeNull()

  if (!matched) {
    throw new Error(
      `No Mailgun accepted event found for intended recipient ${intendedRecipient}`
    )
  }

  return matched
}
