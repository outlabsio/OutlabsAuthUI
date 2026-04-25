import {
  getStoredAccessToken,
  getStoredRefreshToken,
  setStoredAuthTokens,
} from '@/lib/api/auth-token'
import { expireAuthSession } from '@/lib/api/auth-session'
import { buildApiUrl } from '@/lib/api/config'
import {
  type ApiErrorPayload,
  ApiError,
  getApiErrorMessageFromPayload,
} from '@/lib/api/errors'

type RequestBody = BodyInit | Record<string, unknown> | null | undefined

type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  auth?: boolean
  body?: RequestBody
}

type RefreshResponse = {
  access_token: string
  refresh_token: string
}

let refreshAccessTokenPromise: Promise<string> | null = null

async function parseApiError(response: Response) {
  let data: ApiErrorPayload | null = null

  try {
    const parsed = await response.json()
    data =
      parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as ApiErrorPayload)
        : null
  } catch {
    data = null
  }

  throw new ApiError({
    message:
      (getApiErrorMessageFromPayload(data) ?? response.statusText) ||
      'Request failed',
    status: response.status,
    statusText: response.statusText,
    data,
  })
}

function isPlainObject(value: RequestBody): value is Record<string, unknown> {
  if (value == null || typeof value !== 'object') {
    return false
  }

  if (value instanceof FormData) {
    return false
  }

  if (value instanceof Blob) {
    return false
  }

  return Object.getPrototypeOf(value) === Object.prototype
}

async function refreshAccessToken() {
  const refreshToken = getStoredRefreshToken()

  if (!refreshToken) {
    expireAuthSession()
    throw new ApiError({
      message: 'Session expired.',
      status: 401,
      statusText: 'Unauthorized',
      data: null,
    })
  }

  const response = await fetch(buildApiUrl('/auth/refresh'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    expireAuthSession()
    await parseApiError(response)
  }

  const tokens = (await response.json()) as RefreshResponse

  setStoredAuthTokens({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
  })

  return tokens.access_token
}

function refreshAccessTokenOnce() {
  refreshAccessTokenPromise ??= refreshAccessToken().finally(() => {
    refreshAccessTokenPromise = null
  })

  return refreshAccessTokenPromise
}

async function request<T>(
  path: string,
  options: ApiRequestOptions = {},
  hasRetried = false
): Promise<T> {
  const {
    auth = true,
    headers,
    body,
    credentials = 'include',
    ...requestInit
  } = options

  const requestHeaders = new Headers(headers)

  if (auth) {
    const accessToken = getStoredAccessToken()

    if (accessToken) {
      requestHeaders.set('Authorization', `Bearer ${accessToken}`)
    }
  }

  let requestBody: BodyInit | undefined

  if (isPlainObject(body)) {
    requestHeaders.set('Content-Type', 'application/json')
    requestBody = JSON.stringify(body)
  } else if (body != null) {
    requestBody = body
  }

  const response = await fetch(buildApiUrl(path), {
    ...requestInit,
    credentials,
    headers: requestHeaders,
    body: requestBody,
  })

  if (response.status === 401 && auth && !hasRetried && getStoredRefreshToken()) {
    try {
      const nextAccessToken = await refreshAccessTokenOnce()

      return request<T>(
        path,
        {
          ...options,
          headers: {
            ...Object.fromEntries(requestHeaders.entries()),
            Authorization: `Bearer ${nextAccessToken}`,
          },
        },
        true
      )
    } catch (error) {
      expireAuthSession()
      throw error
    }
  }

  if (!response.ok) {
    await parseApiError(response)
  }

  if (response.status === 204 || response.status === 205) {
    return undefined as T
  }

  const contentType = response.headers.get('content-type')

  if (contentType?.includes('application/json')) {
    return (await response.json()) as T
  }

  return undefined as T
}

export const apiClient = {
  get<T>(path: string, options?: Omit<ApiRequestOptions, 'method'>) {
    return request<T>(path, {
      ...options,
      method: 'GET',
    })
  },
  post<T>(path: string, options?: Omit<ApiRequestOptions, 'method'>) {
    return request<T>(path, {
      ...options,
      method: 'POST',
    })
  },
  put<T>(path: string, options?: Omit<ApiRequestOptions, 'method'>) {
    return request<T>(path, {
      ...options,
      method: 'PUT',
    })
  },
  patch<T>(path: string, options?: Omit<ApiRequestOptions, 'method'>) {
    return request<T>(path, {
      ...options,
      method: 'PATCH',
    })
  },
  delete<T>(path: string, options?: Omit<ApiRequestOptions, 'method'>) {
    return request<T>(path, {
      ...options,
      method: 'DELETE',
    })
  },
}
