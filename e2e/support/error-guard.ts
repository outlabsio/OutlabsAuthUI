import type { BrowserContext, TestInfo } from '@playwright/test'
import { apiOrigin, appOrigin, e2eTarget } from './env'

// Response and console error guard. Records, for every page in the test's context:
//   - backend API responses with status >= 400 (preflights excluded),
//   - console errors and uncaught page errors,
//   - Content-Security-Policy violations,
//   - requests to origins other than the console and the configured API.
//
// Modes (fixture option `errorGuardMode`, or E2E_ERROR_GUARD for the whole run):
//   'report' — attach the findings to the test report and annotate it;
//   'strict' — also fail the test on any finding that is not allowed (the default);
//   'off'    — record nothing.
// On the static target, CSP violations and third-party requests fail the test in every mode:
// that lane exists to catch exactly those shipped-build defects.
//
// Per-test allowlist: `errorGuard.allow({ status: 404, url: /\/entities\// })` for an expected
// failure (it also covers the browser's "Failed to load resource" console line for that response),
// `errorGuard.allow({ console: /ResizeObserver/ })` for known console noise.

export type ErrorGuardMode = 'off' | 'report' | 'strict'

export type GuardFinding = {
  kind: 'api' | 'console' | 'pageerror' | 'csp' | 'third-party'
  message: string
  url?: string
  status?: number
  method?: string
}

export type GuardAllowance = {
  kind?: GuardFinding['kind']
  status?: number | number[]
  url?: RegExp | string
  console?: RegExp | string
}

function matches(pattern: RegExp | string | undefined, value: string | undefined) {
  if (pattern === undefined) return true
  if (value === undefined) return false
  return typeof pattern === 'string' ? value.includes(pattern) : pattern.test(value)
}

// The browser logs every failed response as a console error ("Failed to load resource: the
// server responded with a status of 404 (Not Found)", located at the resource's URL). Read as the
// API failure it echoes, so allowing a response also allows its console echo.
const RESOURCE_ECHO = /^Failed to load resource: the server responded with a status of (\d{3})/

function asApiEcho(finding: GuardFinding): GuardFinding | null {
  if (finding.kind !== 'console' || !finding.url?.startsWith(apiOrigin)) return null
  const status = RESOURCE_ECHO.exec(finding.message)?.[1]
  return status ? { kind: 'api', message: finding.message, url: finding.url, status: Number(status) } : null
}

function allowed(finding: GuardFinding, allowances: GuardAllowance[]): boolean {
  const echo = asApiEcho(finding)
  if (echo && allowed(echo, allowances.filter(a => a.console === undefined))) return true
  return allowances.some((a) => {
    if (a.kind && a.kind !== finding.kind) return false
    if (a.status !== undefined) {
      const statuses = [a.status].flat()
      if (finding.status === undefined || !statuses.includes(finding.status)) return false
    }
    if (a.url !== undefined && !matches(a.url, finding.url)) return false
    if (a.console !== undefined && !matches(a.console, finding.message)) return false
    return true
  })
}

const CSP_MARKER = '[csp-violation]'

// Noise that is never a product defect (browser-level, not from the console's code).
const DEFAULT_ALLOWANCES: GuardAllowance[] = [
  { kind: 'console', console: /Download the Vue Devtools extension/ },
  { kind: 'console', console: /ResizeObserver loop/ }
]

export class ErrorGuard {
  readonly findings: GuardFinding[] = []
  private readonly allowances: GuardAllowance[] = [...DEFAULT_ALLOWANCES]

  constructor(readonly mode: ErrorGuardMode) {}

  allow(...allowances: GuardAllowance[]) {
    this.allowances.push(...allowances)
  }

  record(finding: GuardFinding) {
    if (this.mode !== 'off') this.findings.push(finding)
  }

  unexpected(): GuardFinding[] {
    return this.findings.filter(f => !allowed(f, this.allowances))
  }

  async attach(context: BrowserContext) {
    if (this.mode === 'off') return
    await context.addInitScript((marker) => {
      document.addEventListener('securitypolicyviolation', (event) => {
        const where = event.sourceFile ? ` at ${event.sourceFile}:${event.lineNumber}:${event.columnNumber}` : ''
        console.error(`${marker} ${event.effectiveDirective} blocked ${event.blockedURI || 'inline'}${where}`)
      })
    }, CSP_MARKER)

    context.on('response', (response) => {
      const request = response.request()
      if (request.method() === 'OPTIONS' || response.status() < 400) return
      const url = response.url()
      if (!url.startsWith(apiOrigin)) return
      this.record({ kind: 'api', message: `${request.method()} ${url} → ${response.status()}`, url, status: response.status(), method: request.method() })
    })

    context.on('request', (request) => {
      const url = request.url()
      if (!/^https?:/.test(url)) return
      const origin = new URL(url).origin
      if (origin === appOrigin || origin === apiOrigin) return
      this.record({ kind: 'third-party', message: `${request.method()} ${url}`, url, method: request.method() })
    })

    context.on('console', (message) => {
      if (message.type() !== 'error') return
      const text = message.text()
      const isCsp = text.includes(CSP_MARKER) || /Content Security Policy/i.test(text)
      this.record({ kind: isCsp ? 'csp' : 'console', message: text, url: message.location().url })
    })

    context.on('weberror', (error) => {
      this.record({ kind: 'pageerror', message: String(error.error()?.stack ?? error.error()) })
    })
  }

  // Called after the test body: report, and in strict mode (or for shipped-build defects on
  // the static target) fail the test.
  async finish(testInfo: TestInfo) {
    if (this.mode === 'off' || this.findings.length === 0) return
    const unexpected = this.unexpected()
    await testInfo.attach('error-guard.json', {
      body: JSON.stringify({ mode: this.mode, unexpected, all: this.findings }, null, 2),
      contentType: 'application/json'
    })
    if (unexpected.length === 0) return
    testInfo.annotations.push({ type: 'error-guard', description: `${unexpected.length} unexpected: ${unexpected.slice(0, 3).map(f => f.message).join(' | ')}` })

    const alwaysFatal = e2eTarget === 'static' ? unexpected.filter(f => f.kind === 'csp' || f.kind === 'third-party') : []
    const fatal = this.mode === 'strict' ? unexpected : alwaysFatal
    if (fatal.length && testInfo.status === 'passed') {
      throw new Error(`Error guard: ${fatal.length} unexpected finding(s):\n${fatal.map(f => `  [${f.kind}] ${f.message}`).join('\n')}`)
    }
  }
}
