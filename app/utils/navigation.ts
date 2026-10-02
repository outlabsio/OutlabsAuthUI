import { APP_NAV_GROUPS, APP_SECTIONS, findAppSection, type AppNavGroup, type AppSection } from '~/utils/capabilities'

// Pure helpers behind the app shell's navigation: sidebar grouping, the active item on detail
// routes, history-aware back links and the panel scroll/focus memory. No Vue, Nuxt or DOM
// imports, so every rule here is unit-tested (test/unit/navigation.test.ts).

// An authenticated console route (the default layout); everything else is a guest page.
export function isAppPath(path: string): boolean {
  return path === '/app' || path.startsWith('/app/')
}

function pathOnly(fullPath: string): string {
  const end = fullPath.search(/[?#]/)
  const path = end === -1 ? fullPath : fullPath.slice(0, end)
  return path.length > 1 ? path.replace(/\/+$/, '') : path
}

// ── Sidebar grouping ──

export type AppNavGrouping = { group: AppNavGroup, sections: AppSection[] }

// The visible sections in APP_NAV_GROUPS order, keeping APP_SECTIONS order inside each group.
// Groups with no visible section are dropped, so an agent never sees an empty heading.
export function groupAppSections(visible: readonly AppSection[]): AppNavGrouping[] {
  const ids = new Set(visible.map(section => section.id))
  return APP_NAV_GROUPS
    .map(group => ({ group, sections: APP_SECTIONS.filter(section => section.nav === group.id && ids.has(section.id)) }))
    .filter(grouping => grouping.sections.length > 0)
}

// The owning section stays highlighted on its detail routes (/app/users/<id> keeps Users
// active). aria-current is 'page' on the section's own route and 'true' (current item of the
// set) on a record inside it; undefined elsewhere. Longest-prefix matching gives a nested route
// to the most specific section that owns it.
export function navCurrentFor(section: Pick<AppSection, 'id' | 'to'>, fullPath: string): 'page' | 'true' | undefined {
  const path = pathOnly(fullPath)
  if (findAppSection(path)?.id !== section.id) return undefined
  return path === section.to ? 'page' : 'true'
}

// ── Back navigation ──

// vue-router keeps the previous entry's full path in history.state.back. A back link may use
// the browser history only when that entry is another console page, so Back returns to where
// the user came from (an entity's member list, a filtered list page) instead of pushing the
// list route; a deep link, a new tab or an entry outside the console falls back to the list.
// An entry on the same path is the same record (another tab or filter of this page, pushed as a
// query change), not somewhere the user came from: Back leaves the record for its list rather
// than stepping through its own states.
export function historyBackTarget(state: unknown, currentFullPath: string): string | null {
  const back = state && typeof state === 'object' ? (state as { back?: unknown }).back : null
  if (typeof back !== 'string') return null
  const path = pathOnly(back)
  if (path === pathOnly(currentFullPath)) return null
  if (!isAppPath(path) || path === '/app') return null
  return back
}

// Accessible name of a back link: the section it returns to, or a plain "Back" when history
// returns to a record rather than a list.
export function backLinkLabel(target: string | null, fallbackLabel: string): string {
  if (!target) return `Back to ${fallbackLabel}`
  const section = findAppSection(pathOnly(target))
  return section && pathOnly(target) === section.to ? `Back to ${section.label}` : 'Back'
}

// ── Scroll behaviour (router.options.ts) ──

// Where a navigation leaves the scroll position. Console pages scroll their panels, never the
// window: a Back/Forward traversal restores the remembered panels ('restore-panels'), an anchor
// is scrolled into view inside its panel ('reveal-anchor'), and anything else keeps the fresh
// page at the top of its panels ('keep'). Guest pages scroll the window as Nuxt's default
// scrollBehavior does: the saved position on Back/Forward, the anchor, or the top, and nothing
// when the page opts out with definePageMeta({ scrollToTop: false }) or only the query changed.
// `afterRender`: apply once the new page has rendered (page:loading:end), not immediately.
export type ScrollPlan
  = | { kind: 'keep' }
    | { kind: 'restore-panels', afterRender: boolean }
    | { kind: 'reveal-anchor', afterRender: boolean }
    | { kind: 'window', position: 'saved' | 'anchor' | 'top', afterRender: boolean }

export type ScrollRoute = { path: string, hash: string }

export function planScroll(
  to: ScrollRoute,
  // null on the first navigation of the app (vue-router's START_LOCATION).
  from: ScrollRoute | null,
  hasSavedPosition: boolean,
  // The destination page's resolved scrollToTop meta (undefined when not set).
  scrollToTop?: boolean
): ScrollPlan {
  const samePath = from !== null && pathOnly(to.path) === pathOnly(from.path)

  if (isAppPath(pathOnly(to.path))) {
    if (hasSavedPosition && from !== null) return { kind: 'restore-panels', afterRender: !samePath }
    if (to.hash && !(samePath && from?.hash === to.hash)) return { kind: 'reveal-anchor', afterRender: !samePath }
    return { kind: 'keep' }
  }

  if (samePath) {
    if (from.hash && !to.hash) return { kind: 'window', position: hasSavedPosition ? 'saved' : 'top', afterRender: false }
    if (to.hash) return { kind: 'window', position: 'anchor', afterRender: false }
    return { kind: 'keep' }
  }
  if (scrollToTop === false) return { kind: 'keep' }
  const position = hasSavedPosition ? 'saved' : to.hash ? 'anchor' : 'top'
  return { kind: 'window', position, afterRender: from !== null }
}

// ── Panel scroll and focus memory ──

// The dashboard scrolls panel bodies, never the window, so the router's saved positions are
// always 0. The shell records the scrolled elements of the page (panel bodies and tables inside
// them) and the focused link when leaving a console page and restores them when history
// returns to that entry.
export type PanelMemoryEntry = {
  // Scroll container (selector from the main landmark, anchored on its panel) -> scrollTop.
  scroll: Record<string, number>
  // href of the link to refocus (the activated link, else the link to the page that was opened).
  focusHref: string | null
  // Recorded at (ms), for pruning.
  at: number
}

export type PanelMemory = Record<string, PanelMemoryEntry>

// One entry per history entry: the same URL visited twice keeps two positions.
export function panelMemoryKey(historyPosition: unknown, fullPath: string): string {
  const position = typeof historyPosition === 'number' && Number.isFinite(historyPosition) ? historyPosition : 'x'
  return `${position}|${fullPath}`
}

// Keep the newest `max` entries.
export function prunePanelMemory(memory: PanelMemory, max: number): PanelMemory {
  const keys = Object.keys(memory)
  if (keys.length <= max) return memory
  const newest = keys.sort((a, b) => memory[b]!.at - memory[a]!.at).slice(0, max)
  return Object.fromEntries(newest.map(key => [key, memory[key]!]))
}

function isEntry(value: unknown): value is PanelMemoryEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  const scroll = entry.scroll
  return typeof entry.at === 'number'
    && (entry.focusHref === null || typeof entry.focusHref === 'string')
    && !!scroll && typeof scroll === 'object'
    && Object.values(scroll as Record<string, unknown>).every(top => typeof top === 'number' && top >= 0)
}

// sessionStorage payload -> memory; anything malformed is dropped rather than trusted.
export function parsePanelMemory(raw: string | null): PanelMemory {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([, value]) => isEntry(value))) as PanelMemory
  } catch {
    return {}
  }
}
