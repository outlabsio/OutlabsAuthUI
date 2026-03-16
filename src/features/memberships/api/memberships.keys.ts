export const membershipsKeys = {
  all: ['memberships'] as const,
  userLists: () => [...membershipsKeys.all, 'user-list'] as const,
  userList: (userId: string) => [...membershipsKeys.userLists(), userId] as const,
}
