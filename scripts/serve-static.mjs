#!/usr/bin/env node
// Serve the generated artifact the way the Cloudflare Workers deployment does, for local
// previews and the static E2E target. Node built-ins only.
//
//   node scripts/serve-static.mjs --dir .output/public --port <n> [--host <host>] [--log]
//
// Mirrors wrangler.toml + cloudflare/not-found-worker.js:
// - `_headers` rules are applied to every asset response, including redirects and the SPA
//   fallback (same matching, "! Name" removal and ", " joining as the Workers asset server);
//   default Cache-Control is "public, max-age=0, must-revalidate"; ETag / If-None-Match.
// - html_handling = "drop-trailing-slash": /app/users serves app/users/index.html, and
//   /app/users/, /app/users/index.html and /index.html answer 307 to the slash-less URL.
// - not_found_handling = "single-page-application" for browser navigations only
//   (Sec-Fetch-Mode: navigate → index.html, 200); every other miss is a plain 404, as the
//   Worker answers it (no _headers applied).
// - _headers, _redirects and .assetsignore are configuration, never served.
// `_redirects` rules are not implemented (the console does not ship one).

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { ASSET_METAFILES, applyHeaderRules, parseHeadersFile } from './lib/static-site.mjs'

const { values } = parseArgs({
  options: {
    dir: { type: 'string', default: '.output/public' },
    port: { type: 'string', default: '3000' },
    host: { type: 'string', default: 'localhost' },
    log: { type: 'boolean', default: false }
  }
})

const root = path.resolve(values.dir)
const port = Number(values.port)
if (!existsSync(path.join(root, 'index.html'))) {
  console.error(`[serve-static] ${root}/index.html not found; run \`bun run generate\` first`)
  process.exit(1)
}
if (!Number.isInteger(port) || port <= 0) {
  console.error(`[serve-static] invalid --port ${values.port}`)
  process.exit(1)
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.svg': 'image/svg+xml',
  '.ico': 'image/vnd.microsoft.icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm'
}

// ── _headers (re-read when it changes, so a re-run preflight applies without a restart) ──
let headersCache = { mtimeMs: -1, rules: [] }
async function loadHeaderRules() {
  const file = path.join(root, '_headers')
  if (!existsSync(file)) return []
  const { mtimeMs } = await stat(file)
  if (mtimeMs !== headersCache.mtimeMs) {
    const { rules, invalid } = parseHeadersFile(await readFile(file, 'utf8'))
    for (const issue of invalid) console.warn(`[serve-static] _headers line ${issue.lineNumber}: ${issue.message}`)
    headersCache = { mtimeMs, rules }
  }
  return headersCache.rules
}

// ── Asset lookup ─────────────────────────────────────────────────────────────────────────
async function exists(assetPath) {
  if (ASSET_METAFILES.has(assetPath)) return false
  const full = path.join(root, assetPath)
  if (full !== root && !full.startsWith(root + path.sep)) return false
  try {
    return (await stat(full)).isFile()
  } catch {
    return false
  }
}

// Cloudflare html_handling = "drop-trailing-slash". Returns { serve } | { redirect } | null.
async function resolveDropTrailingSlash(p) {
  const exact = await exists(p)
  const redirectIf = async (file, destination) => ((await exists(file)) && !(await exists(destination)) ? { redirect: destination } : null)
  let result = null
  if (p.endsWith('/index')) {
    if (exact) return { serve: p }
    result = p === '/index'
      ? await redirectIf('/index.html', '/')
      : (await redirectIf(`${p.slice(0, -6)}.html`, p.slice(0, -6))) ?? (await redirectIf(`${p}.html`, p.slice(0, -6)))
  } else if (p.endsWith('/index.html')) {
    result = p === '/index.html'
      ? await redirectIf('/index.html', '/')
      : (await redirectIf(p, p.slice(0, -11))) ?? (exact ? { serve: p } : null) ?? (await redirectIf(`${p.slice(0, -11)}.html`, p.slice(0, -11)))
  } else if (p.endsWith('/')) {
    if (p === '/') return (await exists('/index.html')) ? { serve: '/index.html' } : null
    result = (await redirectIf(`${p.slice(0, -1)}.html`, p.slice(0, -1))) ?? (await redirectIf(`${p.slice(0, -1)}/index.html`, p.slice(0, -1)))
  } else if (p.endsWith('.html')) {
    result = (await redirectIf(p, p.slice(0, -5))) ?? (await redirectIf(`${p.slice(0, -5)}/index.html`, p.slice(0, -5)))
  }
  if (result) return result
  if (exact) return { serve: p }
  if (await exists(`${p}.html`)) return { serve: `${p}.html` }
  if (await exists(`${p}/index.html`)) return { serve: `${p}/index.html` }
  return null
}

