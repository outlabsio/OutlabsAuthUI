export const DEFAULT_API_KEY_RATE_LIMIT_PER_MINUTE = 60

export function isUnlimitedApiKeyRateLimit(value: unknown) {
  if (value === null || value === undefined) {
    return false
  }

  if (typeof value === 'string' && value.trim() === '') {
    return false
  }

  return Number(value) === 0
}

export function getLimitedApiKeyRateLimitFallback(value: unknown) {
  const numericValue = Number(value)

  return Number.isFinite(numericValue) && numericValue > 0
    ? numericValue
    : DEFAULT_API_KEY_RATE_LIMIT_PER_MINUTE
}

export function formatApiKeyRateLimitPerMinute(rateLimitPerMinute: number) {
  return rateLimitPerMinute === 0 ? 'Unlimited' : `${rateLimitPerMinute} requests/minute`
}
