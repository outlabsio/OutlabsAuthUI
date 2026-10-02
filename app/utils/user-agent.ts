// Turn a session's raw User-Agent header into something an admin can recognise
// ("Chrome 128 on macOS"). Deliberately small: it names the common browsers, operating systems
// and non-browser clients (curl, scripts, SDKs) and falls back to the raw string's first token.
// The full header stays available to the UI (AppSessionsTable shows it in a tooltip).

export type DeviceKind = 'desktop' | 'mobile' | 'tablet' | 'client' | 'unknown'

export type UserAgentSummary = {
  browser: string | null
  os: string | null
  kind: DeviceKind
  // "Chrome 128 on macOS", "curl 8.7", "Unknown device"
  label: string
}

type Rule = { name: string, pattern: RegExp }

// Order matters: Edge and Opera also say "Chrome"; Chrome also says "Safari".
const BROWSERS: Rule[] = [
  { name: 'Edge', pattern: /\bEdg(?:e|A|iOS)?\/(\d+)/ },
  { name: 'Opera', pattern: /\b(?:OPR|Opera)\/(\d+)/ },
  { name: 'Samsung Internet', pattern: /\bSamsungBrowser\/(\d+)/ },
  { name: 'Firefox', pattern: /\b(?:Firefox|FxiOS)\/(\d+)/ },
  { name: 'Chrome', pattern: /\b(?:HeadlessChrome|Chrome|CriOS)\/(\d+)/ },
  { name: 'Safari', pattern: /\bVersion\/(\d+)(?:\.\d+)*.*\bSafari\// }
]

// Non-browser HTTP clients that commonly hold refresh tokens in scripts and tests.
const CLIENTS: Rule[] = [
  { name: 'curl', pattern: /^curl\/(\d+(?:\.\d+)?)/i },
  { name: 'Python requests', pattern: /^python-requests\/(\d+(?:\.\d+)?)/i },
  { name: 'Python httpx', pattern: /^python-httpx\/(\d+(?:\.\d+)?)/i },
  { name: 'Python', pattern: /^Python-urllib\/(\d+(?:\.\d+)?)/i },
  { name: 'Node.js', pattern: /^(?:node|undici|node-fetch|axios)(?:\/(\d+(?:\.\d+)?))?/i },
  { name: 'Go', pattern: /^Go-http-client\/(\d+(?:\.\d+)?)/i },
  { name: 'Postman', pattern: /^PostmanRuntime\/(\d+(?:\.\d+)?)/i },
  { name: 'Insomnia', pattern: /^insomnia\/(\d+(?:\.\d+)?)/i },
  { name: 'Wget', pattern: /^Wget\/(\d+(?:\.\d+)?)/i },
  { name: 'okhttp', pattern: /^okhttp\/(\d+(?:\.\d+)?)/i }
]

const OSES: Rule[] = [
  { name: 'iPadOS', pattern: /\biPad\b/ },
  { name: 'iOS', pattern: /\b(?:iPhone|iPod)\b/ },
  { name: 'Android', pattern: /\bAndroid\b/ },
  { name: 'ChromeOS', pattern: /\bCrOS\b/ },
  { name: 'Windows', pattern: /\bWindows\b/ },
  { name: 'macOS', pattern: /\bMac OS X\b|\bMacintosh\b/ },
  { name: 'Linux', pattern: /\bLinux\b|\bX11\b/ }
]

function firstMatch(rules: Rule[], ua: string): { name: string, version: string | null } | null {
  for (const rule of rules) {
    const match = rule.pattern.exec(ua)
    if (match) return { name: rule.name, version: match[1] ?? null }
  }
  return null
}

function deviceKind(ua: string, os: string | null): DeviceKind {
  if (os === 'iPadOS' || /\bTablet\b/i.test(ua)) return 'tablet'
  if (os === 'iOS' || /\bMobile\b/.test(ua) || (os === 'Android' && !/\bTablet\b/i.test(ua))) return 'mobile'
  if (os) return 'desktop'
  return 'unknown'
}

export function describeUserAgent(userAgent: string | null | undefined): UserAgentSummary {
  const ua = (userAgent ?? '').trim()
  if (!ua) return { browser: null, os: null, kind: 'unknown', label: 'Unknown device' }

  const client = firstMatch(CLIENTS, ua)
  if (client) {
    const label = client.version ? `${client.name} ${client.version}` : client.name
    return { browser: client.name, os: null, kind: 'client', label }
  }

  const browserMatch = firstMatch(BROWSERS, ua)
  const osMatch = firstMatch(OSES, ua)
  const browser = browserMatch ? (browserMatch.version ? `${browserMatch.name} ${browserMatch.version}` : browserMatch.name) : null
  const os = osMatch?.name ?? null
  const kind = deviceKind(ua, os)

  let label: string
  if (browser && os) label = `${browser} on ${os}`
  else if (browser) label = browser
  else if (os) label = `${os} device`
  // Unrecognised client: its product token ("MyApp/2.1 (...)" -> "MyApp/2.1").
  else label = ua.split(/\s+/)[0]!.slice(0, 60)

  return { browser, os, kind, label }
}

// A session named for a confirmation title: "Chrome 128 on macOS, 127.0.0.1".
export function sessionDeviceLabel(session: { user_agent?: string | null, ip_address?: string | null }): string {
  return [describeUserAgent(session.user_agent).label, session.ip_address].filter(Boolean).join(', ')
}
