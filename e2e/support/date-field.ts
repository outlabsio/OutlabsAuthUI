import type { Page } from '@playwright/test'

// AppDateField = UInputDate (a group of month / day / year spinbuttons named by the field's label)
// plus a calendar button ("Open calendar for <label>").

// Pick a day of the month the calendar opens on (today's month when the field is empty). Reka's day
// cells expose an aria-label like "Monday, August 10, 2026". Days 10/20 are mid-month, so they never
// collide with adjacent-month spillover cells, and every month has both. A previously opened
// calendar closes on a macrotask, so two can briefly overlap: scope the click to the last one.
export async function pickDay(page: Page, fieldLabel: string, day: number) {
  await page.getByRole('button', { name: `Open calendar for ${fieldLabel}`, exact: true }).click()
  const now = new Date()
  const month = now.toLocaleDateString('en-US', { month: 'long' })
  const dayLabel = new RegExp(`${month} ${day}, ${now.getFullYear()}`)
  const calendar = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: dayLabel }) }).last()
  await calendar.getByRole('button', { name: dayLabel }).click()
}

// Type a day ('YYYY-MM-DD') into the field's segments, as a keyboard user would (en-US order).
export async function typeDay(page: Page, fieldLabel: string, date: string) {
  const [year, month, day] = date.split('-')
  const group = page.getByRole('group', { name: fieldLabel, exact: true })
  await group.getByRole('spinbutton').first().click()
  await page.keyboard.type(`${month}${day}${year}`)
}

// The day a field currently shows, as 'YYYY-MM-DD' ('' when a segment is empty).
export async function shownDay(page: Page, fieldLabel: string): Promise<string> {
  const group = page.getByRole('group', { name: fieldLabel, exact: true })
  const values = await group.getByRole('spinbutton').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-valuenow') ?? ''))
  const [month, day, year] = values
  if (!month || !day || !year) return ''
  return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}
