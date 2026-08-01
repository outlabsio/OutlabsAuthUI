import { useMemo, useState } from 'react'

import { ChevronRight, Sparkles } from 'lucide-react'

import { AppEmptyState } from '@/components/app/app-empty-state'
import { AppStatusBadge } from '@/components/app/app-status-badge'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Switch } from '@/components/ui/switch'
import type { Permission } from '@/features/permissions/types/permissions.types'
import {
  getPermissionActionLabel,
  getPermissionLifecycleLabel,
  getPermissionResourceLabel,
  getPermissionScopeLabel,
  getPermissionStatusTone,
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
        'w-full min-w-0 border-b px-3 py-3 text-left transition-colors last:border-b-0',
        isSelected
          ? 'border-primary/20 bg-primary/6'
          : 'border-border/60 bg-transparent hover:bg-muted/20'
      )}
      onClick={() => onPermissionSelect(permission.id)}
    >
      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.75fr)_minmax(0,0.7fr)_minmax(0,0.7fr)]">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium">{permission.display_name}</div>
            {isSelected ? <Badge variant="secondary">Selected</Badge> : null}
          </div>
          <div className="break-all font-mono text-xs text-muted-foreground">
            {permission.name}
          </div>
        </div>

        <div className="min-w-0 space-y-1">
          <div className="text-sm font-medium">{getPermissionActionLabel(permission)}</div>
          <div className="text-sm text-muted-foreground">
            {getPermissionResourceLabel(permission)}
          </div>
          <div className="text-xs text-muted-foreground">{getPermissionScopeLabel(permission)}</div>
        </div>

        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap gap-2">
            {permission.is_system ? (
              <Badge variant="secondary">System</Badge>
            ) : (
              <Badge variant="outline">Custom</Badge>
            )}
            <AppStatusBadge tone={getPermissionStatusTone(permission)}>
              {permission.status === 'active'
                ? 'Active'
                : permission.status === 'archived'
                  ? 'Archived'
                  : 'Inactive'}
            </AppStatusBadge>
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

        <div className="min-w-0 space-y-1.5">
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
  const selectedPermissionResource = useMemo(() => {
    if (!selectedPermissionId) {
      return null
    }

    const selectedPermission = permissions.find(
      (permission) => permission.id === selectedPermissionId
    )

    return selectedPermission ? getPermissionResourceKey(selectedPermission) : null
  }, [permissions, selectedPermissionId])

  function deriveExpandedResource() {
    if (selectedPermissionResource) {
      return selectedPermissionResource
    }

    if (hasActiveFilters && groupedPermissions[0]) {
      return groupedPermissions[0].resource
    }

    return null
  }

  const expandedResourceSyncKey = `${selectedPermissionResource ?? ''}|${hasActiveFilters ? '1' : '0'}|${groupedPermissions[0]?.resource ?? ''}`
  const [syncedExpandedResourceKey, setSyncedExpandedResourceKey] = useState(
    expandedResourceSyncKey
  )
  const [expandedResource, setExpandedResource] = useState<string | null>(
    deriveExpandedResource
  )

  if (expandedResourceSyncKey !== syncedExpandedResourceKey) {
    setSyncedExpandedResourceKey(expandedResourceSyncKey)
    setExpandedResource(deriveExpandedResource())
  }

  function handleResourceToggle(resource: string) {
    setExpandedResource((currentResource) => (currentResource === resource ? null : resource))
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full max-w-full flex-col gap-0 overflow-hidden">
      <div className="shrink-0 px-4 pb-3 pt-4">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
          <h2 className="text-base font-semibold">Permission catalog</h2>
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
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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
                <div className="min-w-0 space-y-3 pt-2">
                  {groupedPermissions.map((group) => {
                    const isExpanded = expandedResource === group.resource
                    const selectedPermissionInGroup = group.permissions.find(
                      (permission) => permission.id === selectedPermissionId
                    )
                    const activeCount = group.permissions.filter(
                      (permission) => permission.status === 'active'
                    ).length

                    return (
                      <Collapsible key={group.resource} open={isExpanded}>
                        <div className="min-w-0 overflow-hidden rounded-2xl bg-background/70 ring-1 ring-border/60">
                          <CollapsibleTrigger
                            className="flex w-full min-w-0 items-center justify-between gap-4 px-4 py-3 text-left outline-none hover:bg-muted/20 focus-visible:ring-0 focus-visible:outline-none"
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

                          <CollapsibleContent className="border-t border-border/60 bg-muted/5">
                            <div>
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
                <div className="mt-2 min-w-0 overflow-hidden rounded-2xl bg-background/40 ring-1 ring-border/60">
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
      </div>
    </div>
  )
}
