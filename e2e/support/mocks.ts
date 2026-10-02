import { appOrigin } from './env'

// CORS headers for route-mocked backend responses. The console calls the API cross-origin with
// credentials, so a mock must allow the console's actual origin (derived from the Playwright
// baseURL, never a hardcoded port) or the browser discards the response.
export function corsHeaders(methods = 'GET,POST,PUT,PATCH,DELETE,OPTIONS'): Record<string, string> {
  return {
    'access-control-allow-origin': appOrigin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-allow-methods': methods
  }
}

export function jsonResponse(status: number, body: unknown, methods?: string) {
  return {
    status,
    headers: { ...corsHeaders(methods), 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }
}
