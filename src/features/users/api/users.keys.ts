import type { UsersListFilters } from '@/features/users/types/users.types'

export const usersKeys = {
  all: ['users'] as const,
  lists: () => [...usersKeys.all, 'list'] as const,
  list: (filters: UsersListFilters) => [...usersKeys.lists(), filters] as const,
  detail: (userId: string) => [...usersKeys.all, 'detail', userId] as const,
  roles: (userId: string) => [...usersKeys.all, 'roles', userId] as const,
  permissions: (userId: string) => [...usersKeys.all, 'permissions', userId] as const,
  invite: () => [...usersKeys.all, 'invite'] as const,
  resendInvite: (userId: string) => [...usersKeys.all, 'resend-invite', userId] as const,
}
