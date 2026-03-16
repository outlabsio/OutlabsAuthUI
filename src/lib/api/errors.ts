type ApiErrorPayload = {
  detail?: string | { message?: string; retry_after_minutes?: number }
  message?: string
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

  if (typeof error.data?.detail === 'string') {
    return error.data.detail
  }

  if (error.data?.detail?.message) {
    return error.data.detail.message
  }

  if (error.data?.message) {
    return error.data.message
  }

  return error.message || fallback
}