function contentType(file) {
  return CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
}

function notFound(res, method) {
  // What cloudflare/not-found-worker.js answers: no _headers rules apply to it.
  res.writeHead(404, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-robots-tag': 'noindex, nofollow'
  })
  res.end(method === 'HEAD' ? undefined : 'Not found\n')
}

async function handle(req, res) {
  const method = (req.method ?? 'GET').toUpperCase()
  const url = new URL(req.url ?? '/', 'http://localhost')
  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return notFound(res, method)
  }
  const hostname = (req.headers.host ?? 'localhost').replace(/:\d+$/, '')
  const rules = await loadHeaderRules()

  let intent = await resolveDropTrailingSlash(pathname)
  if (!intent && req.headers['sec-fetch-mode'] === 'navigate') intent = { serve: '/index.html' }
  if (!intent) return notFound(res, method)
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' })
    return res.end()
  }

  if (intent.redirect) {
    const headers = applyHeaderRules(rules, pathname, { location: `${encodeURI(intent.redirect)}${url.search}` }, hostname)
    res.writeHead(307, headers)
    return res.end()
  }

  const body = await readFile(path.join(root, intent.serve))
  const etag = `"${createHash('sha256').update(body).digest('hex').slice(0, 32)}"`
  const headers = { 'etag': etag, 'content-type': contentType(intent.serve) }
  if (!req.headers.authorization && !req.headers.range) headers['cache-control'] = 'public, max-age=0, must-revalidate'
  applyHeaderRules(rules, pathname, headers, hostname)

  const ifNoneMatch = req.headers['if-none-match'] ?? ''
  if (ifNoneMatch === etag || ifNoneMatch === `W/${etag}`) {
    res.writeHead(304, headers)
    return res.end()
  }
  headers['content-length'] = String(body.length)
  res.writeHead(200, headers)
  res.end(method === 'HEAD' ? undefined : body)
}

function listener(req, res) {
  handle(req, res)
    .catch((error) => {
      console.error('[serve-static]', error)
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('Internal error\n')
    })
    .finally(() => {
      if (values.log) console.log(`[serve-static] ${req.method} ${req.url} ${res.statusCode}`)
    })
}

// "localhost" listens on both loopback families so browsers, curl and Playwright's readiness
// probe all connect whichever address they resolve first. Never binds a public interface
// unless --host asks for one.
const hosts = values.host === 'localhost' ? ['127.0.0.1', '::1'] : [values.host]
const servers = []
for (const host of hosts) {
  const server = createServer(listener)
  await new Promise((resolve, reject) => {
    server.once('error', (error) => {
      // A machine without IPv6 loopback still serves on 127.0.0.1.
      if (host === '::1' && hosts.length > 1 && ['EADDRNOTAVAIL', 'EAFNOSUPPORT'].includes(error.code)) resolve()
      else reject(error)
    })
    server.listen(port, host, () => {
      servers.push(server)
      resolve()
    })
  })
}

console.log(`[serve-static] serving ${path.relative(process.cwd(), root) || '.'} on http://${values.host}:${port} (Workers asset semantics: _headers, drop-trailing-slash, SPA fallback for navigations only)`)
// Production builds ignore NUXT_PUBLIC_* (see app/utils/runtime-config.ts), so without a staged
// config the console can only show its configuration error. Serve anyway (the E2E target
// tests exactly that screen) but say how to fix it.
if (!existsSync(path.join(root, 'app-config.json'))) {
  console.warn('[serve-static] warning: no app-config.json in the artifact; the console will show its configuration error. '
    + 'Stage one first: node scripts/deploy-preflight.mjs --local --config <app-config.json>')
}

function shutdown() {
  for (const server of servers) server.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
