import { useMemo } from 'react'

import type { ColumnDef, SortingState } from '@tanstack/react-table'

import { AppDataTable } from '@/components/app/app-data-table'
import { AppDataTableColumnHeader } from '@/components/app/app-data-table-column-header'
import { AppStatusBadge } from '@/components/app/app-status-badge'
import type { AppStatusTone } from '@/components/app/app-status'
import { Badge } from '@/components/ui/badge'
import { formatMembershipToken } from '@/features/memberships/utils/membership-display'
import type { OrphanedUser } from '@/features/users/types/users.types'

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

const columnWidths: Record<string, string> = {
  user: '32%',
  access: '26%',
  lastMembership: '28%',
  actions: '10rem',
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
          <AppDataTableColumnHeader column={column} title="User" />
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
          <AppDataTableColumnHeader column={column} title="Access" />
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
          <AppDataTableColumnHeader column={column} title="Last membership" />
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

  return (
    <AppDataTable
      data={items}
      columns={columns}
      getRowId={(item) => item.user.id}
      sorting={sorting}
      onSortingChange={onSortingChange}
      sortingMode="client"
      pagination={{
        page,
        pages,
        total,
        totalLabel: 'orphaned users',
        onPageChange,
      }}
      isLoading={isLoading}
      isRefreshing={isRefreshing}
      loadingTitle="Loading orphaned users..."
      emptyState={{
        title: 'No orphaned users found.',
        description:
          'Users appear here when they have membership history but no active entity memberships.',
      }}
      onRowClick={(item) => onSelectUser(item.user.id)}
      columnWidths={columnWidths}
    />
  )
}
