import { ApiError, getApiErrorMessage } from '@/lib/api/errors'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function formatDateTime(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

export function getAuthErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) {
    return fallback
  }

  const errorCode =
    typeof error.data?.error === 'string'
      ? error.data.error
      : null
  const lockedUntil =
    isRecord(error.data?.details) &&
    typeof error.data.details.locked_until === 'string'
      ? error.data.details.locked_until
      : null

  switch (errorCode) {
    case 'ACCOUNT_LOCKED':
      return lockedUntil
        ? `This account is locked until ${formatDateTime(lockedUntil)}.`
        : 'This account is temporarily locked. Try again later.'
    case 'ACCOUNT_INACTIVE':
      return 'This account is inactive or suspended. Contact an administrator.'
    case 'INVALID_CREDENTIALS':
      return 'Invalid email or password.'
    default:
      return getApiErrorMessage(error, fallback)
  }
}
