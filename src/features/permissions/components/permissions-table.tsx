import { useMemo, useState } from 'react'

import { ChevronRight, Sparkles } from 'lucide-react'

import { AppEmptyState } from '@/components/app/app-empty-state'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Switch } from '@/components/ui/switch'
import type { Permission } from '@/features/permissions/types/permissions.types'
import {
  getPermissionActionLabel,
  getPermissionLifecycleLabel,
  getPermissionResourceLabel,
  getPermissionScopeLabel,
  getPermissionStatusVariant,
  groupPermissionsForCatalog,
} from '@/features/permissions/utils/permissions-display'
import { cn } from '@/lib/utils/cn'

type PermissionsTableProps = {
  permissions: Permission[]
  selectedPermissionId?: string
  isLoading: boolean
  isRefreshing: boolean
  hasActiveFilters: boolean
  canReadRoles: boolean
  roleCountsByPermissionName: Map<string, number>
  onPermissionSelect: (permissionId: string) => void
}

function getPermissionResourceKey(permission: Permission) {
  return permission.resource ?? permission.name.split(':')[0] ?? 'general'
}

function PermissionCatalogRow({
  permission,
  isSelected,
  canReadRoles,
  linkedRolesCount,
  onPermissionSelect,
}: {
  permission: Permission
  isSelected: boolean
  canReadRoles: boolean
  linkedRolesCount: number
  onPermissionSelect: (permissionId: string) => void
}) {
  const visibleTags = permission.tags.slice(0, 3)

  return (
    <button
      type="button"
      className={cn(
        'w-full min-w-0 rounded-2xl border px-4 py-4 text-left transition-colors',
        isSelected
          ? 'border-primary/25 bg-primary/6 shadow-sm'
          : 'border-border/70 bg-background/80 hover:bg-muted/20'
      )}
      onClick={() => onPermissionSelect(permission.id)}
    >
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.85fr)_minmax(0,0.75fr)_minmax(0,0.75fr)]">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium">{permission.display_name}</div>
            {isSelected ? <Badge variant="secondary">Selected</Badge> : null}
          </div>
          <div className="break-all font-mono text-xs text-muted-foreground">
            {permission.name}
          </div>
        </div>

        <div className="min-w-0 space-y-1.5">
          <div className="text-sm font-medium">{getPermissionActionLabel(permission)}</div>
          <div className="text-sm text-muted-foreground">
            {getPermissionResourceLabel(permission)}
          </div>
          <div className="text-xs text-muted-foreground">{getPermissionScopeLabel(permission)}</div>
        </div>

        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap gap-2">
            {permission.is_system ? (
              <Badge variant="secondary">System</Badge>
            ) : (
              <Badge variant="outline">Custom</Badge>
            )}
            <Badge variant={getPermissionStatusVariant(permission)}>
              {permission.status === 'active' ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {getPermissionLifecycleLabel(permission)}
          </div>
          <div className="text-xs text-muted-foreground">
            {canReadRoles
              ? `${linkedRolesCount} linked role${linkedRolesCount === 1 ? '' : 's'}`
              : 'Role usage hidden'}
          </div>
        </div>

        <div className="min-w-0 space-y-2">
          {visibleTags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {visibleTags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
              {permission.tags.length > visibleTags.length ? (
                <Badge variant="outline">+{permission.tags.length - visibleTags.length}</Badge>
              ) : null}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">No tags</span>
          )}
        </div>
      </div>
    </button>
  )
}

