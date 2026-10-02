import { describe, expect, it } from 'vitest'
import { APP_NAV_GROUPS, APP_SECTIONS, appSection, type AppSectionId } from '../../app/utils/capabilities'
import {
  backLinkLabel,
  groupAppSections,
  historyBackTarget,
  isAppPath,
  navCurrentFor,
  panelMemoryKey,
  parsePanelMemory,
  planScroll,
  prunePanelMemory,
  type PanelMemory
} from '../../app/utils/navigation'

const sections = (...ids: AppSectionId[]) => ids.map(appSection)

describe('isAppPath', () => {
  it.each([
    ['/app', true],
    ['/app/users', true],
    ['/app/users/123?tab=x', true],
    ['/application', false],
    ['/auth/login', false],
    ['/', false]
  ])('%s -> %s', (path, expected) => {
    expect(isAppPath(path)).toBe(expected)
  })
})

describe('APP_SECTIONS nav data', () => {
  it('places every section in a declared group', () => {
    const groupIds = APP_NAV_GROUPS.map(group => group.id)
    for (const section of APP_SECTIONS) expect(groupIds).toContain(section.nav)
  })

  it('offers personal pages from the user menu, not the sidebar', () => {
    expect(appSection('account').nav).toBe('user')
    expect(appSection('api-keys').nav).toBe('user')
    expect(appSection('api-keys').label).toBe('My API keys')
  })
})

describe('groupAppSections', () => {
  it('groups a superuser nav in shell order (Directory, Access control, Integrations, Monitoring)', () => {
    const grouped = groupAppSections(APP_SECTIONS)
    expect(grouped.map(g => [g.group.id, g.sections.map(s => s.id)])).toEqual([
      ['overview', ['dashboard']],
      ['directory', ['users', 'entities']],
      ['access-control', ['roles', 'permissions']],
      ['integrations', ['service-accounts']],
      ['monitoring', ['audit']],
      ['system', ['settings']],
      ['user', ['api-keys', 'account']]
    ])
    expect(grouped.find(g => g.group.id === 'directory')?.group.label).toBe('Directory')
  })

  it('drops empty groups so a low-privilege actor sees no bare headings', () => {
    const grouped = groupAppSections(sections('dashboard', 'api-keys', 'settings', 'account'))
    expect(grouped.map(g => g.group.id)).toEqual(['overview', 'system', 'user'])
  })

  it('keeps APP_SECTIONS order inside a group whatever the input order', () => {
    const grouped = groupAppSections(sections('entities', 'users'))
    expect(grouped[0]!.sections.map(s => s.id)).toEqual(['users', 'entities'])
  })
})

describe('navCurrentFor', () => {
  it('marks the section page itself as the current page', () => {
    expect(navCurrentFor(appSection('users'), '/app/users')).toBe('page')
    expect(navCurrentFor(appSection('users'), '/app/users?search=x')).toBe('page')
  })

  it('keeps the owning section active on its detail routes', () => {
    expect(navCurrentFor(appSection('users'), '/app/users/2473c83d')).toBe('true')
    expect(navCurrentFor(appSection('roles'), '/app/roles/abc')).toBe('true')
    expect(navCurrentFor(appSection('entities'), '/app/entities?entity=abc')).toBe('page')
  })

  it('uses the longest prefix: service accounts are not Users', () => {
    expect(navCurrentFor(appSection('users'), '/app/service-accounts')).toBeUndefined()
    expect(navCurrentFor(appSection('service-accounts'), '/app/service-accounts')).toBe('page')
    expect(navCurrentFor(appSection('service-accounts'), '/app/service-accounts/abc?entity=x')).toBe('true')
  })

  it('is undefined for other sections and guest routes', () => {
    expect(navCurrentFor(appSection('roles'), '/app/users')).toBeUndefined()
    expect(navCurrentFor(appSection('dashboard'), '/auth/login')).toBeUndefined()
  })
})

describe('historyBackTarget', () => {
  it('returns the previous console entry', () => {
    expect(historyBackTarget({ back: '/app/entities?entity=abc' }, '/app/users/1')).toBe('/app/entities?entity=abc')
    expect(historyBackTarget({ back: '/app/users?search=jane' }, '/app/users/1')).toBe('/app/users?search=jane')
  })

  it('falls back (null) on a deep link, a guest entry or a malformed state', () => {
    expect(historyBackTarget({ back: null }, '/app/users/1')).toBeNull()
    expect(historyBackTarget(null, '/app/users/1')).toBeNull()
    expect(historyBackTarget(undefined, '/app/users/1')).toBeNull()
    expect(historyBackTarget('state', '/app/users/1')).toBeNull()
    expect(historyBackTarget({ back: '/auth/login?redirect=/app/users/1' }, '/app/users/1')).toBeNull()
    expect(historyBackTarget({ back: 42 }, '/app/users/1')).toBeNull()
  })

  it('never goes back to the same entry or to the /app redirect', () => {
    expect(historyBackTarget({ back: '/app/users/1' }, '/app/users/1')).toBeNull()
    expect(historyBackTarget({ back: '/app' }, '/app/users/1')).toBeNull()
  })

  it('treats another state of the same record (a query-driven tab) as the record itself', () => {
    expect(historyBackTarget({ back: '/app/users/1' }, '/app/users/1?tab=roles')).toBeNull()
    expect(historyBackTarget({ back: '/app/users/1?tab=roles' }, '/app/users/1?tab=audit')).toBeNull()
    expect(historyBackTarget({ back: '/app/users/1/' }, '/app/users/1#keys')).toBeNull()
    // A different record is still somewhere the user came from.
    expect(historyBackTarget({ back: '/app/users/2?tab=roles' }, '/app/users/1')).toBe('/app/users/2?tab=roles')
  })
})

