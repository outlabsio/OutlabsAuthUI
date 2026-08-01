export const apiKeysKeys = {
  all: ['api-keys'] as const,
  lists: () => [...apiKeysKeys.all, 'list'] as const,
  list: (params?: unknown) => [...apiKeysKeys.lists(), params ?? {}] as const,
  grantableScopes: (params?: unknown) =>
    [...apiKeysKeys.all, 'grantable-scopes', params ?? {}] as const,
  principalsLists: () => [...apiKeysKeys.all, 'principals', 'list'] as const,
  principalsList: (params?: unknown) =>
    [...apiKeysKeys.principalsLists(), params ?? {}] as const,
  principalKeyLists: () => [...apiKeysKeys.all, 'principal-keys', 'list'] as const,
  principalKeyList: (params?: unknown) =>
    [...apiKeysKeys.principalKeyLists(), params ?? {}] as const,
} as const
