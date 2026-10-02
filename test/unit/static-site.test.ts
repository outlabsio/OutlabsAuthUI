import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  applyHeaderRules,
  bakedDeploymentKeys,
  cspHash,
  extractInlineScripts,
  findUnhashableInlineCode,
  parseCsp,
  parseHeadersFile,
  readInlineNuxtConfig,
  rewriteCspInHeaders,
  setCspDirective
} from '../../scripts/lib/static-site.mjs'

const shell = [
  '<!DOCTYPE html><html><head>',
  '<script type="importmap">{"imports":{"#entry":"/_nuxt/a.js"}}</script>',
  '<script type="module" src="/_nuxt/a.js" crossorigin></script>',
  '<script>window.colorMode = 1</script>',
  '</head><body>',
  '<script>window.__NUXT__={};window.__NUXT__.config={public:{},app:{baseURL:"/"}}</script>',
  '<script type="application/json" id="__NUXT_DATA__">[1,2]</script>',
  '</body></html>'
].join('')

describe('inline scripts', () => {
  it('keeps executable inline scripts (classic, module, importmap) and skips src and data blocks', () => {
    const scripts = extractInlineScripts(shell)
    expect(scripts.map(s => s.type)).toEqual(['importmap', '', ''])
    expect(scripts[0]!.content).toBe('{"imports":{"#entry":"/_nuxt/a.js"}}')
  })

  it('hashes exactly the script text the browser hashes', () => {
    const body = 'window.colorMode = 1'
    const expected = createHash('sha256').update(body).digest('base64')
    expect(cspHash(body)).toBe(`'sha256-${expected}'`)
    // CRLF is normalized by the HTML parser before hashing.
    const [crlf] = extractInlineScripts('<script>a\r\nb</script>')
    expect(crlf!.content).toBe('a\nb')
  })

  it('flags inline code no hash can allow', () => {
    expect(findUnhashableInlineCode('<button onclick="go()">x</button>')).toEqual(['inline onclick handler'])
    expect(findUnhashableInlineCode('<a href="javascript:void(0)">x</a>')).toEqual(['javascript: URL'])
    expect(findUnhashableInlineCode(shell)).toEqual([])
  })
})

describe('inline Nuxt config', () => {
  it('reads window.__NUXT__.config without executing it in the host', () => {
    expect(readInlineNuxtConfig(shell)).toMatchObject({ public: {}, app: { baseURL: '/' } })
  })

  it('reports deployment values baked into the build', () => {
    expect(bakedDeploymentKeys({ public: { apiBaseUrl: '', authUi: { signup: '' } } })).toEqual([])
    expect(bakedDeploymentKeys({ public: { apiBaseUrl: 'http://localhost:8004', authUi: { channels: 'sms' } } })).toEqual(['apiBaseUrl', 'authUi'])
    expect(bakedDeploymentKeys(null)).toEqual([])
  })
})

describe('Content-Security-Policy editing', () => {
  const policy = 'default-src \'self\'; script-src \'self\'; connect-src *'

  it('replaces one directive and keeps the rest in order', () => {
    const next = setCspDirective(policy, 'connect-src', ['\'self\'', 'https://api.example.com', '\'self\''])
    expect(next).toBe('default-src \'self\'; script-src \'self\'; connect-src \'self\' https://api.example.com')
    expect(parseCsp(next).get('script-src')).toEqual(['\'self\''])
    expect(setCspDirective('default-src \'self\'', 'img-src', ['\'self\''])).toBe('default-src \'self\'; img-src \'self\'')
  })

  it('rewrites the policy lines of a _headers file and leaves comments alone', () => {
    const text = '# Content-Security-Policy: commented\n/*\n  Content-Security-Policy: script-src \'self\'\n  X-Frame-Options: DENY\n'
    const { text: next, count } = rewriteCspInHeaders(text, value => `${value} 'sha256-x'`)
    expect(count).toBe(1)
    expect(next).toContain('  Content-Security-Policy: script-src \'self\' \'sha256-x\'\n')
    expect(next).toContain('# Content-Security-Policy: commented')
  })
})

describe('_headers (Workers asset semantics)', () => {
  const file = [
    '# comment',
    '/*',
    '  X-Frame-Options: DENY',
    '  Cache-Control: private',
    '/_nuxt/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/_nuxt/builds/*',
    '  ! Cache-Control',
    '  Cache-Control: no-cache',
    '/files/:name/*',
    '  X-Name: :name-:splat',
    '/docs/*',
    '  Link: </a>',
    '  Link: </b>'
  ].join('\n')

  it('parses rules, detach lines and repeated names', () => {
    const { rules, invalid } = parseHeadersFile(file)
    expect(invalid).toEqual([])
    expect(rules).toHaveLength(5)
    expect(rules[2]).toMatchObject({ path: '/_nuxt/builds/*', unset: ['Cache-Control'], set: { 'cache-control': 'no-cache' } })
    expect(rules[4]!.set.link).toBe('</a>, </b>')
  })

  it('joins a header set by two matching rules and lets "! Name" reset it', () => {
    const { rules } = parseHeadersFile(file)
    const defaults = () => ({ 'cache-control': 'public, max-age=0, must-revalidate' })
    expect(applyHeaderRules(rules, '/_nuxt/a.js', defaults())['cache-control']).toBe('private, public, max-age=31536000, immutable')
    expect(applyHeaderRules(rules, '/_nuxt/builds/latest.json', defaults())['cache-control']).toBe('no-cache')
    // A rule's own value replaces the asset server's default instead of joining it.
    expect(applyHeaderRules(rules, '/index.html', defaults())['cache-control']).toBe('private')
    expect(applyHeaderRules(rules, '/files/report/2026/q3.pdf', {})['x-name']).toBe('report-2026/q3.pdf')
  })

  it('reports invalid lines and the rule limit like wrangler', () => {
    expect(parseHeadersFile('X-Frame-Options: DENY').invalid).toHaveLength(1)
    expect(parseHeadersFile('/a/*/b/*\n  X-A: 1').invalid[0]!.message).toMatch(/one wildcard/)
    expect(parseHeadersFile(`/*\n  X-Long: ${'a'.repeat(2001)}`).invalid[0]!.message).toMatch(/2000/)
    const many = Array.from({ length: 110 }, (_, i) => `/r${i}\n  X-A: 1`).join('\n')
    expect(parseHeadersFile(many).invalid.at(-1)!.message).toMatch(/More than 100 rules/)
  })
})
