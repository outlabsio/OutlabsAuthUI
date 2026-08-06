import { z } from 'zod'

// A1 — runtime-targeted backend (carryover from the React app). One build, any backend.
// Config is resolved at boot from /app-config.json (untracked, per-deployment), merged
// with NUXT_PUBLIC_* env vars (dev/CI fallback) and an optional inline global. Validated
// with Zod; production fails hard rather than booting against the wrong API.

export type RuntimeConfigInput = {
  apiBaseUrl?: string
  authApiPrefix?: string
  frontendProfileKey?: string
  appName?: string
  appSubtitle?: string
  authBrand?: string
  signInDescription?: string
  // OAuth providers the deployment has configured (the library exposes no discovery
  // endpoint, so the deployment declares them). Array in app-config.json, comma-string via env.
  oauthProviders?: string | string[]
}

export type RuntimeConfig = {
  apiBaseUrl: string
  authApiPrefix: string
  frontendProfileKey?: string
  appName: string
  appSubtitle: string
  authBrand: string
  signInDescription: string
  oauthProviders: string[]
}

export type RuntimeConfigError = {
  message: string
  issues: string[]
}

export type RuntimeConfigResult
  = | { status: 'ready', config: RuntimeConfig }
    | { status: 'error', error: RuntimeConfigError }

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

function parseProviders(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.map(v => v.trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(',').map(v => v.trim()).filter(Boolean)
  return []
}

const builtInDefaults: RuntimeConfig = {
  apiBaseUrl: 'http://localhost:8004',
  authApiPrefix: '/v1',
  frontendProfileKey: undefined,
  appName: 'OutlabsAuth UI',
  appSubtitle: 'Shared auth admin console',
  authBrand: 'OutlabsAuth',
  signInDescription: 'Sign in against the configured auth backend to access this console.',
  oauthProviders: []
}

const brandingDefaults = {
  appName: builtInDefaults.appName,
  appSubtitle: builtInDefaults.appSubtitle,
  authBrand: builtInDefaults.authBrand,
  signInDescription: builtInDefaults.signInDescription
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
    .refine(value => value.startsWith('/'), {
      message: 'authApiPrefix must start with "/" (e.g. "/v1").'
    }),
  frontendProfileKey: z.string().trim().min(1).max(64).optional(),
  appName: z.string().trim().min(1).optional(),
  appSubtitle: z.string().trim().min(1).optional(),
  authBrand: z.string().trim().min(1).optional(),
  signInDescription: z.string().trim().min(1).optional(),
  oauthProviders: z.union([z.string(), z.array(z.string())]).optional()
})

type ValidatedRuntimeConfigInput = z.infer<typeof runtimeConfigSchema>

function normalizeRuntimeConfig(input: ValidatedRuntimeConfigInput): RuntimeConfig {
  return {
    apiBaseUrl: trimTrailingSlash(input.apiBaseUrl),
    authApiPrefix: ensureLeadingSlash(input.authApiPrefix),
    frontendProfileKey: input.frontendProfileKey?.trim() || undefined,
    appName: input.appName?.trim() || brandingDefaults.appName,
    appSubtitle: input.appSubtitle?.trim() || brandingDefaults.appSubtitle,
    authBrand: input.authBrand?.trim() || brandingDefaults.authBrand,
    signInDescription: input.signInDescription?.trim() || brandingDefaults.signInDescription,
    oauthProviders: parseProviders(input.oauthProviders)
  }
}

function formatValidationIssues(error: z.ZodError) {
  return error.issues.map((issue) => {
    const path = issue.path.join('.') || '(config)'
    return `${path}: ${issue.message}`
  })
}

// Drop empty strings so unset NUXT_PUBLIC_* keys don't shadow file config. Keep non-empty
// arrays (oauthProviders from app-config.json).
function pruneEmpty(input: RuntimeConfigInput): RuntimeConfigInput {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0
      return typeof value === 'string' && value.trim() !== ''
    })
  ) as RuntimeConfigInput
}

async function readRuntimeFileConfig(): Promise<RuntimeConfigInput> {
  try {
    const response = await fetch('/app-config.json', { cache: 'no-store' })
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

let runtimeConfig: RuntimeConfig = builtInDefaults
let initializePromise: Promise<RuntimeConfigResult> | null = null

/**
 * Resolve runtime config once. `envConfig` is the NUXT_PUBLIC_* fallback passed from the
 * boot plugin (useRuntimeConfig().public). In production, invalid merged config returns an
 * error result; in dev it falls back to built-in localhost defaults.
 */
export function initializeRuntimeConfig(
  envConfig: RuntimeConfigInput = {},
  { isProd = import.meta.env.PROD }: { isProd?: boolean } = {}
): Promise<RuntimeConfigResult> {
  if (initializePromise) {
    return initializePromise
  }

  initializePromise = (async () => {
    const runtimeFileConfig = await readRuntimeFileConfig()
    const inlineRuntimeConfig = readInlineRuntimeConfig()

    // File wins over env; inline global wins over both.
    const mergedConfig: RuntimeConfigInput = {
      ...pruneEmpty(envConfig),
      ...pruneEmpty(runtimeFileConfig),
      ...pruneEmpty(inlineRuntimeConfig)
    }

    if (isProd) {
      const parsed = runtimeConfigSchema.safeParse(mergedConfig)
      if (!parsed.success) {
        return {
          status: 'error',
          error: {
            message:
              'Runtime configuration is invalid or missing. Provide a valid app-config.json, '
              + 'window.__OUTLABS_AUTH_UI_CONFIG__, or NUXT_PUBLIC_* env vars before deploying.',
            issues: formatValidationIssues(parsed.error)
          }
        } satisfies RuntimeConfigResult
      }
      runtimeConfig = normalizeRuntimeConfig(parsed.data)
      return { status: 'ready', config: runtimeConfig } satisfies RuntimeConfigResult
    }

    const parsed = runtimeConfigSchema.safeParse({ ...builtInDefaults, ...mergedConfig })
    if (!parsed.success) {
      console.warn(
        '[runtime-config] Invalid runtime configuration, falling back to built-in defaults:',
        formatValidationIssues(parsed.error).join('; ')
      )
      runtimeConfig = builtInDefaults
      return { status: 'ready', config: runtimeConfig } satisfies RuntimeConfigResult
    }

    runtimeConfig = normalizeRuntimeConfig(parsed.data)
    return { status: 'ready', config: runtimeConfig } satisfies RuntimeConfigResult
  })()

  return initializePromise
}

export function getRuntimeConfig(): RuntimeConfig {
  return runtimeConfig
}
