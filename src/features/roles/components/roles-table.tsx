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
import type { Role } from '@/features/roles/types/roles.types'
import {
  formatAssignableTypes,
  getRoleAssignmentRuleLabel,
  getRoleBlastRadiusLabel,
  getRoleDefinitionLabel,
  getRoleOperationalSummary,
  getRoleScopeSummary,
  getRoleStatusLabel,
  getRoleStatusVariant,
  getRoleTypeDescription,
  getRoleTypeLabel,
  groupPermissions,
} from '@/features/roles/utils/role-display'

type RolesTableProps = {
  roles: Role[]
  selectedRoleId?: string
  isLoading: boolean
  isRefreshing: boolean
  onRoleSelect: (roleId: string) => void
  embedded?: boolean
  showHeader?: boolean
  title?: string
  emptyTitle?: string
  emptyDescription?: string
}

export function RolesTable({
  roles,
  selectedRoleId,
  isLoading,
  isRefreshing,
  onRoleSelect,
  embedded = false,
  showHeader = true,
  title = 'Role catalog',
  emptyTitle = 'No roles matched these filters.',
  emptyDescription = 'Adjust or clear the current filters.',
}: RolesTableProps) {
  const content = (
    <>
      {showHeader ? (
        <CardHeader className="border-b border-border/60">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-base">{title}</CardTitle>
            {isRefreshing ? (
              <Badge variant="outline" className="gap-1.5">
                <Sparkles className="size-3.5" />
                Refreshing
              </Badge>
            ) : null}
          </div>
        </CardHeader>
      ) : null}

      <CardContent className="min-h-0 flex-1 p-0">
        {isLoading ? (
          <div className="flex min-h-[28rem] items-center justify-center text-sm text-muted-foreground">
            Loading roles…
          </div>
        ) : roles.length === 0 ? (
          <div className="flex min-h-[28rem] flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="font-medium">{emptyTitle}</p>
            <p className="text-sm text-muted-foreground">{emptyDescription}</p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-auto">
              <Table className="table-fixed">
                <TableHeader className="bg-background">
                  <TableRow className="hover:bg-background">
                    <TableHead className="sticky top-0 z-10 w-[29%] bg-background px-4">
                      Role
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 w-[25%] bg-background px-4">
                      Applicability
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 w-[24%] bg-background px-4">
                      Assignment
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 w-[22%] bg-background px-4">
                      Permission footprint
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.map((role) => {
                    const isSelected = selectedRoleId === role.id
                    const assignableTypes = formatAssignableTypes(role)
                    const permissionGroups = groupPermissions(role.permissions)
                    const permissionPreview = permissionGroups.slice(0, 3)
                    const hiddenPermissionGroupsCount = Math.max(
                      permissionGroups.length - permissionPreview.length,
                      0
                    )

                    return (
                      <TableRow
                        key={role.id}
                        data-state={isSelected ? 'selected' : undefined}
                        className="cursor-pointer"
                        tabIndex={0}
                        onClick={() => onRoleSelect(role.id)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') {
                            return
                          }

                          event.preventDefault()
                          onRoleSelect(role.id)
                        }}
                      >
                        <TableCell className="px-4 py-4 align-top whitespace-normal">
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-medium">{role.display_name}</div>
                              <Badge variant="outline">{getRoleTypeLabel(role)}</Badge>
                              {role.is_system_role ? <Badge variant="secondary">System</Badge> : null}
                              {role.is_auto_assigned ? (
                                <Badge variant="outline">Auto</Badge>
                              ) : null}
                              <Badge variant={getRoleStatusVariant(role.status)}>
                                {getRoleStatusLabel(role.status)}
                              </Badge>
                            </div>
                            <div className="break-all font-mono text-xs text-muted-foreground">
                              {role.name}
                            </div>
                            {role.description ? (
                              <div className="line-clamp-2 text-sm text-muted-foreground">
                                {role.description}
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-4 align-top whitespace-normal">
                          <div className="space-y-2.5">
                            <div className="text-sm font-medium">{getRoleTypeDescription(role)}</div>
                            <div className="text-sm text-foreground">{getRoleDefinitionLabel(role)}</div>
                            <div className="text-xs text-muted-foreground">
                              {getRoleBlastRadiusLabel(role)}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-4 align-top whitespace-normal">
                          <div className="space-y-2.5">
                            <div className="text-sm font-medium">
                              {role.is_auto_assigned ? 'Auto-assigned access' : 'Intentional admin grant'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {getRoleAssignmentRuleLabel(role)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {getRoleOperationalSummary(role)}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-4 align-top whitespace-normal">
                          <div className="space-y-2.5">
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline">
                                {role.permissions.length} permission{role.permissions.length === 1 ? '' : 's'}
                              </Badge>
                              {assignableTypes ? (
                                <Badge variant="outline">{assignableTypes}</Badge>
                              ) : (
                                <Badge variant="outline">Any entity type</Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {permissionPreview.map((permissionGroup) => (
                                <Badge key={permissionGroup.resource} variant="secondary">
                                  {permissionGroup.label}
                                </Badge>
                              ))}
                              {hiddenPermissionGroupsCount > 0 ? (
                                <Badge variant="secondary">+{hiddenPermissionGroupsCount} more</Badge>
                              ) : null}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {getRoleScopeSummary(role)}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="border-t px-4 py-4 text-sm text-muted-foreground">
              {roles.length} visible role{roles.length === 1 ? '' : 's'}
              {isRefreshing ? ' | Refreshing…' : ''}
            </div>
          </div>
        )}
      </CardContent>
    </>
  )

  if (embedded) {
    return (
      <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card/90">
        {content}
      </div>
    )
  }

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden border border-border/70 bg-card/90">
      {content}
    </Card>
  )
}
