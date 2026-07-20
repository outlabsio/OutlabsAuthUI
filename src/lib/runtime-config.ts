import { z } from 'zod'

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

export type RuntimeConfigError = {
  message: string
  issues: string[]
}

export type RuntimeConfigResult =
  | { status: 'ready'; config: RuntimeConfig }
  | { status: 'error'; error: RuntimeConfigError }

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

// Dev-only fallback. Production must resolve these from real config sources;
// see `initializeRuntimeConfig` for why they are intentionally excluded there.
const brandingDefaults = {
  appName: builtInDefaults.appName,
  appSubtitle: builtInDefaults.appSubtitle,
  authBrand: builtInDefaults.authBrand,
  signInDescription: builtInDefaults.signInDescription,
}

const runtimeConfigSchema = z.object({
  apiBaseUrl: z
    .string()
    .trim()
    .min(1, 'apiBaseUrl is required.')
    .url('apiBaseUrl must be a valid absolute URL (e.g. https://api.example.com).'),
  authApiPrefix: z
    .string()
    .trim()
    .min(1, 'authApiPrefix is required.')
    .refine((value) => value.startsWith('/'), {
      message: 'authApiPrefix must start with "/" (e.g. "/v1").',
    }),
  appName: z.string().trim().min(1).optional(),
  appSubtitle: z.string().trim().min(1).optional(),
  authBrand: z.string().trim().min(1).optional(),
  signInDescription: z.string().trim().min(1).optional(),
})

type ValidatedRuntimeConfigInput = z.infer<typeof runtimeConfigSchema>

function normalizeRuntimeConfig(input: ValidatedRuntimeConfigInput): RuntimeConfig {
  return {
    apiBaseUrl: trimTrailingSlash(input.apiBaseUrl),
    authApiPrefix: ensureLeadingSlash(input.authApiPrefix),
    appName: input.appName?.trim() || brandingDefaults.appName,
    appSubtitle: input.appSubtitle?.trim() || brandingDefaults.appSubtitle,
    authBrand: input.authBrand?.trim() || brandingDefaults.authBrand,
    signInDescription: input.signInDescription?.trim() || brandingDefaults.signInDescription,
  }
}

function formatValidationIssues(error: z.ZodError) {
  return error.issues.map((issue) => {
    const path = issue.path.join('.') || '(config)'
    return `${path}: ${issue.message}`
  })
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

function mergeConfigSources(sources: {
  envConfig: RuntimeConfigInput
  runtimeFileConfig: RuntimeConfigInput
  inlineRuntimeConfig: RuntimeConfigInput
  preferEnvConfig: boolean
}): RuntimeConfigInput {
  const { envConfig, runtimeFileConfig, inlineRuntimeConfig, preferEnvConfig } = sources

  return preferEnvConfig
    ? { ...runtimeFileConfig, ...envConfig, ...inlineRuntimeConfig }
    : { ...envConfig, ...runtimeFileConfig, ...inlineRuntimeConfig }
}

function applyDocumentConfig(config: RuntimeConfig) {
  document.title = config.appName
}

let runtimeConfig: RuntimeConfig = builtInDefaults
let initializePromise: Promise<RuntimeConfigResult> | null = null

export async function initializeRuntimeConfig(): Promise<RuntimeConfigResult> {
  if (initializePromise) {
    return initializePromise
  }

  initializePromise = (async () => {
    const runtimeFileConfig = await readRuntimeFileConfig()
    const inlineRuntimeConfig = readInlineRuntimeConfig()
    const envConfig = readEnvConfig()
    const preferEnvConfig = shouldPreferEnvConfig()

    const mergedConfig = mergeConfigSources({
      envConfig,
      runtimeFileConfig,
      inlineRuntimeConfig,
      preferEnvConfig,
    })

    if (import.meta.env.PROD) {
      // Production must not silently fall back to localhost. If the merged
      // config (file/env/inline, no built-in defaults) does not validate,
      // surface a failure state instead of booting against the wrong API.
      const parsed = runtimeConfigSchema.safeParse(mergedConfig)

      if (!parsed.success) {
        return {
          status: 'error',
          error: {
            message:
              'Runtime configuration is invalid or missing. Provide a valid app-config.json, window.__OUTLABS_AUTH_UI_CONFIG__, or VITE_* build env vars before deploying.',
            issues: formatValidationIssues(parsed.error),
          },
        } satisfies RuntimeConfigResult
      }

      runtimeConfig = normalizeRuntimeConfig(parsed.data)
      applyDocumentConfig(runtimeConfig)
      return { status: 'ready', config: runtimeConfig } satisfies RuntimeConfigResult
    }

    // Dev may keep localhost defaults for anything left unconfigured.
    const parsed = runtimeConfigSchema.safeParse({ ...builtInDefaults, ...mergedConfig })

    if (!parsed.success) {
      console.warn(
        '[runtime-config] Invalid runtime configuration, falling back to built-in defaults:',
        formatValidationIssues(parsed.error).join('; ')
      )
      runtimeConfig = builtInDefaults
      applyDocumentConfig(runtimeConfig)
      return { status: 'ready', config: runtimeConfig } satisfies RuntimeConfigResult
    }

    runtimeConfig = normalizeRuntimeConfig(parsed.data)
    applyDocumentConfig(runtimeConfig)
    return { status: 'ready', config: runtimeConfig } satisfies RuntimeConfigResult
  })()

  return initializePromise
}

export function getRuntimeConfig() {
  return runtimeConfig
}
