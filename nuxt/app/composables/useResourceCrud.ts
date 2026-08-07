// Shared CRUD behavior for the list features (users, roles, permissions): the create-permission
// gate, the delete-confirm flow, and a re-exported `run` (from useApiAction) for their create/edit
// handlers. Each feature keeps its own (per-resource) query + create/edit forms. Delete + the
// create/edit mutations invalidate their domain root via onSettled, so nothing refetches manually.

export function useResourceCrud<T extends { id: string }>(options: {
  noun: string // singular, for the delete toast, e.g. "user"
  createPermission?: string
  deleteMutation?: { mutateAsync: (id: string) => Promise<unknown> }
}) {
  const { hasPermission } = useAuth()
  const { run } = useApiAction()
  const canCreate = computed(() => (options.createPermission ? hasPermission(options.createPermission) : false))

  // Generic delete-confirm flow (identical across the list features).
  const capitalized = options.noun.charAt(0).toUpperCase() + options.noun.slice(1)
  const deleteOpen = ref(false)
  const deleteTarget = ref<T | null>(null)
  const deleting = ref(false)
  function openDelete(row: T) {
    deleteTarget.value = row
    deleteOpen.value = true
  }
  async function confirmDelete() {
    const target = deleteTarget.value
    if (!target || !options.deleteMutation) return
    deleting.value = true
    const res = await run(() => options.deleteMutation!.mutateAsync(target.id), {
      success: `${capitalized} deleted`,
      error: `Could not delete ${options.noun}`
    })
    if (res.ok) deleteOpen.value = false
    deleting.value = false
  }

  return { canCreate, run, deleteOpen, deleteTarget, deleting, openDelete, confirmDelete }
}
