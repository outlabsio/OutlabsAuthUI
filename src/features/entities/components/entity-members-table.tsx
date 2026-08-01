import { useDeferredValue, useMemo, useState } from 'react'

import type { ColumnDef } from '@tanstack/react-table'
import { Search } from 'lucide-react'

import { AppDataTable } from '@/components/app/app-data-table'
import { AppEmptyState } from '@/components/app/app-empty-state'
import { AppErrorState } from '@/components/app/app-error-state'
import { AppStatusBadge } from '@/components/app/app-status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { EntityMember } from '@/features/entities/types/entities.types'
import {
  formatMembershipToken,
  getMembershipStatusTone,
} from '@/features/memberships/utils/membership-display'

type EntityMembersTableProps = {
  members: EntityMember[]
  membersLoading: boolean
  membersErrorMessage?: string | null
  canReadMembers: boolean
  canEditMemberships: boolean
  canLoadMoreMembers: boolean
  onLoadMoreMembers: () => void
  onManageMember: (member: EntityMember) => void
}

type MemberStatusFilter = 'all' | string

function formatDateTime(value?: string | null, fallback = 'Not set') {
  if (!value) {
    return fallback
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function getMemberDisplayName(member: EntityMember) {
  const displayName = [member.user_first_name, member.user_last_name]
    .filter(Boolean)
    .join(' ')
    .trim()

  return displayName || member.user_email
}

function getRoleSummary(member: EntityMember) {
  if (member.roles.length === 0) {
    return null
  }

  const visibleRoleNames = member.roles.slice(0, 2).map((role) => role.display_name)

  if (member.roles.length <= 2) {
    return visibleRoleNames.join(', ')
  }

  return `${visibleRoleNames.join(', ')} +${member.roles.length - 2}`
}

const columnWidths: Record<string, string> = {
  member: '34%',
  access: '30%',
  window: '24%',
  actions: '12%',
}

export function EntityMembersTable({
  members,
  membersLoading,
  membersErrorMessage,
  canReadMembers,
  canEditMemberships,
  canLoadMoreMembers,
  onLoadMoreMembers,
  onManageMember,
}: EntityMembersTableProps) {
  const [searchValue, setSearchValue] = useState('')
  const deferredSearchValue = useDeferredValue(searchValue)
  const [statusFilter, setStatusFilter] = useState<MemberStatusFilter>('all')
  const normalizedSearchValue = deferredSearchValue.trim().toLowerCase()
  const statusOptions = useMemo(() => {
    const statuses = new Set<string>()

    members.forEach((member) => {
      if (member.effective_status) {
        statuses.add(member.effective_status)
      }
    })

    return ['all', ...[...statuses].sort()]
  }, [members])

  const visibleMembers = useMemo(() => {
    return members.filter((member) => {
      if (statusFilter !== 'all' && member.effective_status !== statusFilter) {
        return false
      }

      if (!normalizedSearchValue) {
        return true
      }

      const searchHaystack = [
        getMemberDisplayName(member),
        member.user_email,
        member.user_status,
        member.status,
        member.effective_status,
        ...member.roles.map((role) => role.display_name),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchHaystack.includes(normalizedSearchValue)
    })
  }, [members, normalizedSearchValue, statusFilter])

  const columns = useMemo<ColumnDef<EntityMember>[]>(
    () => [
      {
        id: 'member',
        header: 'Member',
        cell: ({ row }) => {
          const member = row.original

          return (
            <div className="space-y-1">
              <div className="font-medium text-foreground">
                {getMemberDisplayName(member)}
              </div>
              <div className="truncate text-sm text-muted-foreground">
                {member.user_email}
              </div>
              <div className="text-xs text-muted-foreground">
                User {formatMembershipToken(member.user_status)}
              </div>
            </div>
          )
        },
        enableSorting: false,
      },
      {
        id: 'access',
        header: 'Access',
        cell: ({ row }) => {
          const member = row.original
          const roleSummary = getRoleSummary(member)

          return (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <AppStatusBadge tone={getMembershipStatusTone(member.effective_status)}>
                  {formatMembershipToken(member.effective_status)}
                </AppStatusBadge>
                <span className="text-xs text-muted-foreground">
                  Assignment {formatMembershipToken(member.status)}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                {roleSummary ?? 'No local roles'}
              </div>
            </div>
          )
        },
        enableSorting: false,
      },
      {
        id: 'window',
        header: 'Window',
        cell: ({ row }) => {
          const member = row.original

          return (
            <div className="space-y-1 text-sm">
              <div>{formatDateTime(member.joined_at)}</div>
              <div className="text-xs text-muted-foreground">
                From {formatDateTime(member.valid_from, 'Immediate')}
              </div>
              <div className="text-xs text-muted-foreground">
                Until {formatDateTime(member.valid_until, 'Open-ended')}
              </div>
            </div>
          )
        },
        enableSorting: false,
      },
      {
        id: 'actions',
        header: () => <div className="text-right">Actions</div>,
        cell: ({ row }) => {
          const member = row.original

          return (
            <div className="text-right">
              {canEditMemberships ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onManageMember(member)}
                >
                  Open user
                </Button>
              ) : (
                <span className="text-sm text-muted-foreground">Read only</span>
              )}
            </div>
          )
        },
        enableSorting: false,
      },
    ],
    [canEditMemberships, onManageMember]
  )

  if (!canReadMembers) {
    return (
      <AppEmptyState
        title="Members unavailable"
        description="Your account cannot read memberships in this entity."
        compact
      />
    )
  }

  if (membersErrorMessage) {
    return <AppErrorState compact>{membersErrorMessage}</AppErrorState>
  }

  if (membersLoading) {
    return <AppEmptyState title="Loading entity members…" compact />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border bg-background/70 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{visibleMembers.length} visible</Badge>
          <Badge variant="outline">{members.length} loaded</Badge>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="space-y-2">
            <Label htmlFor="entity-members-status-filter" className="sr-only">
              Filter members by status
            </Label>
            <Select
              items={statusOptions.map((value) => ({
                label: value === 'all' ? 'All statuses' : formatMembershipToken(value),
                value,
              }))}
              value={statusFilter}
              onValueChange={(value) => {
                if (!value) {
                  return
                }

                setStatusFilter(value)
              }}
            >
              <SelectTrigger
                id="entity-members-status-filter"
                aria-label="Filter members by status"
                size="sm"
                className="w-full lg:w-40"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value === 'all' ? 'All statuses' : formatMembershipToken(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="relative lg:w-72">
            <Label htmlFor="entity-members-search" className="sr-only">
              Search loaded members
            </Label>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="entity-members-search"
              aria-label="Search loaded members"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search members, email, or roles"
              className="h-8 pl-9"
            />
          </div>
        </div>
      </div>

      <AppDataTable
        className="overflow-hidden rounded-2xl border"
        data={visibleMembers}
        columns={columns}
        getRowId={(member) => member.id}
        isLoading={false}
        emptyState={{
          title: members.length === 0 ? 'No members' : 'No matching members',
          description:
            members.length === 0
              ? 'No memberships have been attached to this entity yet.'
              : 'No loaded members matched the current search or status filter.',
        }}
        columnWidths={columnWidths}
      />

      {canLoadMoreMembers ? (
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onLoadMoreMembers}>
            Load more members
          </Button>
        </div>
      ) : null}
    </div>
  )
}
