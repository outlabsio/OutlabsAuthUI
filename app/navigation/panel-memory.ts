import { panelMemoryKey, parsePanelMemory, prunePanelMemory, type PanelMemory } from '~/utils/navigation'

// Scroll and focus memory for console pages (F-217). The dashboard layout is a fixed,
// full-viewport group whose panels scroll their own bodies, so the router's saved window
// positions are always 0 and returning to a long list would land at the top with focus lost.
// Before leaving a console page the shell records every scrolled element in the page (panel
// bodies and the tables that scroll inside them) and the focused link
// (plugins/02.panel-memory.client.ts); when history returns to that entry, router.options.ts
// restores them once the page has rendered its data.
// Kept in sessionStorage (per tab) so it also survives a reload of the page in between.

// The main landmark the default layout renders around the page panels (skip-link target).
export const MAIN_CONTENT_ID = 'main-content'

const STORAGE_KEY = 'outlabs-auth-ui.panel-memory'
const MAX_ENTRIES = 50
// Lists may still be loading when the page mounts: keep trying this long, unless the user
// scrolls, taps or types first.
const RESTORE_TIMEOUT_MS = 3000
const INTERACTION_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const

let memory: PanelMemory | null = null
// history.state.position of the entry currently shown (set after every navigation). During a
// Back/Forward navigation history.state already describes the destination, so the entry being
// left is identified by this tracked value instead.
let shownPosition: unknown = null
// Bumped by every navigation and user interaction; a restore in flight stops when it changes.
let generation = 0

function load(): PanelMemory {
  if (memory) return memory
  try {
    memory = parsePanelMemory(window.sessionStorage.getItem(STORAGE_KEY))
  } catch {
    memory = {}
  }
  return memory
}

function persist() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memory ?? {}))
  } catch {
    // Storage unavailable (private mode, quota): memory still works for this document.
  }
}

// Where each scrolled element sits, as a selector from the main landmark: anchored on its
// UDashboardPanel (id "dashboard-panel-<id>") and then a child-index path. Panel bodies scroll,
// and so do elements inside them (a UTable root scrolls itself within the panel body).
function scrollPath(main: HTMLElement, element: Element): string | null {
  const parts: string[] = []
  let node: Element = element
  while (node !== main) {
    if (node.id.startsWith('dashboard-panel-')) return [`#${CSS.escape(node.id)}`, ...parts].join(' > ')
    const parent = node.parentElement
    if (!parent) return null
    parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${Array.prototype.indexOf.call(parent.children, node) + 1})`)
    node = parent
  }
  return parts.length ? `:scope > ${parts.join(' > ')}` : null
}

function scrolledElements(main: HTMLElement): Record<string, number> {
  const scroll: Record<string, number> = {}
  for (const element of main.querySelectorAll('*')) {
    if (element.scrollTop <= 0) continue
    const path = scrollPath(main, element)
    if (path) scroll[path] = Math.round(element.scrollTop)
  }
  return scroll
}

function scrollTarget(main: HTMLElement, path: string): HTMLElement | null {
  try {
    return main.querySelector<HTMLElement>(path)
  } catch {
    return null
  }
}

function findLink(href: string): HTMLAnchorElement | null {
  const main = document.getElementById(MAIN_CONTENT_ID)
  if (!main) return null
  for (const link of main.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    if (link.getAttribute('href') === href) return link
  }
  return null
}

function inViewport(element: Element): boolean {
  const rect = element.getBoundingClientRect()
  return rect.bottom > 0 && rect.top < window.innerHeight
}

export function trackShownEntry() {
  shownPosition = window.history.state?.position
}

// Record the page being left. `destinationHref` is the page being opened: when focus is not on
// a link inside the page (a row click, the palette), the link to that destination is the one
// to refocus on return.
export function rememberPanels(fromFullPath: string, destinationHref: string) {
  generation++
  const main = document.getElementById(MAIN_CONTENT_ID)
  if (!main) return
  const scroll = scrolledElements(main)
  const active = document.activeElement
  const focusHref = active instanceof HTMLAnchorElement && main.contains(active)
    ? active.getAttribute('href')
    : destinationHref
  const store = load()
  store[panelMemoryKey(shownPosition, fromFullPath)] = { scroll, focusHref, at: Date.now() }
  memory = prunePanelMemory(store, MAX_ENTRIES)
  persist()
}

// Restore the entry history just returned to: panel scroll positions as soon as the content
// is tall enough, then focus on the remembered link.
export function restorePanels(toFullPath: string) {
  const entry = load()[panelMemoryKey(window.history.state?.position, toFullPath)]
  if (!entry) return
  const run = ++generation
  const started = performance.now()
  const settled = new Set<string>()
  let focused = !entry.focusHref

  const stop = () => {
    if (run === generation) generation++
  }
  for (const type of INTERACTION_EVENTS) window.addEventListener(type, stop, { capture: true, passive: true })
  const finish = () => {
    for (const type of INTERACTION_EVENTS) window.removeEventListener(type, stop, { capture: true })
  }

  const focusLink = () => {
    const link = entry.focusHref ? findLink(entry.focusHref) : null
    if (!link) return false
    link.focus({ preventScroll: true })
    if (!inViewport(link)) link.scrollIntoView({ block: 'nearest' })
    return true
  }

  const tick = () => {
    if (run !== generation) return finish()
    const main = document.getElementById(MAIN_CONTENT_ID)
    let pending = false
    for (const [path, top] of Object.entries(entry.scroll)) {
      if (settled.has(path)) continue
      const element = main ? scrollTarget(main, path) : null
      if (!element) {
        pending = true
        continue
      }
      // Scroll as far as the content allows now; keep going while the list is still filling in.
      const reachable = Math.max(0, element.scrollHeight - element.clientHeight)
      element.scrollTop = Math.min(top, reachable)
      if (reachable >= top) settled.add(path)
      else pending = true
    }
    const timedOut = performance.now() - started >= RESTORE_TIMEOUT_MS
    if (!focused && (!pending || timedOut)) focused = focusLink()
    if ((pending || !focused) && !timedOut) requestAnimationFrame(tick)
    else finish()
  }
  requestAnimationFrame(tick)
}
