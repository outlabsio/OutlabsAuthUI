// Per-deployment config checks for scripts/deploy-preflight.mjs. The app-config.json is
// validated with the console's own production resolver (app/utils/runtime-config.ts), so a
// deploy is refused for exactly the reasons the console would refuse to boot, plus the rules
// that only make sense for a real deployment (no loopback API).
//
// Importing the .ts module needs a TypeScript-aware runtime: Bun, Vitest, or Node >= 22.18
// (type stripping is on by default there).

import { resolveProductionRuntimeConfig } from '../../app/utils/runtime-config.ts'
import { httpOrigin, parseCsp, serializeCsp } from './static-site.mjs'

function isLoopbackHostname(hostname) {
  return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(hostname)
}

/**
 * Validate a parsed app-config.json. `local: true` is for staging a local preview or the
 * static E2E target against a backend on this machine; a deployment must use https.
 * Returns { config, errors, warnings } where config is the normalized runtime config.
 */
export function validateDeploymentConfig(raw, { local = false } = {}) {
  const errors = []
  const warnings = []
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { config: null, errors: ['app-config.json must contain a JSON object'], warnings }
  }

  const result = resolveProductionRuntimeConfig(raw)
  if (result.status === 'error') {
    return { config: null, errors: result.error.issues.length ? result.error.issues : [result.error.message], warnings }
  }
  const config = result.config

  const api = new URL(config.apiBaseUrl)
  if (!local && (api.protocol !== 'https:' || isLoopbackHostname(api.hostname))) {
    errors.push(`apiBaseUrl: ${config.apiBaseUrl} is a local or non-https address; a deployment needs its public https API origin`)
  }

  if (!config.frontendProfileKey) {
    warnings.push('frontendProfileKey is not set: fine for a backend without frontend profiles; if the backend '
      + 'declares profiles, sign-in fails with wrong_application and emailed links are not delivered')
  }

  for (const key of ['authLogoUrl', 'authLogoDarkUrl']) {
    const value = config[key]
    if (!value) continue
    const logoOrigin = httpOrigin(value)
    if (logoOrigin && !local && !logoOrigin.startsWith('https://')) {
      errors.push(`${key}: ${value} must be https (or a path served by the console)`)
    } else if (!logoOrigin && !value.startsWith('/') && !value.startsWith('data:')) {
      errors.push(`${key}: ${value} must be an absolute https URL, a path starting with "/", or a data: URL`)
    }
  }

  return { config, errors, warnings }
}

/**
 * Pin a policy to one deployment: connect-src allows the console itself plus its API origin
 * (and any extra origins passed explicitly); img-src adds the hosted logos' origins.
 * @param {string} policy
 * @param {{ config: { apiBaseUrl: string, authLogoUrl?: string, authLogoDarkUrl?: string }, extraConnectSrc?: string[], extraImgSrc?: string[] }} options
 */
export function pinDeploymentPolicy(policy, { config, extraConnectSrc = [], extraImgSrc = [] }) {
  const directives = parseCsp(policy)
  const apiOrigin = new URL(config.apiBaseUrl).origin
  directives.set('connect-src', [...new Set(['\'self\'', apiOrigin, ...extraConnectSrc])])
  const logoOrigins = [config.authLogoUrl, config.authLogoDarkUrl].map(url => httpOrigin(url)).filter(Boolean)
  const imgSrc = (directives.get('img-src') ?? ['\'self\'', 'data:']).filter(source => !/^https?:\/\//i.test(source))
  directives.set('img-src', [...new Set([...imgSrc, ...logoOrigins, ...extraImgSrc])])
  return serializeCsp(directives)
}
