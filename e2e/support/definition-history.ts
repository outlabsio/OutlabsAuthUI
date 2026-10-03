import type { Locator, Page } from '@playwright/test'
import { cardByHeading } from './entities'

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
