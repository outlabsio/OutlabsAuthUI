export const membershipsKeys = {
  all: ['memberships'] as const,
  userLists: () => [...membershipsKeys.all, 'user-list'] as const,
  userList: (userId: string, includeInactive = false) =>
    [...membershipsKeys.userLists(), userId, { includeInactive }] as const,
}
