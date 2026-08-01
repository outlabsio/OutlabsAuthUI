import { useMemo } from 'react'

import type { ColumnDef, SortingState } from '@tanstack/react-table'

import { AppDataTable } from '@/components/app/app-data-table'
import { AppDataTableColumnHeader } from '@/components/app/app-data-table-column-header'
import { AppStatusBadge } from '@/components/app/app-status-badge'
import type { AppStatusTone } from '@/components/app/app-status'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { User } from '@/features/users/types/users.types'

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

const columnWidths: Record<string, string> = {
  user: '34%',
  access: '29%',
  activity: '25%',
  actions: '10rem',
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
          <AppDataTableColumnHeader column={column} title="User" />
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
          <AppDataTableColumnHeader column={column} title="Access" />
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
          <AppDataTableColumnHeader column={column} title="Activity" />
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

  return (
    <AppDataTable
      data={users}
      columns={columns}
      getRowId={(user) => user.id}
      sorting={sorting}
      onSortingChange={onSortingChange}
      sortingMode="client"
      pagination={{
        page,
        pages,
        total,
        totalLabel: 'total users',
        onPageChange,
      }}
      isLoading={isLoading}
      isRefreshing={isRefreshing}
      loadingTitle="Loading users..."
      emptyState={{
        title: 'No users matched these filters.',
        description: 'Try clearing the current search or filter values.',
      }}
      onRowClick={(user) => onSelectUser(user.id)}
      columnWidths={columnWidths}
    />
  )
}
