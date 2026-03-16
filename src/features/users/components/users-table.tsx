import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

function getStatusVariant(status: string) {
  switch (status) {
    case 'active':
      return 'secondary'
    case 'invited':
      return 'outline'
    case 'suspended':
    case 'banned':
      return 'destructive'
    default:
      return 'outline'
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

  if (user.status === 'invited') {
    return 'Awaiting first sign-in'
  }

  return 'No recent restrictions'
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
  onPageChange,
  onResendInvite,
  onSelectUser,
}: UsersTableProps) {
  if (isLoading) {
    return (
      <div className="flex min-h-52 items-center justify-center text-sm text-muted-foreground">
        Loading users…
      </div>
    )
  }

  if (users.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="font-medium">No users matched these filters.</p>
        <p className="text-sm text-muted-foreground">
          Try clearing the current search or filter values.
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <Table className="table-fixed">
          <TableHeader className="bg-background">
            <TableRow className="hover:bg-background">
              <TableHead className="sticky top-0 z-10 w-1/3 bg-background px-4">
                User
              </TableHead>
              <TableHead className="sticky top-0 z-10 w-1/4 bg-background px-4">
                Access
              </TableHead>
              <TableHead className="sticky top-0 z-10 w-1/4 bg-background px-4">
                Activity
              </TableHead>
              <TableHead className="sticky top-0 z-10 w-40 bg-background px-4 text-right">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const canResendInvite = canResendInvites && user.status === 'invited'
              const isResending = resendInvitePendingUserId === user.id

              return (
                <TableRow
                  key={user.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  onClick={() => {
                    onSelectUser(user.id)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') {
                      return
                    }

                    event.preventDefault()
                    onSelectUser(user.id)
                  }}
                >
                  <TableCell className="px-4 py-4 align-top whitespace-normal">
                    <div className="space-y-1.5">
                      <span className="font-medium">{getUserDisplayName(user)}</span>
                      <div className="break-all text-sm text-muted-foreground">{user.email}</div>
                      <div className="text-xs text-muted-foreground">
                        Created {formatDateTime(user.created_at, 'Unknown')}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-4 align-top whitespace-normal">
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={getStatusVariant(user.status)}>{user.status}</Badge>
                        {user.is_superuser ? <Badge variant="outline">Superuser</Badge> : null}
                        {user.email_verified ? <Badge variant="outline">Verified</Badge> : null}
                        {user.locked_until ? <Badge variant="destructive">Locked</Badge> : null}
                      </div>
                      <div className="text-sm text-muted-foreground">{getScopeLabel(user)}</div>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-4 align-top whitespace-normal">
                    <div className="space-y-1.5">
                      <div className="text-sm font-medium">
                        {user.last_login
                          ? formatDateTime(user.last_login, 'No sign-in yet')
                          : 'No sign-in yet'}
                      </div>
                      <div className="text-xs text-muted-foreground">{getActivityNote(user)}</div>
                    </div>
                  </TableCell>
                  <TableCell className="w-40 px-4 py-4 text-right align-top whitespace-normal">
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
                          {isResending ? 'Resending…' : 'Resend invite'}
                        </Button>
                      ) : (
                        <span className="text-sm text-muted-foreground">No row actions</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-3 border-t px-4 py-4 md:flex-row md:items-center md:justify-between">
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
