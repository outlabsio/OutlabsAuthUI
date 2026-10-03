import type { Locator, Page } from '@playwright/test'
import { cardByHeading, escapeRegExp } from './entities'
import { jsonResponse } from './mocks'

// The History card of a role or permission detail page (AppDefinitionHistoryCard): a UTimeline
// whose items each hold the event's title, its actor line and what it changed.

/** The card's events (timeline items), newest first. */
export function historyEvents(page: Page): Locator {
  return cardByHeading(page, 'History').locator('[data-slot="item"]').filter({ has: page.getByTestId('definition-history-event') })
}

/** The events titled `title` ("Created", "Updated", "Permissions added", …). */
export function historyEvent(page: Page, title: string): Locator {
  return historyEvents(page).filter({ hasText: title })
}

/**
 * Answer a definition's history (`/roles/{id}/history`, `/permissions/{id}/history`) with an
 * empty page, as for a definition written without history. Returns the URLs served, so a spec
 * can show the card read this answer.
 */
export async function serveEmptyHistory(page: Page, path: string): Promise<string[]> {
  const served: string[] = []
  await page.route(new RegExp(`${escapeRegExp(path)}(\\?.*)?$`), async (route) => {
    served.push(route.request().url())
    await route.fulfill(jsonResponse(200, { items: [], total: 0, page: 1, limit: 10, pages: 0 }))
  })
  return served
}
