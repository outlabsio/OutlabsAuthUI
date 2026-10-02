// Shared helpers for the static artifact in .output/public: inline-script hashing, the
// Cloudflare `_headers` format (parsed and applied the way the Workers asset server does it)
// and Content-Security-Policy editing. Used by csp-hashes.mjs (post-generate),
// deploy-preflight.mjs and serve-static.mjs, and unit-tested in test/unit/static-site.test.ts.
// Node built-ins only.

import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'

// ── Files ────────────────────────────────────────────────────────────────────────────────

/** Every file under `dir`, as sorted posix paths relative to it. */
export async function listFiles(dir) {
  const out = []
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.isFile()) out.push(path.relative(dir, full).split(path.sep).join('/'))
    }
  }
  await walk(dir)
  return out.sort()
}

// Files the Workers asset upload never serves (wrangler reads them as configuration).
export const ASSET_METAFILES = new Set(['/_headers', '/_redirects', '/.assetsignore'])

// ── Inline scripts ───────────────────────────────────────────────────────────────────────

// <script type> values the browser executes (so CSP applies). Anything else — notably
// application/json data blocks such as Nuxt's __NUXT_DATA__ — is inert and needs no hash.
const JAVASCRIPT_MIME_TYPES = new Set([
  'application/ecmascript',
  'application/javascript',
  'application/x-ecmascript',
  'application/x-javascript',
  'text/ecmascript',
  'text/javascript',
  'text/javascript1.0',
  'text/javascript1.1',
  'text/javascript1.2',
  'text/javascript1.3',
  'text/javascript1.4',
  'text/javascript1.5',
  'text/jscript',
  'text/livescript',
  'text/x-ecmascript',
  'text/x-javascript'
])
const EXECUTABLE_NON_MIME_TYPES = new Set(['', 'module', 'importmap', 'speculationrules'])

