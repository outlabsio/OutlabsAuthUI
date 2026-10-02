import { h } from 'vue'

// Table display helpers shared by list pages.

// A column header that screen readers announce but sighted users do not see — for the
// row-actions column, which otherwise renders an empty, unnamed <th> (F-221).
//   { id: 'actions', header: srOnlyHeader('Actions') }
export function srOnlyHeader(label: string) {
  return () => h('span', { class: 'sr-only' }, label)
}

// Column `meta` that hides a secondary column below the `sm` breakpoint (phones), so tables
// fit a 390px screen without horizontal scrolling. Pure CSS: no breakpoint listener.
//   { accessorKey: 'ip_address', header: 'IP address', meta: hideBelowSm }
export const hideBelowSm = { class: { th: 'hidden sm:table-cell', td: 'hidden sm:table-cell' } }

// The same, below `md` (tablets in portrait), for tertiary columns.
export const hideBelowMd = { class: { th: 'hidden md:table-cell', td: 'hidden md:table-cell' } }

// The same, below `lg` (small laptops), for columns that only fit a wide screen.
export const hideBelowLg = { class: { th: 'hidden lg:table-cell', td: 'hidden lg:table-cell' } }
