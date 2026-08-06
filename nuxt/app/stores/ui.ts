import { defineStore } from 'pinia'

// A3 — the second (and, per spec, final) Pinia store: cross-cutting UI preferences only.
// A third store requires a written reason in the PR. No server data here.
export const useUiStore = defineStore('ui', () => {
  // Mobile dashboard sidebar open/closed. Desktop collapse is owned by UDashboardSidebar.
  const sidebarOpen = ref(false)

  // Per-resource table page size preference, keyed by resource name.
  const tablePageSize = ref<Record<string, number>>({})

  function setPageSize(resource: string, size: number) {
    tablePageSize.value[resource] = size
  }

  function pageSize(resource: string, fallback = 20) {
    return tablePageSize.value[resource] ?? fallback
  }

  return { sidebarOpen, tablePageSize, setPageSize, pageSize }
})
