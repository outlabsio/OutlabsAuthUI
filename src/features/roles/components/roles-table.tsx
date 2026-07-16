import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'

import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Sparkles } from 'lucide-react'

import { AppEmptyState } from '@/components/app/app-empty-state'
import { AppStatusBadge } from '@/components/app/app-status-badge'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { AppDataTableColumnHeader } from '@/components/app/app-data-table-column-header'
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
  getRoleStatusTone,
  getRoleTypeDescription,
  getRoleTypeLabel,
  groupPermissions,
} from '@/features/roles/utils/role-display'
import { cn } from '@/lib/utils/cn'

type RolesTableProps = {
  roles: Role[]
  selectedRoleId?: string
  isLoading: boolean
  isRefreshing: boolean
  hasNextPage?: boolean
  isFetchingNextPage?: boolean
  sorting?: SortingState
  onSortingChange?: (sorting: SortingState) => void
  onLoadMore?: () => Promise<unknown> | void
  onRoleSelect: (roleId: string) => void
  embedded?: boolean
  plain?: boolean
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
  hasNextPage = false,
  isFetchingNextPage = false,
  sorting,
  onSortingChange,
  onLoadMore,
  onRoleSelect,
  embedded = false,
  plain = false,
  showHeader = true,
  title = 'Role catalog',
  emptyTitle = 'No roles matched these filters.',
  emptyDescription = 'Adjust or clear the current filters.',
}: RolesTableProps) {
  const scrollAreaRef = useRef<HTMLDivElement | null>(null)
  const [internalSorting, setInternalSorting] = useState<SortingState>([
    {
      id: 'role',
      desc: false,
    },
  ])
  const activeSorting = sorting ?? internalSorting
  const setActiveSorting = onSortingChange ?? setInternalSorting
  const columns = useMemo<ColumnDef<Role>[]>(
    () => [
      {
        id: 'role',
        accessorFn: (role) => `${role.display_name} ${role.name}`.toLowerCase(),
        header: ({ column }) => <AppDataTableColumnHeader column={column} title="Role" />,
        cell: ({ row }) => {
          const role = row.original

          return (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-medium">{role.display_name}</div>
                <Badge variant="outline">{getRoleTypeLabel(role)}</Badge>
                {role.is_system_role ? <Badge variant="secondary">System</Badge> : null}
                {role.is_auto_assigned ? <Badge variant="outline">Auto</Badge> : null}
                <AppStatusBadge tone={getRoleStatusTone(role.status)}>
                  {getRoleStatusLabel(role.status)}
                </AppStatusBadge>
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
          )
        },
        enableSorting: true,
      },
      {
        id: 'applicability',
        accessorFn: (role) =>
          `${getRoleTypeLabel(role)} ${getRoleDefinitionLabel(role)} ${getRoleBlastRadiusLabel(role)}`.toLowerCase(),
        header: ({ column }) => (
          <AppDataTableColumnHeader column={column} title="Applicability" />
        ),
        cell: ({ row }) => {
          const role = row.original

          return (
            <div className="space-y-2.5">
              <div className="text-sm font-medium">{getRoleTypeDescription(role)}</div>
              <div className="text-sm text-foreground">{getRoleDefinitionLabel(role)}</div>
              <div className="text-xs text-muted-foreground">
                {getRoleBlastRadiusLabel(role)}
              </div>
            </div>
          )
        },
        enableSorting: true,
      },
      {
        id: 'assignment',
        accessorFn: (role) =>
          `${role.is_auto_assigned ? 'auto' : 'manual'} ${getRoleAssignmentRuleLabel(role)} ${getRoleOperationalSummary(role)}`.toLowerCase(),
        header: ({ column }) => (
          <AppDataTableColumnHeader column={column} title="Assignment" />
        ),
        cell: ({ row }) => {
          const role = row.original

          return (
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
          )
        },
        enableSorting: true,
      },
      {
        id: 'footprint',
        accessorFn: (role) => role.permissions.length,
        header: ({ column }) => (
          <AppDataTableColumnHeader column={column} title="Permission footprint" />
        ),
        cell: ({ row }) => {
          const role = row.original
          const assignableTypes = formatAssignableTypes(role)
          const permissionGroups = groupPermissions(role.permissions)
          const permissionPreview = permissionGroups.slice(0, 3)
          const hiddenPermissionGroupsCount = Math.max(
            permissionGroups.length - permissionPreview.length,
            0
          )

          return (
            <div className="space-y-2.5">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  {role.permissions.length} permission
                  {role.permissions.length === 1 ? '' : 's'}
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
          )
        },
        enableSorting: true,
      },
    ],
    []
  )
  const table = useReactTable({
    data: roles,
    columns,
    state: {
      sorting: activeSorting,
    },
    onSortingChange: (updater) => {
      setActiveSorting(typeof updater === 'function' ? updater(activeSorting) : updater)
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })
  const handleScrollNearBottom = useEffectEvent(() => {
    if (!hasNextPage || isFetchingNextPage || !onLoadMore) {
      return
    }

    const scrollContainer = scrollAreaRef.current?.querySelector<HTMLElement>(
      '[data-slot=table-container]'
    )

    if (!scrollContainer) {
      return
    }

    const remainingDistance =
      scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight

    if (remainingDistance > 240) {
      return
    }

    void onLoadMore()
  })

  useEffect(() => {
    const scrollContainer = scrollAreaRef.current?.querySelector<HTMLElement>(
      '[data-slot=table-container]'
    )

    if (!scrollContainer) {
      return
    }

    const handleScroll = () => {
      handleScrollNearBottom()
    }

    handleScroll()
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll)
    }
  }, [roles.length])

  const content = (
    <>
      {showHeader ? (
        <div className="border-b border-border/60 px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="text-base font-medium">{title}</div>
            {isRefreshing ? (
              <Badge variant="outline" className="gap-1.5">
                <Sparkles className="size-3.5" />
                Refreshing
              </Badge>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col p-0">
        {isLoading ? (
          <div className="flex min-h-[28rem] items-center justify-center text-sm text-muted-foreground">
            Loading roles…
          </div>
        ) : roles.length === 0 ? (
          <AppEmptyState
            title={emptyTitle}
            description={emptyDescription}
            className="min-h-[28rem] border-none"
            compact
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div
              ref={scrollAreaRef}
              className="min-h-0 flex-1 overflow-hidden [&_[data-slot=table-container]]:h-full [&_[data-slot=table-container]]:overflow-y-auto [&_[data-slot=table-container]]:overscroll-contain"
            >
              <Table className="table-fixed">
                <TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_var(--color-border)]">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id} className="hover:bg-transparent">
                      {headerGroup.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          className={cn(
                            'px-4',
                            header.column.id === 'role' ? 'w-[29%]' : null,
                            header.column.id === 'applicability' ? 'w-[25%]' : null,
                            header.column.id === 'assignment' ? 'w-[24%]' : null,
                            header.column.id === 'footprint' ? 'w-[22%]' : null
                          )}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => {
                    const role = row.original
                    const isSelected = selectedRoleId === role.id

                    return (
                      <TableRow
                        key={role.id}
                        data-state={isSelected ? 'selected' : undefined}
                        className="cursor-pointer transition-colors hover:bg-muted/60"
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
                        {row.getVisibleCells().map((cell) => (
                          <TableCell
                            key={cell.id}
                            className="px-4 py-4 align-top whitespace-normal"
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              {isFetchingNextPage ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">
                  Loading more roles…
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </>
  )

  if (plain) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {content}
      </div>
    )
  }

  if (embedded) {
    return (
      <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card/90">
        {content}
      </div>
    )
  }

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border border-border/70 bg-card/90 ring-0">
      {content}
    </Card>
  )
}