describe('planScroll', () => {
  const at = (path: string, hash = '') => ({ path, hash })

  it('restores the remembered panels on a console Back/Forward, after render unless only the query changed', () => {
    expect(planScroll(at('/app/users'), at('/app/users/1'), true)).toEqual({ kind: 'restore-panels', afterRender: true })
    expect(planScroll(at('/app/entities'), at('/app/entities'), true)).toEqual({ kind: 'restore-panels', afterRender: false })
  })

  it('never scrolls the window for a console page', () => {
    expect(planScroll(at('/app/users/1'), at('/app/users'), false)).toEqual({ kind: 'keep' })
    expect(planScroll(at('/app/users'), null, false)).toEqual({ kind: 'keep' })
    // Nothing to restore on the first load, even with a saved position (reload).
    expect(planScroll(at('/app/users'), null, true)).toEqual({ kind: 'keep' })
    expect(planScroll(at('/app/users'), at('/auth/login'), false, false)).toEqual({ kind: 'keep' })
  })

  it('reveals a console anchor inside its panel', () => {
    expect(planScroll(at('/app/settings', '#features'), at('/app/users'), false)).toEqual({ kind: 'reveal-anchor', afterRender: true })
    expect(planScroll(at('/app/settings', '#features'), at('/app/settings'), false)).toEqual({ kind: 'reveal-anchor', afterRender: false })
    expect(planScroll(at('/app/settings', '#features'), null, false)).toEqual({ kind: 'reveal-anchor', afterRender: true })
    // Only the query changed and the anchor is the same: leave the panel where it is.
    expect(planScroll(at('/app/settings', '#features'), at('/app/settings', '#features'), false)).toEqual({ kind: 'keep' })
  })

  it('scrolls guest pages like Nuxt\'s default', () => {
    expect(planScroll(at('/auth/signup'), at('/auth/login'), false)).toEqual({ kind: 'window', position: 'top', afterRender: true })
    expect(planScroll(at('/auth/login'), at('/auth/signup'), true)).toEqual({ kind: 'window', position: 'saved', afterRender: true })
    expect(planScroll(at('/auth/signup', '#terms'), at('/auth/login'), false)).toEqual({ kind: 'window', position: 'anchor', afterRender: true })
    expect(planScroll(at('/auth/login'), null, false)).toEqual({ kind: 'window', position: 'top', afterRender: false })
    expect(planScroll(at('/auth/login'), at('/app/users'), false)).toEqual({ kind: 'window', position: 'top', afterRender: true })
  })

  it('handles same-page guest hash changes at once and keeps the position on a query change', () => {
    expect(planScroll(at('/auth/signup', '#terms'), at('/auth/signup'), false)).toEqual({ kind: 'window', position: 'anchor', afterRender: false })
    expect(planScroll(at('/auth/signup'), at('/auth/signup', '#terms'), false)).toEqual({ kind: 'window', position: 'top', afterRender: false })
    expect(planScroll(at('/auth/signup'), at('/auth/signup', '#terms'), true)).toEqual({ kind: 'window', position: 'saved', afterRender: false })
    expect(planScroll(at('/auth/login'), at('/auth/login/'), false)).toEqual({ kind: 'keep' })
  })

  it('honours scrollToTop: false on guest pages', () => {
    expect(planScroll(at('/auth/signup'), at('/auth/login'), false, false)).toEqual({ kind: 'keep' })
    expect(planScroll(at('/auth/signup'), at('/auth/login'), true, false)).toEqual({ kind: 'keep' })
    expect(planScroll(at('/auth/signup'), at('/auth/login'), false, true)).toEqual({ kind: 'window', position: 'top', afterRender: true })
  })
})

describe('backLinkLabel', () => {
  it('names the list it falls back to', () => {
    expect(backLinkLabel(null, 'Users')).toBe('Back to Users')
  })

  it('names the section history returns to, or says Back for a record', () => {
    expect(backLinkLabel('/app/entities?entity=abc', 'Users')).toBe('Back to Entities')
    expect(backLinkLabel('/app/users?status=all', 'Users')).toBe('Back to Users')
    expect(backLinkLabel('/app/roles/abc', 'Users')).toBe('Back')
  })
})

describe('panel memory', () => {
  const entry = (at: number) => ({ scroll: { 'dashboard-panel-users': 120 }, focusHref: '/app/users/1', at })

  it('keys by history position and full path', () => {
    expect(panelMemoryKey(3, '/app/users?page=2')).toBe('3|/app/users?page=2')
    expect(panelMemoryKey(undefined, '/app/users')).toBe('x|/app/users')
    expect(panelMemoryKey(Number.NaN, '/app/users')).toBe('x|/app/users')
  })

  it('prunes to the newest entries', () => {
    const memory: PanelMemory = { a: entry(1), b: entry(3), c: entry(2) }
    expect(Object.keys(prunePanelMemory(memory, 2)).sort()).toEqual(['b', 'c'])
    expect(prunePanelMemory(memory, 5)).toBe(memory)
  })

  it('parses stored memory and drops malformed entries', () => {
    const raw = JSON.stringify({
      good: entry(1),
      nullFocus: { scroll: {}, focusHref: null, at: 2 },
      negative: { scroll: { p: -1 }, focusHref: null, at: 1 },
      noAt: { scroll: {}, focusHref: null },
      junk: 'x'
    })
    expect(Object.keys(parsePanelMemory(raw)).sort()).toEqual(['good', 'nullFocus'])
    expect(parsePanelMemory(null)).toEqual({})
    expect(parsePanelMemory('not json')).toEqual({})
    expect(parsePanelMemory('[1,2]')).toEqual({})
  })
})
