import { findAppSection } from '~/utils/capabilities'

// Document titles (WCAG 2.4.2). Every route gets its own title in the form
// "<page> · <app name>"; record pages prefix the record: "<record> · <section> · <app name>".
// The route announcer reads the title after each navigation, so these strings are also what a
// screen reader hears. Pure: unit-tested in test/unit/page-title.test.ts.

export const DEFAULT_APP_NAME = 'OutlabsAuth UI'

const TITLE_SEPARATOR = ' · '

// Guest pages. Their pages may override with usePageMeta (e.g. an invalid-link state).
const GUEST_ROUTE_TITLES: Record<string, string> = {
  '/auth/login': 'Sign in',
  '/auth/signup': 'Create your account',
  '/auth/forgot-password': 'Reset your password',
  '/auth/reset-password': 'Choose a new password',
  '/auth/recovery': 'Account recovery',
  '/auth/accept-invite': 'Accept your invitation',
  '/auth/magic-link': 'Sign-in link',
  '/auth/access-code': 'Sign in',
  '/auth/oauth/callback': 'Signing in'
}

function normalizePath(path: string): string {
  const end = path.search(/[?#]/)
  const bare = end === -1 ? path : path.slice(0, end)
  return bare.length > 1 ? bare.replace(/\/+$/, '') : bare
}

// The title a route has before (or without) a page-provided one: the owning section's label
// for console routes (APP_SECTIONS, so a renamed section retitles its pages), the guest-page
// name for auth routes, nothing otherwise.
export function routeFallbackTitle(path: string): string | undefined {
  const bare = normalizePath(path)
  return findAppSection(bare)?.label ?? GUEST_ROUTE_TITLES[bare]
}

// A record page's title: "<record> · <section>". Without a record (still loading, not found)
// it is the section alone.
export function composePageTitle(record: string | null | undefined, section: string | null | undefined): string | undefined {
  const name = record?.trim()
  const parent = section?.trim()
  if (name && parent && name !== parent) return `${name}${TITLE_SEPARATOR}${parent}`
  return name || parent || undefined
}

// The titleTemplate: "<title> · <app name>", or the app name alone.
export function formatDocumentTitle(title: string | null | undefined, appName: string | null | undefined): string {
  const app = appName?.trim() || DEFAULT_APP_NAME
  const page = title?.trim()
  return page && page !== app ? `${page}${TITLE_SEPARATOR}${app}` : app
}
