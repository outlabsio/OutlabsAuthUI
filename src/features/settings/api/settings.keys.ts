export const settingsKeys = {
  all: ['settings'] as const,
  entityTypeConfig: () => [...settingsKeys.all, 'entity-type-config'] as const,
} as const
