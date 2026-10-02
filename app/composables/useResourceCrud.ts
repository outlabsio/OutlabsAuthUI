import type { ConfirmCopy } from '~/composables/useConfirmAction'

// Shared CRUD behavior for the users list: the create-permission
// gate, the destructive confirmation for a row (AppConfirmDialog through useConfirmAction), and a
// re-exported `run` (from useApiAction) for their create/edit handlers. Each feature keeps its own
// (per-resource) query + create/edit forms and says what its destructive action does in the
// backend's terms (`describeRemove`). Writes invalidate their domain root via onSettled, so
// nothing refetches manually.

export function useResourceCrud<T extends { id: string }>(options: {
  noun: string // singular, for the toasts, e.g. "user"
  createPermission?: string
  // The row action: DELETE /<resource>/{id}, worded "delete" (users are retained and restorable).
  // Resources whose DELETE archives (roles, permissions) use a policy + menuItems composable
  // (useRoleActions / usePermissionActions) instead.
  removeMutation?: { mutateAsync: (id: string) => Promise<unknown> }
  describeRemove?: (row: T) => ConfirmCopy
}) {
  const { hasPermission } = useAuth()
  const { run } = useApiAction()
  const canCreate = computed(() => (options.createPermission ? hasPermission(options.createPermission) : false))

  const capitalized = options.noun.charAt(0).toUpperCase() + options.noun.slice(1)
  const remove = useConfirmAction<T>({
    describe: row => options.describeRemove?.(row) ?? {
      title: `Delete ${options.noun}`,
      confirmLabel: `Delete ${options.noun}`
    },
    action: row => options.removeMutation!.mutateAsync(row.id),
    success: `${capitalized} deleted`,
    error: `Could not delete ${options.noun}`,
    enabled: () => Boolean(options.removeMutation)
  })

  return { canCreate, run, remove }
}
