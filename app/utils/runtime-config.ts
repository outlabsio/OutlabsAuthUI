import { z } from 'zod'

// A1 — runtime-targeted backend. One build, any backend.
// Config is resolved at boot from /app-config.json (untracked, per-deployment) and an optional
// inline global, validated with Zod; production fails hard rather than booting against the
// wrong API. The dev server also merges NUXT_PUBLIC_* env vars underneath them; production
// builds ignore that layer entirely (nuxt.config.ts only declares it for development).

export type AuthUiInput = {
  signup?: boolean | string
  identifier?: string
  defaultCountry?: string
  channels?: string | string[]
  oauthProviders?: string | string[]
  magicLink?: boolean | string
  otpLength?: number | string
}

// Normalized auth-flows surfacing config (F0). The developer declares what the deployment
// offers; backend capabilities (/auth/config) remain the hard gate on top.
export type AuthUiConfig = {
  signup: boolean
  identifier: 'email-only' | 'email-or-phone'
  defaultCountry: string
  channels: ('whatsapp' | 'sms')[]
  oauthProviders: string[]
  magicLink: boolean
  // Digits in a one-time code, for a backend that does not advertise access_code_length
  // (4-12; unset = the backend's value, else 6).
  otpLength?: number
}

export type RuntimeConfigInput = {
  apiBaseUrl?: string
  authApiPrefix?: string
  frontendProfileKey?: string
  appName?: string
  appSubtitle?: string
  authBrand?: string
  authLogoUrl?: string
  // Logo shown in dark mode. Defaults to the light-ink default logo when authLogoUrl is the
  // default, else to authLogoUrl itself.
  authLogoDarkUrl?: string
  signInDescription?: string
  // OAuth providers the deployment has configured (the library exposes no discovery
  // endpoint, so the deployment declares them). Array in app-config.json, comma-string via env.
  // Deprecated flat form — prefer authUi.oauthProviders; kept as the fallback for one release.
  oauthProviders?: string | string[]
  authUi?: AuthUiInput
}

