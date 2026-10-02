// Copy for the full-page error screen (app/error.vue), keyed by HTTP status. Pure so the
// mapping is unit-tested; the page only renders it. Unknown and missing statuses are treated
// as unexpected failures rather than "not found".

export type ErrorPageCopy = {
  statusCode: number
  title: string
  description: string
  // Whether reloading could plausibly help (transient/server-side failures).
  retryable: boolean
}

const copyByStatus: Record<number, Omit<ErrorPageCopy, 'statusCode'>> = {
  400: {
    title: 'Bad request',
    description: 'The address or request was not understood. Check the link and try again.',
    retryable: false
  },
  401: {
    title: 'Sign in required',
    description: 'Your session is no longer valid. Sign in again to continue.',
    retryable: false
  },
  403: {
    title: 'Access denied',
    description: 'You do not have permission to open this page.',
    retryable: false
  },
  404: {
    title: 'Page not found',
    description: 'This page does not exist or has moved. Check the address or go back to the console.',
    retryable: false
  },
  408: {
    title: 'Request timed out',
    description: 'The request took too long. Reload the page to try again.',
    retryable: true
  },
  429: {
    title: 'Too many requests',
    description: 'Wait a moment, then reload the page.',
    retryable: true
  },
  502: {
    title: 'Service unavailable',
    description: 'The console could not reach a service it depends on. Reload the page in a moment.',
    retryable: true
  },
  503: {
    title: 'Service unavailable',
    description: 'The service is temporarily unavailable. Reload the page in a moment.',
    retryable: true
  },
  504: {
    title: 'Request timed out',
    description: 'A service the console depends on did not respond in time. Reload the page to try again.',
    retryable: true
  }
}

const unexpectedClientError: Omit<ErrorPageCopy, 'statusCode'> = {
  title: 'Request failed',
  description: 'The request could not be completed. Go back to the console and try again.',
  retryable: false
}

const unexpectedError: Omit<ErrorPageCopy, 'statusCode'> = {
  title: 'Something went wrong',
  description: 'An unexpected error stopped this page from loading. Reload the page, or go back to the console.',
  retryable: true
}

export function normalizeErrorStatus(value: unknown): number {
  const status = typeof value === 'string' ? Number.parseInt(value, 10) : value
  return typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500
}

export function errorPageCopy(status: unknown): ErrorPageCopy {
  const statusCode = normalizeErrorStatus(status)
  const copy = copyByStatus[statusCode] ?? (statusCode < 500 ? unexpectedClientError : unexpectedError)
  return { statusCode, ...copy }
}

// Document title for the error page, e.g. "404 · Page not found".
export function errorPageTitle(status: unknown): string {
  const { statusCode, title } = errorPageCopy(status)
  return `${statusCode} · ${title}`
}