export function PermissionsTable({
  permissions,
  selectedPermissionId,
  isLoading,
  isRefreshing,
  hasActiveFilters,
  canReadRoles,
  roleCountsByPermissionName,
  onPermissionSelect,
}: PermissionsTableProps) {
  const groupedPermissions = useMemo(
    () => groupPermissionsForCatalog(permissions),
    [permissions]
  )
  const [groupedView, setGroupedView] = useState(true)
  const [resourceExpansionOverrides, setResourceExpansionOverrides] = useState<
    Record<string, boolean>
  >({})
  const defaultExpandedResources = useMemo(() => {
    const nextResources = new Set<string>()

    if (hasActiveFilters || groupedPermissions.length === 1) {
      groupedPermissions.forEach((group) => {
        nextResources.add(group.resource)
      })
    }

    if (selectedPermissionId) {
      const selectedPermission = permissions.find(
        (permission) => permission.id === selectedPermissionId
      )

      if (selectedPermission) {
        nextResources.add(getPermissionResourceKey(selectedPermission))
      }
    }

    return nextResources
  }, [groupedPermissions, hasActiveFilters, permissions, selectedPermissionId])
  const expandedResources = useMemo(() => {
    const validResources = new Set(groupedPermissions.map((group) => group.resource))
    const nextResources = new Set(defaultExpandedResources)

    Object.entries(resourceExpansionOverrides).forEach(([resource, isExpanded]) => {
      if (!validResources.has(resource)) {
        return
      }

      if (isExpanded) {
        nextResources.add(resource)
      } else {
        nextResources.delete(resource)
      }
    })

    return nextResources
  }, [defaultExpandedResources, groupedPermissions, resourceExpansionOverrides])

  function handleResourceToggle(resource: string) {
    setResourceExpansionOverrides((currentOverrides) => {
      const defaultExpanded = defaultExpandedResources.has(resource)
      const currentExpanded = currentOverrides[resource] ?? defaultExpanded
      const nextExpanded = !currentExpanded
      const nextOverrides = { ...currentOverrides }

      if (nextExpanded === defaultExpanded) {
        delete nextOverrides[resource]
      } else {
        nextOverrides[resource] = nextExpanded
      }

      return nextOverrides
    })
  }

  return (
    <Card className="flex h-full min-h-0 min-w-0 w-full max-w-full flex-col gap-0 overflow-hidden border border-border/70 bg-card/90 pb-0 pt-4 ring-0">
      <CardHeader className="border-b border-border/60">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
          <CardTitle className="text-base">Permission catalog</CardTitle>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <label className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm font-medium">
              <span className={cn(groupedView ? 'text-muted-foreground' : 'text-foreground')}>
                Flat
              </span>
              <Switch
                checked={groupedView}
                onCheckedChange={(checked) => setGroupedView(Boolean(checked))}
                aria-label="Toggle grouped permission view"
              />
              <span className={cn(groupedView ? 'text-foreground' : 'text-muted-foreground')}>
                Grouped
              </span>
            </label>

            {isRefreshing ? (
              <Badge variant="outline" className="gap-1.5">
                <Sparkles className="size-3.5" />
                Refreshing
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-0">
        {isLoading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
            Loading permissions…
          </div>
        ) : permissions.length === 0 ? (
          <AppEmptyState
            title="No permissions matched these filters."
            description="Adjust or clear the current filters."
            className="min-h-0 flex-1 border-none"
            compact
          />
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="min-h-0 min-w-0 flex-1 overflow-auto px-4 pb-0">
              {groupedView ? (
                <div className="min-w-0 space-y-3 pt-4">
                  {groupedPermissions.map((group) => {
                    const isExpanded = expandedResources.has(group.resource)
                    const selectedPermissionInGroup = group.permissions.find(
                      (permission) => permission.id === selectedPermissionId
                    )
                    const activeCount = group.permissions.filter(
                      (permission) => permission.status === 'active'
                    ).length

                    return (
                      <Collapsible key={group.resource} open={isExpanded}>
                        <div className="min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-background/70">
                          <CollapsibleTrigger
                            className="flex w-full min-w-0 items-center justify-between gap-4 px-4 py-3 text-left hover:bg-muted/20"
                            aria-label={`Toggle ${group.label} permission group`}
                            onClick={() => handleResourceToggle(group.resource)}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground">
                                <ChevronRight
                                  className={cn(
                                    'size-4 transition-transform',
                                    isExpanded ? 'rotate-90 text-foreground' : null
                                  )}
                                />
                              </div>

                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium">{group.label}</span>
                                  {selectedPermissionInGroup ? (
                                    <Badge variant="secondary">Selected</Badge>
                                  ) : null}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {group.permissions.length} permission
                                  {group.permissions.length === 1 ? '' : 's'} in this prefix
                                </div>
                              </div>
                            </div>

                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                              <Badge variant="outline">{activeCount} active</Badge>
                              {group.permissions.length !== activeCount ? (
                                <Badge variant="outline">
                                  {group.permissions.length - activeCount} inactive
                                </Badge>
                              ) : null}
                            </div>
                          </CollapsibleTrigger>

                          <CollapsibleContent className="border-t border-border/60 bg-muted/10">
                            <div className="space-y-3 p-3">
                              {group.permissions.map((permission) => (
                                <PermissionCatalogRow
                                  key={permission.id}
                                  permission={permission}
                                  isSelected={selectedPermissionId === permission.id}
                                  canReadRoles={canReadRoles}
                                  linkedRolesCount={
                                    roleCountsByPermissionName.get(permission.name) ?? 0
                                  }
                                  onPermissionSelect={onPermissionSelect}
                                />
                              ))}
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    )
                  })}
                </div>
              ) : (
                <div className="min-w-0 space-y-3 pt-4">
                  {permissions.map((permission) => (
                    <PermissionCatalogRow
                      key={permission.id}
                      permission={permission}
                      isSelected={selectedPermissionId === permission.id}
                      canReadRoles={canReadRoles}
                      linkedRolesCount={roleCountsByPermissionName.get(permission.name) ?? 0}
                      onPermissionSelect={onPermissionSelect}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
