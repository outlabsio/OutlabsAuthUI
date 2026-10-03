import { normalizeApiError } from '~/api/errors'
import type { AccessCodeChannel, RegistrationMode } from '~/types/auth'
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
 * Title and next step for an ?oauth_error= code: the codes the backend's OAuth sign-in callback
 * appends when it redirects back to the sign-in page (wrong_application, unknown_account,
 * account_exists, inactive, invalid_state, provider, auth). Any other code gets a generic
 * message. Account linking has its own codes: oauthLinkErrorMessage.
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

/** A failed account link a redirect landed with: its code and the provider's key, when named. */
export type AccountLinkFailure = { code: string, provider: string | null }

/**
 * The failure in an account-link landing (`?link_error=<code>&provider=<name>`, which
 * outlabs-auth 0.1.0a35's associate callback sends back), or null when there is none. The
 * provider is kept only when it reads as a provider key (letters, digits, `-`, `_`), so a
 * crafted link cannot put its own words into the message.
 */
export function accountLinkFailure(linkError: unknown, provider: unknown): AccountLinkFailure | null {
  const code = typeof linkError === 'string' ? linkError.trim() : ''
  if (!code) return null
  const key = typeof provider === 'string' ? provider.trim().toLowerCase() : ''
  return { code, provider: /^[a-z0-9][a-z0-9_-]{0,63}$/.test(key) ? key : null }
}

/**
 * Title and next step for a failed account link (Account › Connected accounts): the codes
 * outlabs-auth 0.1.0a35's associate callback sends as `?link_error=` (cancelled, already_linked,
 * provider_conflict, invalid_state, provider, auth). `provider` is the provider's display name,
 * or null when the redirect named none. Any other code gets a generic message.
 */
export function oauthLinkErrorMessage(code: string, provider?: string | null): AuthMessage {
  const name = provider?.trim() || null
  switch (code) {
    case 'cancelled':
      return {
        title: 'Linking was cancelled',
        description: `You cancelled at ${name ?? 'the provider'}. Nothing changed. Link again when you are ready.`
      }
    case 'already_linked':
      return {
        title: name ? `That ${name} account belongs to someone else` : 'That account belongs to someone else',
        description: `It is already linked to another account here. Sign in to that account and unlink it there, or link a different ${name ? `${name} account` : 'account'}.`
      }
    case 'provider_conflict':
      return {
        title: name ? `Another ${name} account is already linked` : 'Another account from this provider is already linked',
        description: `Your account already has a different ${name ? `${name} account` : 'account from this provider'} linked. Unlink it first, then link this one.`
      }
    case 'invalid_state':
      return {
        title: 'The link request expired',
        description: 'It took too long or was finished in another browser. Start again from this page.'
      }
    case 'provider':
      return {
        title: `${name ?? 'The provider'} did not complete the link`,
        description: 'The provider reported an error. Try again, or link it later.'
      }
    case 'auth':
      return {
        title: 'The server refused the link',
        description: 'Your account could not be confirmed. Sign in again and retry; if it keeps failing, ask an administrator.'
      }
    default:
      return {
        title: 'Could not link the account',
        description: `Linking ${name ? `your ${name} account` : 'the account'} did not work. Try again, or link it later.`
      }
  }
}

/**
 * What the signup page says where the backend does not accept self-registration
 * (registration_mode invite_only or closed): how someone gets an account there instead.
 */
export function signupClosedMessage(mode: Exclude<RegistrationMode, 'open'>): AuthMessage {
  return mode === 'invite_only'
    ? { title: 'Sign-up is by invitation', description: 'Ask an administrator to invite you. The invitation email has a link to set your password.' }
    : { title: 'Accounts are created by an administrator', description: 'Ask an administrator for an account.' }
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

/**
 * A one-time code the server refused (wrong, expired or already used), as the message for the
 * code field, where it stays after the boxes are cleared for the next attempt. Null for failures
 * that are not about the code itself, which are reported elsewhere: a rate limit (a toast and the
 * button's countdown), the network or the server (a toast), a console this account may not use
 * (inline), a locked or inactive account (a toast with the server's reason).
 */
export function codeFieldError(error: unknown): string | null {
  if (isWrongApplicationError(error)) return null
  const normalized = normalizeApiError(error)
  if (normalized.sessionEnded || normalized.code?.startsWith('ACCOUNT_')) return null
  if (normalized.code === 'TOKEN_EXPIRED') return 'This code has expired. Resend the code to get a new one.'
  if (normalized.kind === 'unauthorized' || normalized.code === 'TOKEN_INVALID') {
    return 'This code is wrong or has expired. Check it and try again, or resend the code.'
  }
  return null
}