function parseAttributes(source) {
  const attributes = {}
  for (const match of source.matchAll(/([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? ''
  }
  return attributes
}

export function isExecutableScriptType(type) {
  const normalized = (type ?? '').trim().toLowerCase()
  return EXECUTABLE_NON_MIME_TYPES.has(normalized) || JAVASCRIPT_MIME_TYPES.has(normalized.split(';')[0].trim())
}

/** Inline scripts the browser would execute: no `src`, and an executable `type`. */
export function extractInlineScripts(html) {
  const scripts = []
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attributes = parseAttributes(match[1])
    if ('src' in attributes) continue
    if (!isExecutableScriptType(attributes.type)) continue
    // The HTML parser normalizes newlines before the browser hashes the text.
    scripts.push({ type: (attributes.type ?? '').trim().toLowerCase(), content: match[2].replace(/\r\n?/g, '\n') })
  }
  return scripts
}

/** Inline event handlers and javascript: URLs cannot be allowed by a script hash. */
export function findUnhashableInlineCode(html) {
  const found = []
  for (const match of html.matchAll(/<[a-z][^>]*\s(on[a-z]+)\s*=/gi)) found.push(`inline ${match[1]} handler`)
  if (/\s(?:href|src|action)\s*=\s*["']?\s*javascript:/i.test(html)) found.push('javascript: URL')
  return found
}

/** CSP source expression for a script body, e.g. 'sha256-abc…='. */
export function cspHash(content) {
  return `'sha256-${createHash('sha256').update(content, 'utf8').digest('base64')}'`
}

// ── Nuxt inline runtime config ───────────────────────────────────────────────────────────

// The runtime-config keys a deployment supplies through app-config.json. None of them may
// be baked into the build output (see nuxt.config.ts `$development`).
export const DEPLOYMENT_CONFIG_KEYS = [
  'apiBaseUrl',
  'authApiPrefix',
  'frontendProfileKey',
  'appName',
  'appSubtitle',
  'authBrand',
  'authLogoUrl',
  'authLogoDarkUrl',
  'signInDescription',
  'oauthProviders',
  'authUi'
]

/** Evaluate Nuxt's `window.__NUXT__.config = …` inline script in isolation and return it. */
export function readInlineNuxtConfig(html) {
  const script = extractInlineScripts(html).find(s => s.content.includes('window.__NUXT__'))
  if (!script) return null
  const sandbox = { window: {} }
  vm.runInNewContext(script.content, sandbox, { timeout: 1000 })
  return sandbox.window.__NUXT__?.config ?? null
}

function hasValue(value) {
  if (value == null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.values(value).some(hasValue)
  return true
}

/** Deployment keys that carry a value in the build's inline public config. */
export function bakedDeploymentKeys(nuxtConfig) {
  const publicConfig = nuxtConfig?.public ?? {}
  return DEPLOYMENT_CONFIG_KEYS.filter(key => hasValue(publicConfig[key]))
}

// ── Content-Security-Policy ──────────────────────────────────────────────────────────────

/** Parse a policy into an ordered Map of directive → source list. */
export function parseCsp(policy) {
  const directives = new Map()
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/).filter(Boolean)
    if (name && !directives.has(name.toLowerCase())) directives.set(name.toLowerCase(), sources)
  }
  return directives
}

export function serializeCsp(directives) {
  return [...directives].map(([name, sources]) => [name, ...sources].join(' ')).join('; ')
}

/** Replace one directive's sources (de-duplicated, order kept), appending it if absent. */
export function setCspDirective(policy, name, sources) {
  const directives = parseCsp(policy)
  directives.set(name.toLowerCase(), [...new Set(sources)])
  return serializeCsp(directives)
}

const CSP_LINE = /^(\s*Content-Security-Policy\s*:\s*)(.*)$/i

/**
 * Rewrite every Content-Security-Policy value in a `_headers` document with `transform`,
 * keeping comments and layout. Returns the new text and how many policies were rewritten.
 * @param {string} text
 * @param {(value: string) => string} transform
 */
export function rewriteCspInHeaders(text, transform) {
  let count = 0
  const lines = text.split('\n').map((line) => {
    const match = CSP_LINE.exec(line)
    if (!match || line.trim().startsWith('#')) return line
    count += 1
    return `${match[1]}${transform(match[2].trim())}`
  })
  return { text: lines.join('\n'), count }
}

/** Every Content-Security-Policy value in a `_headers` document. */
export function readCspFromHeaders(text) {
  const policies = []
  for (const line of text.split('\n')) {
    const match = CSP_LINE.exec(line)
    if (match && !line.trim().startsWith('#')) policies.push(match[2].trim())
  }
  return policies
}

/** Origin of an absolute http(s) URL, or null for relative paths, data: URLs and garbage. */
export function httpOrigin(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value.trim())) return null
  try {
    return new URL(value.trim()).origin
  } catch {
    return null
  }
}

// ── Cloudflare `_headers` ────────────────────────────────────────────────────────────────
// Mirrors workers-shared (parseHeaders + the asset worker's attachCustomHeaders): rules match
// the request path top to bottom; each matching rule first removes its "! Name" headers, then
// sets its own, joining with ", " when an earlier matching rule already set the same name.

export const MAX_HEADER_RULES = 100
export const MAX_HEADERS_LINE_LENGTH = 2000

export function parseHeadersFile(input) {
  const rules = []
  const invalid = []
  let rule
  let skip = false
  const lines = input.split('\n')
  const flush = () => {
    if (!rule) return
    if (Object.keys(rule.set).length || rule.unset.length) rules.push(rule)
    else invalid.push({ lineNumber: rule.lineNumber, message: 'No headers specified' })
  }
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim()
    const lineNumber = i + 1
    if (!line || line.startsWith('#')) continue
    if (line.length > MAX_HEADERS_LINE_LENGTH) {
      invalid.push({ lineNumber, message: `Line exceeds ${MAX_HEADERS_LINE_LENGTH} characters and is ignored` })
      continue
    }
    if (/^([^\s]+:\/\/|\/)/.test(line)) {
      skip = false
      if (rules.length >= MAX_HEADER_RULES) {
        invalid.push({ lineNumber, message: `More than ${MAX_HEADER_RULES} rules; the rest of the file is ignored` })
        break
      }
      flush()
      if (!line.startsWith('/') && !line.startsWith('https://')) {
        invalid.push({ lineNumber, message: 'Rule paths must start with "/" or "https://"' })
        rule = undefined
        skip = true
        continue
      }
      if ((line.match(/\*/g) ?? []).length > 1) {
        invalid.push({ lineNumber, message: 'Only one wildcard is allowed per rule' })
        rule = undefined
        skip = true
        continue
      }
      rule = { path: line, lineNumber, set: {}, unset: [] }
      continue
    }
    if (skip) continue
    if (!rule) {
      invalid.push({ lineNumber, message: 'Header before any path' })
      continue
    }
    if (!line.includes(':')) {
      if (line.startsWith('! ')) rule.unset.push(line.slice(2).trim())
      else invalid.push({ lineNumber, message: 'Expected "Name: value" or "! Name"' })
      continue
    }
    const [rawName, ...rawValue] = line.split(':')
    const name = rawName.trim().toLowerCase()
    const value = rawValue.join(':').trim()
    if (!name || name.includes(' ') || !value) {
      invalid.push({ lineNumber, message: 'Invalid header line' })
      continue
    }
    rule.set[name] = rule.set[name] ? `${rule.set[name]}, ${value}` : value
  }
  flush()
  return { rules, invalid }
}

function escapeRegex(value) {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
}

function ruleRegExp(rulePath) {
  let source = rulePath.split('*').map(escapeRegex).join('(?<splat>.*)')
  source = source.replace(/:([A-Za-z]\w*)/g, '(?<$1>[^/]+)')
  return new RegExp(`^${source}$`)
}

/** Placeholder values when `rulePath` matches, else null. */
export function matchHeaderRule(rulePath, pathname, hostname = 'localhost') {
  const test = rulePath.startsWith('https://') ? `https://${hostname}${pathname}` : pathname
  const result = ruleRegExp(rulePath).exec(test)
  return result ? (result.groups ?? {}) : null
}

/**
 * Apply the parsed rules for `pathname` onto `headers` (a plain object keyed by lowercase
 * header name, already holding the asset server's defaults). Mutates and returns it.
 */
export function applyHeaderRules(rules, pathname, headers, hostname) {
  const setByRules = new Set()
  for (const rule of rules) {
    const groups = matchHeaderRule(rule.path, pathname, hostname)
    if (!groups) continue
    for (const name of rule.unset) delete headers[name.toLowerCase()]
    for (const [name, rawValue] of Object.entries(rule.set)) {
      let value = rawValue
      for (const [key, replacement] of Object.entries(groups)) value = value.replaceAll(`:${key}`, replacement)
      if (setByRules.has(name) && headers[name] !== undefined) headers[name] = `${headers[name]}, ${value}`
      else headers[name] = value
      setByRules.add(name)
    }
  }
  return headers
}
