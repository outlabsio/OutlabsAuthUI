// Class strings in TypeScript (table column meta, badge maps) follow the same styling rules.
export const columnClass = { th: 'w-[12rem]', td: 'text-gray-600' } // expect-error: console/no-raw-tailwind
export const fineClass = { th: 'w-48', td: 'text-muted truncate' }
export const toneClass = (tone: string) => `text-${tone} bg-zinc-900/40` // expect-error: console/no-raw-tailwind
export const widthClass = (n: number) => `shrink-0 w-[${n}px]` // expect-error: console/no-raw-tailwind
export const shadeClass = { badge: 'text-success-600 dark:text-special-300' } // expect-error: console/no-raw-tailwind
export const semanticClass = { badge: 'text-success bg-special/10 border-accent' }

// Not class strings: CSS selectors and regular expressions stay allowed.
export const SEGMENTS = '[data-reka-date-field-segment]:not([data-reka-date-field-segment="literal"])'
export const SLUG = '^[a-z0-9-]+$'
export const ROW = 'tr[data-state="selected"] > td:first-child'
export const rowFor = (id: string) => `tr[data-row-id="${id}"] > td`
export const segmentFor = (part: string) => `[data-reka-date-field-segment="${part}"]`
