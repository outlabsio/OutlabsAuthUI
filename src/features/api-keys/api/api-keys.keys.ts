export const apiKeysKeys = {
  all: ['api-keys'] as const,
  lists: () => [...apiKeysKeys.all, 'list'] as const,
  list: (params?: unknown) => [...apiKeysKeys.lists(), params ?? {}] as const,
  grantableScopes: (params?: unknown) =>
    [...apiKeysKeys.all, 'grantable-scopes', params ?? {}] as const,
} as const
