import { type ReactNode, useDeferredValue, useMemo, useState } from 'react'

import { Search } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
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
  getRoleAssignmentRuleLabel,
  getRoleDefinitionLabel,
  getRoleScopeModeLabel,
  getRoleScopeSummary,
  getRoleTypeLabel,
} from '@/features/roles/utils/role-display'
import { cn } from '@/lib/utils/cn'

type EntityAssignableRolesTableProps = {
  roles: Role[]
  emptyMessage: string
  searchPlaceholder?: string
  selectedRoleIds?: string[]
  onRoleToggle?: (roleId: string, checked: boolean) => void
  disabled?: boolean
  toolbarActions?: ReactNode
}

export function EntityAssignableRolesTable({
  roles,
  emptyMessage,
  searchPlaceholder = 'Search roles by name, scope, or description',
  selectedRoleIds,
  onRoleToggle,
  disabled = false,
  toolbarActions,
}: EntityAssignableRolesTableProps) {
  const [searchValue, setSearchValue] = useState('')
  const deferredSearchValue = useDeferredValue(searchValue)
  const [showSelectedOnly, setShowSelectedOnly] = useState(false)
  const canSelectRoles = typeof onRoleToggle === 'function'
  const normalizedSearchValue = deferredSearchValue.trim().toLowerCase()
  const selectedRoleIdSet = useMemo(
    () => new Set(selectedRoleIds ?? []),
    [selectedRoleIds]
  )
  const selectedRoleCount = selectedRoleIds?.length ?? 0

  const visibleRoles = useMemo(() => {
    return roles.filter((role) => {
      if (showSelectedOnly && !selectedRoleIdSet.has(role.id)) {
        return false
      }

      if (!normalizedSearchValue) {
        return true
      }

      const searchHaystack = [
        role.name,
        role.display_name,
        role.description,
        getRoleTypeLabel(role),
        getRoleDefinitionLabel(role),
        getRoleScopeSummary(role),
        getRoleAssignmentRuleLabel(role),
        ...role.permissions,
        ...role.assignable_at_types,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchHaystack.includes(normalizedSearchValue)
    })
  }, [normalizedSearchValue, roles, selectedRoleIdSet, showSelectedOnly])

  function getEmptyStateMessage() {
    if (roles.length === 0) {
      return emptyMessage
    }

    if (showSelectedOnly && selectedRoleCount === 0) {
      return 'Select roles to review them here.'
    }

    if (normalizedSearchValue) {
      return 'No roles matched this search.'
    }

    return 'No roles matched the current view.'
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background">
      <div className="flex flex-col gap-3 border-b px-4 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search roles"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              className="pl-9"
              placeholder={searchPlaceholder}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {visibleRoles.length} visible role{visibleRoles.length === 1 ? '' : 's'}
            </Badge>
            {canSelectRoles ? (
              <>
                <Badge variant="outline">{selectedRoleCount} selected</Badge>
                <Button
                  type="button"
                  size="sm"
                  variant={showSelectedOnly ? 'secondary' : 'outline'}
                  disabled={selectedRoleCount === 0}
                  onClick={() => setShowSelectedOnly((currentValue) => !currentValue)}
                >
                  Selected only
                </Button>
              </>
            ) : null}
            {toolbarActions}
          </div>
        </div>
      </div>

      {visibleRoles.length > 0 ? (
        <>
          <div className="min-h-0 flex-1 overflow-auto">
            <Table className="table-fixed">
              <TableHeader className="bg-background">
                <TableRow className="hover:bg-background">
                  {canSelectRoles ? (
                    <TableHead className="sticky top-0 z-10 w-12 bg-background px-4" />
                  ) : null}
                  <TableHead className="sticky top-0 z-10 bg-background px-4 lg:w-[34%]">
                    Role
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-background px-4 lg:w-[34%]">
                    Applicability
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-background px-4 lg:w-[32%]">
                    Assignment
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRoles.map((role) => {
                  const isSelected = selectedRoleIdSet.has(role.id)

                  return (
                    <TableRow
                      key={role.id}
                      data-state={isSelected ? 'selected' : undefined}
                      className={cn(canSelectRoles ? 'cursor-pointer' : undefined)}
                      tabIndex={canSelectRoles ? 0 : undefined}
                      onClick={() => {
                        if (!canSelectRoles || disabled) {
                          return
                        }

                        onRoleToggle?.(role.id, !isSelected)
                      }}
                      onKeyDown={(event) => {
                        if (!canSelectRoles || disabled) {
                          return
                        }

                        if (event.key !== 'Enter' && event.key !== ' ') {
                          return
                        }

                        event.preventDefault()
                        onRoleToggle?.(role.id, !isSelected)
                      }}
                    >
                      {canSelectRoles ? (
                        <TableCell className="px-4 py-4 align-top">
                          <div
                            className="flex items-start justify-center pt-0.5"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Checkbox
                              aria-label={role.display_name}
                              checked={isSelected}
                              disabled={disabled}
                              onCheckedChange={(checked) => {
                                onRoleToggle?.(role.id, Boolean(checked))
                              }}
                            />
                          </div>
                        </TableCell>
                      ) : null}
                      <TableCell className="px-4 py-4 align-top whitespace-normal">
                        <div className="space-y-1.5">
                          <div className="font-medium text-foreground">{role.display_name}</div>
                          <div className="break-all font-mono text-xs text-muted-foreground">
                            {role.name}
                          </div>
                          {role.description ? (
                            <div className="text-sm text-muted-foreground">{role.description}</div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-4 align-top whitespace-normal">
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">{getRoleTypeLabel(role)}</Badge>
                            {role.is_system_role ? (
                              <Badge variant="secondary">System</Badge>
                            ) : null}
                            {role.scope_entity_id ? (
                              <Badge variant="outline">
                                {getRoleScopeModeLabel(role.scope)}
                              </Badge>
                            ) : null}
                          </div>
                          <div className="text-sm font-medium">
                            {getRoleDefinitionLabel(role)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {getRoleScopeSummary(role)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-4 align-top whitespace-normal">
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">
                              {role.permissions.length} permission
                              {role.permissions.length === 1 ? '' : 's'}
                            </Badge>
                            {role.is_auto_assigned ? (
                              <Badge variant="outline">Auto-assigned</Badge>
                            ) : (
                              <Badge variant="outline">Manual</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {getRoleAssignmentRuleLabel(role)}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <div className="border-t px-4 py-3 text-sm text-muted-foreground">
            {visibleRoles.length} visible role{visibleRoles.length === 1 ? '' : 's'}
          </div>
        </>
      ) : (
        <div className="flex min-h-[16rem] items-center justify-center px-6 py-8 text-center text-sm text-muted-foreground">
          {getEmptyStateMessage()}
        </div>
      )}
    </div>
  )
}
