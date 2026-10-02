import type { AccessCodeChannel } from '~/types/auth'

// The sign-in (or recovery) step a tab is waiting on — a code or link already requested — kept
// in sessionStorage (this tab only) so a reload, or Back/Forward through the steps, never
// forces a new request against the backend's small per-identifier limit. It holds only what
// the step displays (the phone number, the email, the channel), never a code or token, and
// expires with the codes themselves.

export type AuthFlow = 'sign-in' | 'recovery'

export type PendingChallenge = {
  // Phone number chosen on the phone step (the channel step reads it).
  phone?: string
  // A code that was requested (or that the user says they already have).
  code?: { channel: AccessCodeChannel, identifier: string }
  // Email a sign-in link or a password-reset link was requested for.
  email?: string
  savedAt: number
}

// Access codes and magic links expire after about ten minutes by default.
export const PENDING_CHALLENGE_TTL_MS = 15 * 60 * 1000

const CHANNELS: readonly AccessCodeChannel[] = ['email', 'whatsapp', 'sms']

function storageKey(flow: AuthFlow) {
  return `outlabs-auth.pending-${flow}`
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** Validates a stored record; null when malformed, empty or older than the TTL. */
export function parsePendingChallenge(raw: string | null, now: number): PendingChallenge | null {
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (value == null || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const savedAt = typeof record.savedAt === 'number' ? record.savedAt : NaN
  if (!Number.isFinite(savedAt) || now - savedAt > PENDING_CHALLENGE_TTL_MS || savedAt > now + 60_000) return null

  const pending: PendingChallenge = { savedAt }
  const phone = nonEmptyString(record.phone)
  if (phone) pending.phone = phone
  const email = nonEmptyString(record.email)
  if (email) pending.email = email
  const code = record.code as Record<string, unknown> | undefined
  const identifier = nonEmptyString(code?.identifier)
  if (identifier && CHANNELS.includes(code?.channel as AccessCodeChannel)) {
    pending.code = { channel: code!.channel as AccessCodeChannel, identifier }
  }
  return pending.phone || pending.email || pending.code ? pending : null
}

export function readPendingChallenge(flow: AuthFlow): PendingChallenge | null {
  if (typeof window === 'undefined') return null
  try {
    return parsePendingChallenge(window.sessionStorage.getItem(storageKey(flow)), Date.now())
  } catch {
    return null
  }
}

export function savePendingChallenge(flow: AuthFlow, pending: Omit<PendingChallenge, 'savedAt'>): PendingChallenge {
  const record: PendingChallenge = { ...pending, savedAt: Date.now() }
  try {
    window.sessionStorage.setItem(storageKey(flow), JSON.stringify(record))
  } catch {
    // Storage unavailable (privacy mode): the step still works until the tab reloads.
  }
  return record
}

export function clearPendingChallenge(flow: AuthFlow) {
  try {
    window.sessionStorage.removeItem(storageKey(flow))
  } catch {
    // Nothing stored.
  }
}
