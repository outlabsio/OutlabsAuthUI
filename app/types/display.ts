import type { BadgeColor } from '~/utils/status'

// One row of AppDetailList (see that component for rendering rules).
export type DetailItem = {
  // Stable key for the `#value-<key>` slot; defaults to the label.
  key?: string
  label: string
  value?: string | number | boolean | null
  // text (default) | code (ids, names like "user:read") | datetime | date | boolean
  type?: 'text' | 'code' | 'datetime' | 'date' | 'boolean'
  // Render as a badge. `label` defaults to the value in sentence case.
  badge?: { color: BadgeColor, label?: string, variant?: 'subtle' | 'outline' | 'soft' | 'solid' }
  // Span both columns (descriptions, long lists).
  full?: boolean
  // Shown instead of '—' when the value is missing.
  fallback?: string
  // A short explanation under the value, in the same row (why an account reaches every
  // organization, what a lockout means).
  description?: string
}
