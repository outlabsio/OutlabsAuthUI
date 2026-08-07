import { useQuery } from '@pinia/colada'
import { permissionsListQuery } from '~/queries/permissions'
import type { Permission, PermissionGroup, ResolvedPermission } from '~/types/permission'

// Shared catalog of all permissions — the one source the AppPermission*/AppRole* kit uses to turn
// permission NAMES ("user:read") into rich, grouped display. Backed by a single cached Colada query
// (deduped across every consumer), so a permission renders identically everywhere. Always yields a
// renderable result: unknown names fall back to splitting the name on ':'.

function splitName(name: string): { resource: string, action: string } {
  const idx = name.indexOf(':')
  return idx === -1 ? { resource: name, action: '' } : { resource: name.slice(0, idx), action: name.slice(idx + 1) }
}

export function usePermissionCatalog() {
  // Permissions endpoint caps limit at 1000 — enough to hold the whole catalog in one page.
  const { data, status } = useQuery(permissionsListQuery({ limit: 1000 }))

  const all = computed<Permission[]>(() => data.value?.items ?? [])
  const byName = computed(() => {
    const map = new Map<string, Permission>()
    for (const p of all.value) map.set(p.name, p)
    return map
  })

  function resolve(name: string): ResolvedPermission {
    const p = byName.value.get(name)
    const parts = splitName(name)
    return {
      name,
      displayName: p?.display_name || name,
      resource: p?.resource || parts.resource,
      action: p?.action || parts.action,
      description: p?.description ?? null
    }
  }

  function resolveMany(names: string[]): ResolvedPermission[] {
    return names.map(resolve)
  }

  // Dedupe + group by resource, resources and actions sorted — the canonical display order.
  function groupByResource(names: string[]): PermissionGroup[] {
    const seen = new Set<string>()
    const groups = new Map<string, ResolvedPermission[]>()
    for (const name of names) {
      if (seen.has(name)) continue
      seen.add(name)
      const rp = resolve(name)
      const arr = groups.get(rp.resource) ?? []
      arr.push(rp)
      groups.set(rp.resource, arr)
    }
    return [...groups.entries()]
      .map(([resource, items]) => ({ resource, items: items.sort((a, b) => a.action.localeCompare(b.action)) }))
      .sort((a, b) => a.resource.localeCompare(b.resource))
  }

  return { status, all, byName, resolve, resolveMany, groupByResource }
}
