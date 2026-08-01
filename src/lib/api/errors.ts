export type ApiErrorPayload = Record<string, unknown> & {
  detail?: unknown
  details?: unknown
  error?: string
  message?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function extractValidationMessage(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return null
  }

  const firstError = value.find(isRecord)

  if (!firstError) {
    return null
  }

  const message =
    typeof firstError.message === 'string'
      ? firstError.message
      : typeof firstError.msg === 'string'
        ? firstError.msg
        : null

  if (!message) {
    return null
  }

  const location = Array.isArray(firstError.loc)
    ? firstError.loc
        .filter(
          (
            segment
          ): segment is string | number =>
            typeof segment === 'string' || typeof segment === 'number'
        )
        .slice(1)
        .join('.')
    : ''

  return location ? `${location}: ${message}` : message
}

function extractNestedMessage(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value
  }

  if (Array.isArray(value)) {
    return extractValidationMessage(value)
  }

  if (!isRecord(value)) {
    return null
  }

  if (typeof value.detail === 'string' && value.detail.trim()) {
    return value.detail
  }

  if (typeof value.message === 'string' && value.message.trim()) {
    return value.message
  }

  const validationMessage = extractValidationMessage(value.errors)

  if (validationMessage) {
    return validationMessage
  }

  return extractNestedMessage(value.details)
}

export function getApiErrorMessageFromPayload(
  payload: ApiErrorPayload | null | undefined
) {
  if (!payload) {
    return null
  }

  return (
    extractNestedMessage(payload.detail) ??
    extractNestedMessage(payload.details) ??
    (typeof payload.message === 'string' && payload.message.trim()
      ? payload.message
      : null)
  )
}

export class ApiError extends Error {
  status: number
  statusText: string
  data: ApiErrorPayload | null

  constructor({
    message,
    status,
    statusText,
    data,
  }: {
    message: string
    status: number
    statusText: string
    data: ApiErrorPayload | null
  }) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.statusText = statusText
    this.data = data
  }
}

export function getApiErrorMessage(
  error: unknown,
  fallback = 'Something went wrong.'
) {
  if (!(error instanceof ApiError)) {
    return fallback
  }

  return (getApiErrorMessageFromPayload(error.data) ?? error.message) || fallback
}