export type RuntimeConfig = {
  apiBaseUrl: string
  authApiPrefix: string
  frontendProfileKey?: string
  appName: string
  appSubtitle: string
  authBrand: string
  authLogoUrl: string
  authLogoDarkUrl: string
  signInDescription: string
  oauthProviders: string[]
  authUi: AuthUiConfig
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

const AUTH_CHANNELS = ['whatsapp', 'sms'] as const
type AuthChannel = (typeof AUTH_CHANNELS)[number]

function parseChannels(value: string | string[] | undefined): AuthChannel[] {
  const parsed = parseProviders(value)
  return parsed.filter((v): v is AuthChannel => (AUTH_CHANNELS as readonly string[]).includes(v))
}

function parseOtpLength(value: number | string | undefined): number | undefined {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof number === 'number' && Number.isInteger(number) && number >= 4 && number <= 12 ? number : undefined
}

// Env vars arrive as strings ('true'/'false'); accept real booleans from app-config.json too.
function parseBoolean(value: boolean | string | undefined, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return fallback
}

const builtInAuthUiDefaults: AuthUiConfig = {
  signup: true,
  identifier: 'email-or-phone',
  defaultCountry: 'AR',
  channels: ['whatsapp', 'sms'],
  oauthProviders: [],
  magicLink: true
}

function normalizeAuthUi(input: AuthUiInput | undefined, flatOauthProviders: string[]): AuthUiConfig {
  const authUiProviders = parseProviders(input?.oauthProviders)
  return {
    signup: parseBoolean(input?.signup, builtInAuthUiDefaults.signup),
    identifier: input?.identifier === 'email-only' ? 'email-only' : builtInAuthUiDefaults.identifier,
    defaultCountry: input?.defaultCountry?.trim().toUpperCase() || builtInAuthUiDefaults.defaultCountry,
    channels: input?.channels != null ? parseChannels(input.channels) : [...builtInAuthUiDefaults.channels],
    // Backwards-compat shim: authUi.oauthProviders wins; the deprecated flat key fills in.
    oauthProviders: authUiProviders.length > 0 ? authUiProviders : flatOauthProviders,
    magicLink: parseBoolean(input?.magicLink, builtInAuthUiDefaults.magicLink),
    ...(parseOtpLength(input?.otpLength) ? { otpLength: parseOtpLength(input?.otpLength) } : {})
  }
}

const builtInDefaults: RuntimeConfig = {
  apiBaseUrl: 'http://localhost:8004',
  authApiPrefix: '/v1',
  frontendProfileKey: undefined,
  appName: 'OutlabsAuth UI',
  appSubtitle: 'Shared auth admin console',
  authBrand: 'OutlabsAuth',
  authLogoUrl: '/brand/outlabs-auth-logo.svg',
  authLogoDarkUrl: '/brand/outlabs-auth-logo-dark.svg',
  signInDescription: 'Sign in against the configured auth backend to access this console.',
  oauthProviders: [],
  authUi: builtInAuthUiDefaults
}

const brandingDefaults = {
  appName: builtInDefaults.appName,
  appSubtitle: builtInDefaults.appSubtitle,
  authBrand: builtInDefaults.authBrand,
  authLogoUrl: builtInDefaults.authLogoUrl,
  authLogoDarkUrl: builtInDefaults.authLogoDarkUrl,
  signInDescription: builtInDefaults.signInDescription
}

// A missing key is the common production mistake (there are no defaults there), so say so
// plainly instead of Zod's generic "Invalid input".
const requiredString = (key: string) => z.string({
  error: issue => (issue.input === undefined ? `${key} is required.` : `${key} must be a string.`)
})

const runtimeConfigSchema = z.object({
  apiBaseUrl: requiredString('apiBaseUrl')
    .trim()
    .min(1, 'apiBaseUrl is required.')
    .url('apiBaseUrl must be a valid absolute URL (e.g. https://api.example.com).'),
  authApiPrefix: requiredString('authApiPrefix')
    .trim()
    .min(1, 'authApiPrefix is required.')
    .refine(value => value.startsWith('/'), {
      message: 'authApiPrefix must start with "/" (e.g. "/v1").'
    }),
  frontendProfileKey: z.string().trim().min(1).max(64).optional(),
  appName: z.string().trim().min(1).optional(),
  appSubtitle: z.string().trim().min(1).optional(),
  authBrand: z.string().trim().min(1).optional(),
  authLogoUrl: z.string().trim().min(1).optional(),
  authLogoDarkUrl: z.string().trim().min(1).optional(),
  signInDescription: z.string().trim().min(1).optional(),
  oauthProviders: z.union([z.string(), z.array(z.string())]).optional(),
  authUi: z
    .object({
      signup: z.union([z.boolean(), z.string()]).optional(),
      identifier: z.string().trim().optional(),
      defaultCountry: z.string().trim().max(2).optional(),
      channels: z.union([z.string(), z.array(z.string())]).optional(),
      oauthProviders: z.union([z.string(), z.array(z.string())]).optional(),
      magicLink: z.union([z.boolean(), z.string()]).optional(),
      otpLength: z.union([z.number(), z.string()]).optional()
    })
    .optional()
})

type ValidatedRuntimeConfigInput = z.infer<typeof runtimeConfigSchema>

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

// Plain http:// is only acceptable when the API runs on the same machine (local preview and
// the static E2E target). Anything else would carry bearer tokens in clear text.
export function isAcceptableProductionApiBaseUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:') return true
    return url.protocol === 'http:' && (LOOPBACK_HOSTS.has(url.hostname) || url.hostname.endsWith('.localhost'))
  } catch {
    return false
  }
}

const productionRuntimeConfigSchema = runtimeConfigSchema.superRefine((value, ctx) => {
  if (!isAcceptableProductionApiBaseUrl(value.apiBaseUrl)) {
    ctx.addIssue({
      code: 'custom',
      path: ['apiBaseUrl'],
      message: 'apiBaseUrl must use https:// (plain http:// is only accepted for localhost).'
    })
  }
})

// A deployment that brings its own logo and no dark variant keeps its logo in both modes; the
// light-ink default applies only to the default logo.
function resolveDarkLogo(authLogoUrl: string, authLogoDarkUrl: string | undefined): string {
  if (authLogoDarkUrl) return authLogoDarkUrl
  return authLogoUrl === brandingDefaults.authLogoUrl ? brandingDefaults.authLogoDarkUrl : authLogoUrl
}

function normalizeRuntimeConfig(input: ValidatedRuntimeConfigInput): RuntimeConfig {
  const flatOauthProviders = parseProviders(input.oauthProviders)
  const authLogoUrl = input.authLogoUrl?.trim() || brandingDefaults.authLogoUrl
  return {
    apiBaseUrl: trimTrailingSlash(input.apiBaseUrl),
    authApiPrefix: ensureLeadingSlash(input.authApiPrefix),
    frontendProfileKey: input.frontendProfileKey?.trim() || undefined,
    appName: input.appName?.trim() || brandingDefaults.appName,
    appSubtitle: input.appSubtitle?.trim() || brandingDefaults.appSubtitle,
    authBrand: input.authBrand?.trim() || brandingDefaults.authBrand,
    authLogoUrl,
    authLogoDarkUrl: resolveDarkLogo(authLogoUrl, input.authLogoDarkUrl?.trim() || undefined),
    signInDescription: input.signInDescription?.trim() || brandingDefaults.signInDescription,
    oauthProviders: flatOauthProviders,
    authUi: normalizeAuthUi(input.authUi, flatOauthProviders)
  }
}

