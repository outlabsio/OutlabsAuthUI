import { describe, expect, it } from 'vitest'
import { localImageSrc } from '~/utils/avatar'
import { dashboardTileLabel } from '~/utils/dashboard'

// Display rules: which avatar images the CSP lets the console show, and how a dashboard count
// tile is named for assistive technology.

const ORIGIN = 'https://console.example.com'

describe('localImageSrc (c-security-csp-blocks-provider-avatars)', () => {
  it('never binds a provider avatar on another host: the CSP would block it', () => {
    expect(localImageSrc('https://lh3.googleusercontent.com/a/photo.jpg', ORIGIN)).toBeUndefined()
    expect(localImageSrc('https://avatars.githubusercontent.com/u/1?v=4', ORIGIN)).toBeUndefined()
    expect(localImageSrc('//lh3.googleusercontent.com/a/photo.jpg', ORIGIN)).toBeUndefined()
    expect(localImageSrc('http://console.example.com/avatar.png', ORIGIN)).toBeUndefined()
  })

  it('binds same-origin and data: images, which img-src allows', () => {
    expect(localImageSrc('/avatars/ana.png', ORIGIN)).toBe('https://console.example.com/avatars/ana.png')
    expect(localImageSrc('https://console.example.com/avatars/ana.png', ORIGIN)).toBe('https://console.example.com/avatars/ana.png')
    expect(localImageSrc('data:image/png;base64,iVBORw0KGgo=', ORIGIN)).toBe('data:image/png;base64,iVBORw0KGgo=')
  })

  it('binds nothing for an empty value or another scheme', () => {
    for (const value of [null, undefined, '', '   ', 'javascript:alert(1)', 'data:text/html,<p>x</p>']) {
      expect(localImageSrc(value, ORIGIN)).toBeUndefined()
    }
  })
})

describe('dashboardTileLabel (v-auth-shell-06)', () => {
  it('names the count with the title, and says when it is loading or failed', () => {
    expect(dashboardTileLabel('Wrong passwords', 'success', 3)).toBe('Wrong passwords: 3')
    expect(dashboardTileLabel('Active users', 'success', 0)).toBe('Active users: 0')
    expect(dashboardTileLabel('Active users', 'pending', null)).toBe('Active users: loading')
    expect(dashboardTileLabel('Active users', 'error', null)).toBe('Active users: could not load')
    expect(dashboardTileLabel('Roles', 'success', null)).toBe('Roles: not reported')
  })
})
