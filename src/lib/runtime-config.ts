type RuntimeConfigInput = {
  apiBaseUrl?: string
  authApiPrefix?: string
  appName?: string
  appSubtitle?: string
  authBrand?: string
  signInDescription?: string
}

export type RuntimeConfig = {
  apiBaseUrl: string
  authApiPrefix: string
  appName: string
  appSubtitle: string
  authBrand: string
  signInDescription: string
}

declare global {
  interface Window {
    __OUTLABS_AUTH_UI_CONFIG__?: RuntimeConfigInput
  }
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function ensureLeadingSlash(value: string) {
  return value.startsWith('/') ? value : `/${value}`
}

function shouldPreferEnvConfig() {
  return import.meta.env.VITE_RUNTIME_CONFIG_PRIORITY?.trim().toLowerCase() === 'env'
}

const builtInDefaults: RuntimeConfig = {
  apiBaseUrl: 'http://localhost:8004',
  authApiPrefix: '/v1',
  appName: 'OutlabsAuth UI',
  appSubtitle: 'Shared auth admin console',
  authBrand: 'OutlabsAuth',
  signInDescription:
    'Sign in against the configured auth backend to access this console.',
}

function normalizeRuntimeConfig(input: RuntimeConfigInput): RuntimeConfig {
  return {
    apiBaseUrl: trimTrailingSlash(input.apiBaseUrl ?? builtInDefaults.apiBaseUrl),
    authApiPrefix: ensureLeadingSlash(
      input.authApiPrefix ?? builtInDefaults.authApiPrefix
    ),
    appName: input.appName?.trim() || builtInDefaults.appName,
    appSubtitle: input.appSubtitle?.trim() || builtInDefaults.appSubtitle,
    authBrand: input.authBrand?.trim() || builtInDefaults.authBrand,
    signInDescription:
      input.signInDescription?.trim() || builtInDefaults.signInDescription,
  }
}

function readEnvConfig(): RuntimeConfigInput {
  return {
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
    authApiPrefix: import.meta.env.VITE_AUTH_API_PREFIX,
    appName: import.meta.env.VITE_APP_NAME,
    appSubtitle: import.meta.env.VITE_APP_SUBTITLE,
    authBrand: import.meta.env.VITE_AUTH_BRAND,
    signInDescription: import.meta.env.VITE_SIGN_IN_DESCRIPTION,
  }
}

async function readRuntimeFileConfig(): Promise<RuntimeConfigInput> {
  try {
    const response = await fetch('/app-config.json', {
      cache: 'no-store',
    })

    if (!response.ok) {
      return {}
    }

    const data = await response.json()

    return data != null && typeof data === 'object' && !Array.isArray(data)
      ? (data as RuntimeConfigInput)
      : {}
  } catch {
    return {}
  }
}

function readInlineRuntimeConfig(): RuntimeConfigInput {
  if (typeof window === 'undefined') {
    return {}
  }

  return window.__OUTLABS_AUTH_UI_CONFIG__ ?? {}
}

function applyDocumentConfig(config: RuntimeConfig) {
  document.title = config.appName
}

let runtimeConfig = normalizeRuntimeConfig(readEnvConfig())
let initializePromise: Promise<RuntimeConfig> | null = null

export async function initializeRuntimeConfig() {
  if (initializePromise) {
    return initializePromise
  }

  initializePromise = (async () => {
    const runtimeFileConfig = await readRuntimeFileConfig()
    const inlineRuntimeConfig = readInlineRuntimeConfig()
    const preferEnvConfig = shouldPreferEnvConfig()

    runtimeConfig = normalizeRuntimeConfig(
      preferEnvConfig
        ? {
            ...builtInDefaults,
            ...runtimeFileConfig,
            ...readEnvConfig(),
            ...inlineRuntimeConfig,
          }
        : {
            ...builtInDefaults,
            ...readEnvConfig(),
            ...runtimeFileConfig,
            ...inlineRuntimeConfig,
          }
    )

    applyDocumentConfig(runtimeConfig)
    return runtimeConfig
  })()

  return initializePromise
}

export function getRuntimeConfig() {
  return runtimeConfig
}
