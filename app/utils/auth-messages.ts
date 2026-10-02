import type { AccessCodeChannel } from '~/types/auth'
import { isWrongApplicationError, wrongApplicationMessage } from './frontend-profile'

// Copy for the guest surface's specific failures: OAuth callback error codes, magic-link
// verification failures, and provider display names. Pure, so each case is unit-tested.

export type AuthMessage = {
  title: string
  description: string
}

// Brand spellings for the providers the library ships (and a few common extras); anything
// else is capitalized.
const OAUTH_PROVIDER_LABELS: Record<string, string> = {
  apple: 'Apple',
  discord: 'Discord',
  facebook: 'Facebook',
  github: 'GitHub',
  gitlab: 'GitLab',
  google: 'Google',
  linkedin: 'LinkedIn',
  microsoft: 'Microsoft'
}

export function oauthProviderLabel(provider: string): string {
  const key = provider.trim().toLowerCase()
  return OAUTH_PROVIDER_LABELS[key] ?? (key.charAt(0).toUpperCase() + key.slice(1))
}

const ACCESS_CODE_CHANNEL_LABELS: Record<AccessCodeChannel, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  sms: 'SMS'
}

/**
 * Display name of an access-code channel. `standalone` (the default) is for labels and
 * buttons ("Email"); `inline` is for the middle of a sentence ("sent by email", "by SMS"),
 * so only the common noun is lowercased and brand names keep their spelling.
 */
export function accessCodeChannelLabel(channel: AccessCodeChannel, position: 'standalone' | 'inline' = 'standalone'): string {
  const label = ACCESS_CODE_CHANNEL_LABELS[channel] ?? channel
  return position === 'inline' && channel === 'email' ? label.toLowerCase() : label
}

/**
 * Title and next step for an ?oauth_error= (or an account-link ?link_error=) code: the codes
 * the backend's OAuth callback appends when it redirects back to the sign-in page
 * (wrong_application, unknown_account, account_exists, inactive, invalid_state, provider,
 * auth). Any other code gets a generic message.
 */
export function oauthErrorMessage(code: string, frontendProfileKey?: string): AuthMessage {
  switch (code) {
    case 'wrong_application':
      return { title: 'This console cannot sign you in', description: wrongApplicationMessage(frontendProfileKey) }
    case 'unknown_account':
      return {
        title: 'No account uses that sign-in',
        description: 'That provider account is not linked to an invitation here. Ask an administrator to invite you, then sign in with the invited email.'
      }
    case 'account_exists':
      return {
        title: 'You already have an account',
        description: 'An account with that email already exists. Sign in with your email first, then link the provider from your Account page.'
      }
    case 'inactive':
      return {
        title: 'This account cannot sign in yet',
        description: 'The account is invited, suspended or locked. Accept your invitation email, or ask an administrator to reactivate it.'
      }
    case 'invalid_state':
      return {
        title: 'The sign-in expired',
        description: 'The provider sign-in took too long or was finished in another browser. Start again from this page.'
      }
    case 'provider':
      return {
        title: 'The provider did not complete the sign-in',
        description: 'It was cancelled or the provider reported an error. Try again, or sign in another way.'
      }
    case 'auth':
      return {
        title: 'Sign-in could not be completed',
        description: 'The auth server refused this sign-in. Try again, or sign in another way.'
      }
    default:
      return {
        title: 'Sign-in could not be completed',
        description: 'Signing in with that provider did not work. Try again, or sign in another way.'
      }
  }
}

export type MagicLinkFailure = AuthMessage & {
  // Offer "Request a new link": the link itself is the problem (expired, used, invalid).
  requestNewLink: boolean
  // Offer "Try again": nothing was consumed (no answer, rate limit, server error).
  retry: boolean
}

function errorCode(data: unknown): string {
  if (data == null || typeof data !== 'object') return ''
  const payload = data as { error?: unknown, code?: unknown }
  return typeof payload.error === 'string' ? payload.error : typeof payload.code === 'string' ? payload.code : ''
}

