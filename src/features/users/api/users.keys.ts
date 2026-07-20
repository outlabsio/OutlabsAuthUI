import type {
  OrphanedUsersListFilters,
  UsersListFilters,
} from '@/features/users/types/users.types'

export const usersKeys = {
  all: ['users'] as const,
  lists: () => [...usersKeys.all, 'list'] as const,
  list: (filters: UsersListFilters) => [...usersKeys.lists(), filters] as const,
  orphanedLists: () => [...usersKeys.all, 'orphaned'] as const,
  orphanedList: (filters: OrphanedUsersListFilters) =>
    [...usersKeys.orphanedLists(), filters] as const,
  details: () => [...usersKeys.all, 'detail'] as const,
  detail: (userId: string) => [...usersKeys.details(), userId] as const,
  roles: (userId: string) => [...usersKeys.all, 'roles', userId] as const,
  auditEventsRoot: (userId: string) => [...usersKeys.all, 'audit-events', userId] as const,
  auditEvents: (
    userId: string,
    params?: {
      page?: number
      limit?: number
      category?: string
      eventType?: string
      entityId?: string
    }
  ) =>
    [
      ...usersKeys.auditEventsRoot(userId),
      {
        page: params?.page ?? 1,
        limit: params?.limit ?? 6,
        category: params?.category,
        eventType: params?.eventType,
        entityId: params?.entityId,
      },
    ] as const,
  membershipHistoryRoot: (userId: string) =>
    [...usersKeys.all, 'membership-history', userId] as const,
  membershipHistory: (
    userId: string,
    params?: {
      page?: number
      limit?: number
      entityId?: string
      eventType?: string
    }
  ) =>
    [
      ...usersKeys.membershipHistoryRoot(userId),
      {
        page: params?.page ?? 1,
        limit: params?.limit ?? 6,
        entityId: params?.entityId,
        eventType: params?.eventType,
      },
    ] as const,
  roleMemberships: (userId: string) => [...usersKeys.all, 'role-memberships', userId] as const,
  roleMembershipsList: (userId: string, options?: { includeInactive?: boolean }) =>
    [
      ...usersKeys.roleMemberships(userId),
      { includeInactive: options?.includeInactive ?? false },
    ] as const,
  apiKeys: (userId: string) => [...usersKeys.all, 'api-keys', userId] as const,
  sessions: (userId: string) => [...usersKeys.all, 'sessions', userId] as const,
  permissions: (userId: string) => [...usersKeys.all, 'permissions', userId] as const,
  invite: () => [...usersKeys.all, 'invite'] as const,
  create: () => [...usersKeys.all, 'create'] as const,
  update: () => [...usersKeys.all, 'update'] as const,
  remove: () => [...usersKeys.all, 'remove'] as const,
  resendInvite: (userId: string) => [...usersKeys.all, 'resend-invite', userId] as const,
  restore: (userId: string) => [...usersKeys.all, 'restore', userId] as const,
}
