import { type ReactNode, type WheelEvent, useDeferredValue, useMemo, useState } from 'react'

import { Search } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
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

function getRoleSearchHaystack(role: Role) {
  return [
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
}

export function filterAssignableRoles({
  roles,
  searchValue,
  selectedRoleIdSet,
  showSelectedOnly,
}: {
  roles: Role[]
  searchValue: string
  selectedRoleIdSet: Set<string>
  showSelectedOnly: boolean
}) {
  const normalizedSearchValue = searchValue.trim().toLowerCase()

  return roles.filter((role) => {
    if (showSelectedOnly && !selectedRoleIdSet.has(role.id)) {
      return false
    }

    if (!normalizedSearchValue) {
      return true
    }

    return getRoleSearchHaystack(role).includes(normalizedSearchValue)
  })
}

type AssignableRolesTableProps = {
  roles: Role[]
  emptyMessage: string
  searchPlaceholder?: string
  selectedRoleIds?: string[]
  searchValue?: string
  onSearchValueChange?: (value: string) => void
  showSelectedOnly?: boolean
  onShowSelectedOnlyChange?: (checked: boolean) => void
  showToolbar?: boolean
  lockedRoleIds?: string[]
  lockedRoleLabel?: string
  onRoleToggle?: (roleId: string, checked: boolean) => void
  disabled?: boolean
  toolbarActions?: ReactNode
}

export function AssignableRolesTable({
  roles,
  emptyMessage,
  searchPlaceholder = 'Search roles by name, scope, or description',
  selectedRoleIds,
  searchValue,
  onSearchValueChange,
  showSelectedOnly,
  onShowSelectedOnlyChange,
  showToolbar = true,
  lockedRoleIds,
  lockedRoleLabel = 'Assigned',
  onRoleToggle,
  disabled = false,
  toolbarActions,
}: AssignableRolesTableProps) {
  const [internalSearchValue, setInternalSearchValue] = useState('')
  const deferredSearchValue = useDeferredValue(searchValue ?? internalSearchValue)
  const [internalShowSelectedOnly, setInternalShowSelectedOnly] = useState(false)
  const canSelectRoles = typeof onRoleToggle === 'function'
  const selectedOnlyEnabled = showSelectedOnly ?? internalShowSelectedOnly
  const selectedRoleIdSet = useMemo(
    () => new Set(selectedRoleIds ?? []),
    [selectedRoleIds]
  )
  const lockedRoleIdSet = useMemo(
    () => new Set(lockedRoleIds ?? []),
    [lockedRoleIds]
  )
  const selectedRoleCount = selectedRoleIds?.length ?? 0

  const visibleRoles = useMemo(() => {
    return filterAssignableRoles({
      roles,
      searchValue: deferredSearchValue,
      selectedRoleIdSet,
      showSelectedOnly: selectedOnlyEnabled,
    })
  }, [deferredSearchValue, roles, selectedOnlyEnabled, selectedRoleIdSet])

  function getEmptyStateMessage() {
    if (roles.length === 0) {
      return emptyMessage
    }

    if (selectedOnlyEnabled && selectedRoleCount === 0) {
      return 'Select roles to review them here.'
    }

    if (deferredSearchValue.trim()) {
      return 'No roles matched this search.'
    }

    return 'No roles matched the current view.'
  }

  function handleScrollRegionWheel(event: WheelEvent<HTMLDivElement>) {
    const scrollRegion = event.currentTarget

    if (scrollRegion.scrollHeight <= scrollRegion.clientHeight) {
      return
    }

    const maxScrollTop = scrollRegion.scrollHeight - scrollRegion.clientHeight
    const nextScrollTop = Math.min(
      maxScrollTop,
      Math.max(0, scrollRegion.scrollTop + event.deltaY)
    )

    if (nextScrollTop === scrollRegion.scrollTop) {
      return
    }

    scrollRegion.scrollTop = nextScrollTop
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background">
      {showToolbar ? (
        <div className="flex flex-col gap-3 border-b px-4 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search roles"
                value={searchValue ?? internalSearchValue}
                onChange={(event) => {
                  onSearchValueChange?.(event.target.value)
                  if (onSearchValueChange === undefined) {
                    setInternalSearchValue(event.target.value)
                  }
                }}
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
                  <label className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm font-medium">
                    <span
                      className={cn(
                        selectedOnlyEnabled ? 'text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      Selected only
                    </span>
                    <Switch
                      checked={selectedOnlyEnabled}
                      disabled={selectedRoleCount === 0}
                      aria-label="Show selected roles only"
                      onCheckedChange={(checked) => {
                        onShowSelectedOnlyChange?.(Boolean(checked))
                        if (onShowSelectedOnlyChange === undefined) {
                          setInternalShowSelectedOnly(Boolean(checked))
                        }
                      }}
                    />
                  </label>
                </>
              ) : null}
              {toolbarActions}
            </div>
          </div>
        </div>
      ) : null}

      {visibleRoles.length > 0 ? (
        <Table
          containerProps={{
            'data-slot': 'assignable-roles-scroll-region',
            'aria-label': 'Assignable roles',
            className:
              'min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-contain [scrollbar-gutter:stable]',
            onWheelCapture: handleScrollRegionWheel,
            tabIndex: 0,
          }}
          className="min-w-[760px] table-fixed"
        >
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
                const isLocked = lockedRoleIdSet.has(role.id)
                const isInteractive = canSelectRoles && !disabled && !isLocked

                return (
                  <TableRow
                    key={role.id}
                    data-state={isSelected ? 'selected' : undefined}
                    className={cn(
                      isInteractive ? 'cursor-pointer' : undefined,
                      isLocked ? 'opacity-70' : undefined
                    )}
                    tabIndex={isInteractive ? 0 : undefined}
                    onClick={() => {
                      if (!isInteractive) {
                        return
                      }

                      onRoleToggle?.(role.id, !isSelected)
                    }}
                    onKeyDown={(event) => {
                      if (!isInteractive) {
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
                            disabled={disabled || isLocked}
                            onCheckedChange={(checked) => {
                              onRoleToggle?.(role.id, Boolean(checked))
                            }}
                          />
                        </div>
                      </TableCell>
                    ) : null}
                    <TableCell className="px-4 py-4 align-top whitespace-normal">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium text-foreground">{role.display_name}</div>
                          {isLocked ? (
                            <Badge variant="secondary">{lockedRoleLabel}</Badge>
                          ) : null}
                        </div>
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
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10 text-sm text-muted-foreground">
          {getEmptyStateMessage()}
        </div>
      )}
    </div>
  )
}