function errorText(data: unknown): string {
  if (data == null || typeof data !== 'object') return ''
  const payload = data as { message?: unknown, detail?: unknown }
  if (typeof payload.message === 'string') return payload.message
  return typeof payload.detail === 'string' ? payload.detail : ''
}

/** What to tell someone whose magic link did not sign them in (from the verify failure). */
export function magicLinkFailure(error: unknown, frontendProfileKey?: string): MagicLinkFailure {
  if (isWrongApplicationError(error)) {
    return { title: 'This console cannot sign you in', description: wrongApplicationMessage(frontendProfileKey), requestNewLink: false, retry: false }
  }
  const { status, data, kind } = (error ?? {}) as { status?: unknown, data?: unknown, kind?: unknown }
  const code = errorCode(data)
  const text = errorText(data)

  if (kind === 'network' || kind === 'timeout' || status === 0 || (typeof status === 'number' && status >= 500)) {
    return {
      title: 'Could not reach the sign-in service',
      description: 'Your link has not been used. Check your connection and try again.',
      requestNewLink: false,
      retry: true
    }
  }
  if (status === 429) {
    return { title: 'Please wait a moment', description: 'Too many attempts. Your link has not been used; try again shortly.', requestNewLink: false, retry: true }
  }
  if (status === 404) {
    return { title: 'Sign-in links are turned off', description: 'This server no longer accepts sign-in links. Sign in another way.', requestNewLink: false, retry: false }
  }
  if (code === 'ACCOUNT_LOCKED' || code === 'ACCOUNT_INACTIVE') {
    return { title: 'This account cannot sign in', description: text || 'The account is locked or inactive. Contact your administrator.', requestNewLink: false, retry: false }
  }
  if (code === 'TOKEN_EXPIRED') {
    return { title: 'This link has expired', description: 'Sign-in links only work for a short time. Request a new one.', requestNewLink: true, retry: false }
  }
  if (/already been used/i.test(text)) {
    return { title: 'This link was already used', description: 'Each sign-in link works once. Request a new one.', requestNewLink: true, retry: false }
  }
  return {
    title: 'This link is not valid',
    description: 'It may be incomplete, or a newer link replaced it. Request a new one.',
    requestNewLink: true,
    retry: false
  }
}

/**
 * The backend's password-policy refusal (INVALID_PASSWORD, with details.password_requirements),
 * as the message to show on the new-password field: the server's reason, followed by the
 * whole policy when the server lists it; null for any other failure.
 */
export function passwordPolicyError(error: unknown): string | null {
  const { data } = (error ?? {}) as { data?: unknown }
  if (data == null || typeof data !== 'object') return null
  const payload = data as { error?: unknown, message?: unknown, details?: unknown, detail?: unknown }
  const details = (payload.details ?? payload.detail) as { password_requirements?: unknown } | undefined
  const isPolicy = payload.error === 'INVALID_PASSWORD' || (details != null && typeof details === 'object' && 'password_requirements' in details)
  if (!isPolicy) return null
  const reason = typeof payload.message === 'string' && payload.message.trim() ? payload.message.trim() : 'Choose a stronger password.'
  const policy = passwordRequirementsSummary(details?.password_requirements)
  return policy ? `${reason.replace(/\.?$/, '.')} ${policy}` : reason
}

/**
 * The server's password policy (details.password_requirements: min_length, require_uppercase,
 * require_lowercase, require_digit, require_special_char) as one sentence, e.g. "It needs at
 * least 10 characters, an uppercase letter, a digit and a symbol." Null when nothing is listed.
 */
export function passwordRequirementsSummary(requirements: unknown): string | null {
  if (requirements == null || typeof requirements !== 'object') return null
  const r = requirements as Record<string, unknown>
  const parts: string[] = []
  if (typeof r.min_length === 'number' && r.min_length > 0) parts.push(`at least ${r.min_length} characters`)
  if (r.require_uppercase === true) parts.push('an uppercase letter')
  if (r.require_lowercase === true) parts.push('a lowercase letter')
  if (r.require_digit === true) parts.push('a digit')
  if (r.require_special_char === true) parts.push('a symbol')
  if (!parts.length) return null
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
  return `It needs ${list}.`
}
