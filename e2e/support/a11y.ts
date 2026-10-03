import AxeBuilder from '@axe-core/playwright'
import { expect, type Locator, type Page } from '@playwright/test'

// The accessibility gate (F-138): axe (WCAG 2 A/AA) over a page or one dialog in light and dark
// mode, at desktop and phone width, plus two checks axe does not make:
//   - no select menu trigger is named "Show popup" (reka's default, which hides the field's label);
//   - at phone width the page never scrolls sideways (F-148).
//
// color-contrast stays out of the gate by owner decision (F-032, accepted 2026-10-02 as a known
// limitation; PRODUCTION.md section 3, ARCHITECTURE.md "Decisions"): stock subtle amber badges
// and primary buttons are below AA on light backgrounds, and the theme is not overridden.
//
// One scoped exception: the listbox inside a stock UCommandPalette (the role, permission and
// scope pickers) has no accessible name and its scrolling viewport no tab stop. It is operated
// from its labelled search input (aria-activedescendant), and Nuxt UI 4.11 offers no way to name
// the listbox, so those two rules are waived for exactly those nodes and nothing else. (Its
// empty message also sits inside the listbox, so the pickers never show the palette with nothing
// to list: loading and empty states are said in its place, and the sweep checks them.)
const PALETTE_WAIVED_RULES = new Set(['aria-input-field-name', 'scrollable-region-focusable'])
const PALETTE_NODE = /^<div[^>]*(role="listbox"[^>]*data-slot="content"|data-slot="content"[^>]*role="listbox"|role="presentation"[^>]*data-slot="viewport"|data-slot="viewport"[^>]*role="presentation")/
//
// And one more for the same reason: UDashboardPanel's scrolling body is a stock element without a
// tab stop, so a page whose content has no link or control (Settings on SimpleRBAC, a short
// read-only record at 390px) trips scrollable-region-focusable. Chromium and Firefox make such
// scrollers keyboard-focusable themselves; Safari does not, and the body cannot take a tabindex
// without patching the component. Waived for that element only; pages keep their own links.
const PANEL_BODY_NODE = /^<div[^>]*data-slot="body"[^>]*overflow-y-auto/

export type A11yVariant = { name: string, colorScheme: 'light' | 'dark', width: number, height: number }

export const A11Y_VARIANTS: A11yVariant[] = [
  { name: 'light 1440', colorScheme: 'light', width: 1440, height: 900 },
  { name: 'dark 1440', colorScheme: 'dark', width: 1440, height: 900 },
  { name: 'light 390', colorScheme: 'light', width: 390, height: 844 },
  { name: 'dark 390', colorScheme: 'dark', width: 390, height: 844 }
]

// For something that exists at one width only (a control the layout shows on phones or on
// desktops alone): both colour schemes at that width.
export const PHONE_VARIANTS = A11Y_VARIANTS.filter(variant => variant.width < 768)
export const DESKTOP_VARIANTS = A11Y_VARIANTS.filter(variant => variant.width >= 768)

type Violation = { id: string, impact: string | null | undefined, nodes: string[] }

async function analyze(page: Page, include?: string): Promise<Violation[]> {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).disableRules(['color-contrast'])
  if (include) builder = builder.include(include)
  const results = await builder.analyze()
  return results.violations
    .map(v => ({ ...v, nodes: PALETTE_WAIVED_RULES.has(v.id) ? v.nodes.filter(n => !PALETTE_NODE.test(n.html)) : v.nodes }))
    .map(v => ({ ...v, nodes: v.id === 'scrollable-region-focusable' ? v.nodes.filter(n => !PANEL_BODY_NODE.test(n.html)) : v.nodes }))
    .filter(v => v.nodes.length)
    .map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map(n => n.target.join(' ')) }))
}

/**
 * Runs the gate in every variant without reloading: the viewport and the colour scheme change in
 * place (the console follows prefers-color-scheme). `ready` waits for the content to settle after
 * each change; `include` scopes axe to one element (e.g. '[role="dialog"]'). `variants` narrows
 * the sweep for something that exists at one width only (PHONE_VARIANTS, DESKTOP_VARIANTS). The
 * page is left at the first variant's size, in light mode.
 */
export async function expectAccessible(page: Page, { scope, include, ready, variants = A11Y_VARIANTS }: {
  scope?: Locator
  include?: string
  ready?: () => Promise<void>
  variants?: A11yVariant[]
} = {}) {
  const problems: Record<string, unknown> = {}
  for (const variant of variants) {
    await page.setViewportSize({ width: variant.width, height: variant.height })
    await page.emulateMedia({ colorScheme: variant.colorScheme })
    if (variant.colorScheme === 'dark') await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    else await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
    await ready?.()
    // A scoped element must still be there: a dialog that closed when the layout changed would
    // otherwise pass without being scanned.
    if (scope) await expect(scope, `${variant.name}: the scanned element is on screen`).toBeVisible()
    const violations = await analyze(page, include)
    if (violations.length) problems[`${variant.name}: axe`] = violations
    // USelectMenu triggers only (data-slot="base"); a UInputMenu's chevron toggle is a separate
    // button beside its labelled input and may keep the generic name.
    const unnamed = await (scope ?? page.locator('body')).getByRole('button', { name: 'Show popup', exact: true })
      .and(page.locator('[data-slot="base"]')).count()
    if (unnamed) problems[`${variant.name}: select menus named "Show popup"`] = unnamed
    if (variant.width < 768 && !include) {
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
      if (scrollWidth > variant.width) problems[`${variant.name}: page scrolls sideways`] = scrollWidth
    }
  }
  await page.setViewportSize({ width: variants[0]!.width, height: variants[0]!.height })
  await page.emulateMedia({ colorScheme: 'light' })
  expect(problems).toEqual({})
}
