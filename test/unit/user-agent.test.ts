import { describe, expect, it } from 'vitest'
import { describeUserAgent } from '~/utils/user-agent'

describe('describeUserAgent', () => {
  it.each([
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36', 'Chrome 128 on macOS', 'desktop'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0.7339.16 Safari/537.36', 'Chrome 140 on macOS', 'desktop'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.2739.42', 'Edge 128 on Windows', 'desktop'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OPR/112.0.0.0', 'Opera 112 on Windows', 'desktop'],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', 'Firefox 131 on Linux', 'desktop'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15', 'Safari 17 on macOS', 'desktop'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1', 'Safari 17 on iOS', 'mobile'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.6613.98 Mobile/15E148 Safari/604.1', 'Chrome 128 on iOS', 'mobile'],
    ['Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1', 'Safari 17 on iPadOS', 'tablet'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36', 'Chrome 128 on Android', 'mobile'],
    ['Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36', 'Samsung Internet 25 on Android', 'mobile'],
    ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36', 'Chrome 128 on ChromeOS', 'desktop']
  ])('%s', (ua, label, kind) => {
    const summary = describeUserAgent(ua)
    expect(summary.label).toBe(label)
    expect(summary.kind).toBe(kind)
  })

  it.each([
    ['curl/8.7.1', 'curl 8.7'],
    ['python-requests/2.32.3', 'Python requests 2.32'],
    ['python-httpx/0.27.0', 'Python httpx 0.27'],
    ['node', 'Node.js'],
    ['undici', 'Node.js'],
    ['Go-http-client/1.1', 'Go 1.1'],
    ['PostmanRuntime/7.39.0', 'Postman 7.39']
  ])('recognises the HTTP client %s', (ua, label) => {
    expect(describeUserAgent(ua)).toMatchObject({ label, kind: 'client', os: null })
  })

  it('handles missing and unknown agents', () => {
    expect(describeUserAgent(null)).toEqual({ browser: null, os: null, kind: 'unknown', label: 'Unknown device' })
    expect(describeUserAgent('   ')).toMatchObject({ label: 'Unknown device' })
    expect(describeUserAgent('MyIntegration/2.1 (+https://example.com)')).toMatchObject({ label: 'MyIntegration/2.1', kind: 'unknown' })
  })
})
