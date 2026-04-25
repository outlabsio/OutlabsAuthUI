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
import type { User } from '@/features/users/types/users.types'
import { cn } from '@/lib/utils/cn'

type UsersTableProps = {
  users: User[]
  page: number
  pages: number
  total: number
  isLoading: boolean
  isRefreshing: boolean
  canResendInvites: boolean
  resendInvitePendingUserId?: string
  sorting: SortingState
  onSortingChange: (sorting: SortingState) => void
  onPageChange: (page: number) => void
  onResendInvite: (userId: string) => void
  onSelectUser: (userId: string) => void
}

function getUserDisplayName(user: User) {
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

function formatDateTime(value?: string | null, fallback = 'Never') {
  if (!value) {
    return fallback
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function getScopeLabel(user: User) {
  if (user.is_superuser) {
    return 'Global'
  }

  if (user.root_entity_name) {
    return user.root_entity_name
  }

  return 'Membership-based'
}

function getActivityNote(user: User) {
  if (user.locked_until) {
    return `Locked until ${formatDateTime(user.locked_until, 'Unknown')}`
  }

  if (user.suspended_until) {
    return `Suspended until ${formatDateTime(user.suspended_until, 'Unknown')}`
  }

  if (user.status === 'banned') {
    return 'Access is blocked'
  }

  if (user.status === 'deleted') {
    return `Deleted on ${formatDateTime(user.deleted_at, 'Unknown')}`
  }

  if (user.status === 'invited') {
    return 'Awaiting first sign-in'
  }

  return 'No recent restrictions'
}

function getLastLoginSortValue(user: User) {
  if (!user.last_login) {
    return 0
  }

  return new Date(user.last_login).getTime()
}

export function UsersTable({
  users,
  page,
  pages,
  total,
  isLoading,
  isRefreshing,
  canResendInvites,
  resendInvitePendingUserId,
  sorting,
  onSortingChange,
  onPageChange,
  onResendInvite,
  onSelectUser,
}: UsersTableProps) {
  const columns = useMemo<ColumnDef<User>[]>(
    () => [
      {
        id: 'user',
        accessorFn: (user) => getUserDisplayName(user).toLowerCase(),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="User" />
        ),
        cell: ({ row }) => {
          const user = row.original

          return (
            <div className="space-y-1.5">
              <span className="font-medium">{getUserDisplayName(user)}</span>
              <div className="break-all text-sm text-muted-foreground">
                {user.email}
              </div>
              <div className="text-xs text-muted-foreground">
                Created {formatDateTime(user.created_at, 'Unknown')}
              </div>
            </div>
          )
        },
        enableSorting: true,
      },
      {
        id: 'access',
        accessorFn: (user) => `${user.status}:${getScopeLabel(user)}`.toLowerCase(),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Access" />
        ),
        cell: ({ row }) => {
          const user = row.original

          return (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <AppStatusBadge tone={getStatusTone(user.status)}>
                  {user.status}
                </AppStatusBadge>
                {user.is_superuser ? (
                  <Badge variant="outline">Superuser</Badge>
                ) : null}
                {user.email_verified ? <Badge variant="outline">Verified</Badge> : null}
                {user.locked_until ? (
                  <AppStatusBadge tone="warning">Locked</AppStatusBadge>
                ) : null}
                {user.deleted_at ? <Badge variant="outline">Retained</Badge> : null}
              </div>
              <div className="text-sm text-muted-foreground">{getScopeLabel(user)}</div>
            </div>
          )
        },
        enableSorting: true,
      },
      {
        id: 'activity',
        accessorFn: getLastLoginSortValue,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Activity" />
        ),
        cell: ({ row }) => {
          const user = row.original

          return (
            <div className="space-y-1.5">
              <div className="text-sm font-medium">
                {user.last_login
                  ? formatDateTime(user.last_login, 'No sign-in yet')
                  : 'No sign-in yet'}
              </div>
              <div className="text-xs text-muted-foreground">{getActivityNote(user)}</div>
            </div>
          )
        },
        enableSorting: true,
      },
      {
        id: 'actions',
        header: () => <div className="text-right">Actions</div>,
        cell: ({ row }) => {
          const user = row.original
          const canResendInvite = canResendInvites && user.status === 'invited'
          const isResending = resendInvitePendingUserId === user.id

          return (
            <div className="flex flex-wrap justify-end gap-2">
              {canResendInvite ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation()
                    onResendInvite(user.id)
                  }}
                  disabled={isResending}
                >
                  {isResending ? 'Resending...' : 'Resend invite'}
                </Button>
              ) : (
                <span className="text-sm text-muted-foreground">No row actions</span>
              )}
            </div>
          )
        },
        enableSorting: false,
      },
    ],
    [canResendInvites, onResendInvite, resendInvitePendingUserId]
  )

  const table = useReactTable({
    data: users,
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
        Loading users...
      </div>
    )
  }

  if (users.length === 0) {
    return (
      <AppEmptyState
        title="No users matched these filters."
        description="Try clearing the current search or filter values."
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
                      header.column.id === 'user' ? 'w-[34%]' : null,
                      header.column.id === 'access' ? 'w-[29%]' : null,
                      header.column.id === 'activity' ? 'w-[25%]' : null,
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
                  onSelectUser(row.original.id)
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') {
                    return
                  }

                  event.preventDefault()
                  onSelectUser(row.original.id)
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
          Page {page} of {pages} with {total} total users
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