function formatValidationIssues(error: z.ZodError) {
  return error.issues.map((issue) => {
    const path = issue.path.join('.') || '(config)'
    return `${path}: ${issue.message}`
  })
}

// Drop empty strings so unset NUXT_PUBLIC_* keys don't shadow file config. Keep non-empty
// arrays (oauthProviders from app-config.json). The nested authUi object is pruned one level
// deep and dropped when nothing inside it is set.
function pruneEmpty(input: RuntimeConfigInput): RuntimeConfigInput {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (key === 'authUi' && value != null && typeof value === 'object' && !Array.isArray(value)) {
      const pruned: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value as AuthUiInput)) {
        if (Array.isArray(v) ? v.length > 0 : typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.trim() !== '')) {
          pruned[k] = v
        }
      }
      if (Object.keys(pruned).length > 0) out[key] = pruned
    } else if (Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value.trim() !== '') {
      out[key] = value
    }
  }
  return out as RuntimeConfigInput
}

// Boot must not hang on a stalled static host: give up on app-config.json after this long
// (the env/inline layers still apply; production then reports the missing config).
const RUNTIME_FILE_TIMEOUT_MS = 10_000

async function readRuntimeFileConfig(): Promise<RuntimeConfigInput> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RUNTIME_FILE_TIMEOUT_MS)
  try {
    const response = await fetch('/app-config.json', { cache: 'no-store', signal: controller.signal })
    if (!response.ok) {
      return {}
    }
    const data = await response.json()
    return data != null && typeof data === 'object' && !Array.isArray(data)
      ? (data as RuntimeConfigInput)
      : {}
  } catch {
    return {}
  } finally {
    clearTimeout(timer)
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
 * Validate a deployment's config exactly as the production build does: no built-in defaults,
 * https-only API (http is accepted for localhost), invalid or missing values return an error
 * result for the config-error screen. Pure — also used by scripts/deploy-preflight.mjs so a
 * deploy is refused for the same reasons the console would refuse to boot.
 */
export function resolveProductionRuntimeConfig(input: RuntimeConfigInput): RuntimeConfigResult {
  const parsed = productionRuntimeConfigSchema.safeParse(pruneEmpty(input))
  if (!parsed.success) {
    return {
      status: 'error',
      error: {
        message:
          'Runtime configuration is invalid or missing. Serve a valid /app-config.json with this '
          + 'deployment (or inject window.__OUTLABS_AUTH_UI_CONFIG__) before it can boot.',
        issues: formatValidationIssues(parsed.error)
      }
    }
  }
  return { status: 'ready', config: normalizeRuntimeConfig(parsed.data) }
}

/**
 * Resolve runtime config once. `envConfig` is the NUXT_PUBLIC_* fallback passed from the
 * boot plugin (useRuntimeConfig().public) and is only honoured by the dev server. In
 * production, invalid or missing config returns an error result; in dev it falls back to
 * built-in localhost defaults.
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

    if (isProd) {
      // Production reads only what the deployment itself serves: its app-config.json and an
      // optional host-injected inline global (which wins). The env layer is ignored even if a
      // caller passes one, so a build machine's settings can never satisfy this check.
      const result = resolveProductionRuntimeConfig({
        ...pruneEmpty(runtimeFileConfig),
        ...pruneEmpty(inlineRuntimeConfig)
      })
      if (result.status === 'ready') runtimeConfig = result.config
      return result
    }

    // Dev: file wins over env; inline global wins over both.
    const mergedConfig: RuntimeConfigInput = {
      ...pruneEmpty(envConfig),
      ...pruneEmpty(runtimeFileConfig),
      ...pruneEmpty(inlineRuntimeConfig)
    }

    // The dark logo is derived from the light one unless the deployment sets it (resolveDarkLogo).
    const { authLogoDarkUrl: _derivedDarkLogo, ...devDefaults } = builtInDefaults
    const parsed = runtimeConfigSchema.safeParse({
      ...devDefaults,
      ...mergedConfig,
      // Deep-merge authUi so a partial declaration doesn't wipe the other defaults.
      authUi: { ...builtInDefaults.authUi, ...mergedConfig.authUi }
    })
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
