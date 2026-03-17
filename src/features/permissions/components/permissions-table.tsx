import { Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Permission } from '@/features/permissions/types/permissions.types'
import {
  getPermissionActionLabel,
  getPermissionLifecycleLabel,
  getPermissionResourceLabel,
  getPermissionScopeLabel,
} from '@/features/permissions/utils/permissions-display'

type PermissionsTableProps = {
  permissions: Permission[]
  selectedPermissionId?: string
  isLoading: boolean
  isRefreshing: boolean
  canReadRoles: boolean
  roleCountsByPermissionName: Map<string, number>
  onPermissionSelect: (permissionId: string) => void
}

export function PermissionsTable({
  permissions,
  selectedPermissionId,
  isLoading,
  isRefreshing,
  canReadRoles,
  roleCountsByPermissionName,
  onPermissionSelect,
}: PermissionsTableProps) {
  return (
    <Card className="flex min-h-0 flex-col overflow-hidden border border-border/70 bg-card/90">
      <CardHeader className="border-b border-border/60">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-base">Permission catalog</CardTitle>
          {isRefreshing ? (
            <Badge variant="outline" className="gap-1.5">
              <Sparkles className="size-3.5" />
              Refreshing
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 p-0">
        {isLoading ? (
          <div className="flex min-h-[28rem] items-center justify-center text-sm text-muted-foreground">
            Loading permissions…
          </div>
        ) : permissions.length === 0 ? (
          <div className="flex min-h-[28rem] flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="font-medium">No permissions matched these filters.</p>
            <p className="text-sm text-muted-foreground">Adjust or clear the current filters.</p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-auto">
              <Table className="table-fixed">
                <TableHeader className="bg-background">
                  <TableRow className="hover:bg-background">
                    <TableHead className="sticky top-0 z-10 w-[30%] bg-background px-4">
                      Permission
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 w-[24%] bg-background px-4">
                      Capability
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 w-[22%] bg-background px-4">
                      Status
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 w-[24%] bg-background px-4">
                      Tags
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {permissions.map((permission) => {
                    const isSelected = selectedPermissionId === permission.id
                    const linkedRolesCount = roleCountsByPermissionName.get(permission.name) ?? 0
                    const visibleTags = permission.tags.slice(0, 3)

                    return (
                      <TableRow
                        key={permission.id}
                        data-state={isSelected ? 'selected' : undefined}
                        className="cursor-pointer"
                        tabIndex={0}
                        onClick={() => onPermissionSelect(permission.id)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') {
                            return
                          }

                          event.preventDefault()
                          onPermissionSelect(permission.id)
                        }}
                      >
                        <TableCell className="px-4 py-4 align-top whitespace-normal">
                          <div className="space-y-1.5">
                            <div className="font-medium">{permission.display_name}</div>
                            <div className="break-all font-mono text-xs text-muted-foreground">
                              {permission.name}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-4 align-top whitespace-normal">
                          <div className="space-y-1.5">
                            <div className="text-sm font-medium">
                              {getPermissionResourceLabel(permission)}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {getPermissionActionLabel(permission)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {getPermissionScopeLabel(permission)}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-4 align-top whitespace-normal">
                          <div className="space-y-2">
                            <div className="flex flex-wrap gap-2">
                              {permission.is_system ? (
                                <Badge variant="secondary">System</Badge>
                              ) : (
                                <Badge variant="outline">Custom</Badge>
                              )}
                              <Badge variant={permission.is_active ? 'outline' : 'secondary'}>
                                {permission.is_active ? 'Active' : 'Inactive'}
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
                        </TableCell>
                        <TableCell className="px-4 py-4 align-top whitespace-normal">
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
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="border-t px-4 py-4 text-sm text-muted-foreground">
              {permissions.length} visible permission{permissions.length === 1 ? '' : 's'}
              {isRefreshing ? ' | Refreshing…' : ''}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
