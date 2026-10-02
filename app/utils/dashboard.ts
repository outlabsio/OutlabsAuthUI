// Pure rules of the dashboard (composables/useDashboard.ts).

export type DashboardTileStatus = 'pending' | 'error' | 'success'

// The accessible name of a count tile. Each tile is one link (UPageCard with `to`), whose stock
// name is the title only, so a screen reader would hear "Active users, link" without the count:
// "Active users: 12" (the number formatted as the tile shows it), "Active users: loading",
// "Active users: could not load".
export function dashboardTileLabel(label: string, status: DashboardTileStatus, value: number | null): string {
  if (status === 'pending') return `${label}: loading`
  if (status === 'error') return `${label}: could not load`
  return `${label}: ${value === null ? 'not reported' : value.toLocaleString()}`
}
