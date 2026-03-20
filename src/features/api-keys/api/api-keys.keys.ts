export const apiKeysKeys = {
  all: ['api-keys'] as const,
  lists: () => [...apiKeysKeys.all, 'list'] as const,
  list: () => [...apiKeysKeys.lists()] as const,
} as const
