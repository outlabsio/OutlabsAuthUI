import { createSharedComposable, useNow } from '@vueuse/core'

// One shared clock for relative timestamps ("5 minutes ago"), ticking once a minute. Shared so
// a table of AppTimestamp cells runs one timer, not one per cell.
export const useRelativeNow = createSharedComposable(() => useNow({ interval: 60_000 }))
