import { useMemo } from 'react'

import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'

import { AppEmptyState } from '@/components/app/app-empty-state'
import { AppStatusBadge } from '@/components/app/app-status-badge'
import type { AppStatusTone } from '@/components/app/app-status'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatMembershipToken } from '@/features/memberships/utils/membership-display'
import type { OrphanedUser } from '@/features/users/types/users.types'
import { cn } from '@/lib/utils/cn'

type OrphanedUsersTableProps = {
  items: OrphanedUser[]
  page: number
  pages: number
  total: number
  isLoading: boolean
  isRefreshing: boolean
  sorting: SortingState
  onSortingChange: (sorting: SortingState) => void
  onPageChange: (page: number) => void
  onSelectUser: (userId: string) => void
}

function getUserDisplayName(user: OrphanedUser['user']) {
  const displayName = [user.first_name, user.last_name]
    .filter(Boolean)
    .join(' ')
    .trim()

  if (displayName) {
    return displayName
  }

  return user.email.split('@')[0] || 'Unknown user'
}

function getStatusTone(status: string): AppStatusTone {
  switch (status) {
    case 'active':
      return 'success'
    case 'invited':
      return 'info'
    case 'suspended':
      return 'warning'
    case 'banned':
    case 'deleted':
      return 'error'
    default:
      return 'neutral'
  }
}

function formatDateTime(value?: string | null, fallback = 'Unknown') {
  if (!value) {
    return fallback
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function OrphanedUsersTable({
  items,
  page,
  pages,
  total,
  isLoading,
  isRefreshing,
  sorting,
  onSortingChange,
  onPageChange,
  onSelectUser,
}: OrphanedUsersTableProps) {
  const columns = useMemo<ColumnDef<OrphanedUser>[]>(
    () => [
      {
        id: 'user',
        accessorFn: (item) => getUserDisplayName(item.user).toLowerCase(),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="User" />
        ),
        cell: ({ row }) => {
          const user = row.original.user

          return (
            <div className="space-y-1.5">
              <span className="font-medium">{getUserDisplayName(user)}</span>
              <div className="break-all text-sm text-muted-foreground">
                {user.email}
              </div>
              <div className="text-xs text-muted-foreground">
                Created {formatDateTime(user.created_at)}
              </div>
            </div>
          )
        },
        enableSorting: true,
      },
      {
        id: 'access',
        accessorFn: (item) => item.user.status,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Access" />
        ),
        cell: ({ row }) => {
          const user = row.original.user

          return (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <AppStatusBadge tone={getStatusTone(user.status)}>
                  {user.status}
                </AppStatusBadge>
                {user.is_superuser ? (
                  <Badge variant="outline">Superuser</Badge>
                ) : null}
                <Badge variant="outline">No active membership</Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {row.original.total_membership_count} historical membership
                {row.original.total_membership_count === 1 ? '' : 's'}
              </div>
            </div>
          )
        },
        enableSorting: true,
      },
      {
        id: 'lastMembership',
        accessorFn: (item) =>
          `${item.last_entity_name ?? ''}:${item.last_membership_event_type ?? ''}`.toLowerCase(),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Last membership" />
        ),
        cell: ({ row }) => {
          const item = row.original
          const eventLabel = item.last_membership_event_type
            ? formatMembershipToken(item.last_membership_event_type)
            : 'Unknown event'

          return (
            <div className="space-y-1.5">
              <div className="text-sm font-medium">
                {item.last_entity_name ?? 'Unknown entity'}
              </div>
              <div className="text-xs text-muted-foreground">
                {eventLabel}
                {item.last_membership_event_at
                  ? ` · ${formatDateTime(item.last_membership_event_at)}`
                  : ''}
              </div>
            </div>
          )
        },
        enableSorting: true,
      },
      {
        id: 'actions',
        header: () => <div className="text-right">Actions</div>,
        cell: () => (
          <div className="flex justify-end">
            <span className="text-sm text-muted-foreground">Open to reassign</span>
          </div>
        ),
        enableSorting: false,
      },
    ],
    []
  )

  const table = useReactTable({
    data: items,
    columns,
    state: {
      sorting,
    },
    onSortingChange: (updater) => {
      onSortingChange(typeof updater === 'function' ? updater(sorting) : updater)
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (isLoading) {
    return (
      <div className="flex min-h-52 items-center justify-center text-sm text-muted-foreground">
        Loading orphaned users...
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <AppEmptyState
        title="No orphaned users found."
        description="Users appear here when they have membership history but no active entity memberships."
        className="min-h-0 flex-1 border-none"
        compact
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto [&>[data-slot=table-container]]:overflow-visible">
        <Table className="table-fixed">
          <TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_var(--color-border)]">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      'px-4',
                      header.column.id === 'user' ? 'w-[32%]' : null,
                      header.column.id === 'access' ? 'w-[26%]' : null,
                      header.column.id === 'lastMembership' ? 'w-[28%]' : null,
                      header.column.id === 'actions' ? 'w-40 text-right' : null
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
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer transition-colors hover:bg-muted/60"
                tabIndex={0}
                onClick={() => {
                  onSelectUser(row.original.user.id)
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') {
                    return
                  }

                  event.preventDefault()
                  onSelectUser(row.original.user.id)
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      'px-4 py-4 align-top whitespace-normal',
                      cell.column.id === 'actions' ? 'w-40 text-right' : null
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-3 border-t px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="text-sm text-muted-foreground">
          Page {page} of {pages} with {total} orphaned users
          {isRefreshing ? ' | Refreshing...' : ''}
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              onPageChange(page - 1)
            }}
            disabled={page <= 1}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              onPageChange(page + 1)
            }}
            disabled={page >= pages}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
