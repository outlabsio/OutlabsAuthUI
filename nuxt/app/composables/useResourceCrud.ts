import { getApiErrorMessage } from '~/api/client'

// Shared CRUD behavior for the list features (users, roles, permissions). Extracts the parts
// that were identical across them — the create-permission gate, the toast-wrapped action runner,
// and the delete-confirm flow — while each feature keeps its own (inherently per-resource) query
// and create/edit forms. Extract-then-DRY: added once the shape was proven across three features.

export type CrudToastMessages = { success: string, error: string }

export function useResourceCrud<T extends { id: string }>(options: {
  noun: string // singular, for the delete toast, e.g. "user"
  refetch: () => Promise<unknown>
  createPermission?: string
  deleteMutation?: { mutateAsync: (id: string) => Promise<unknown> }
}) {
  const toast = useToast()
  const { hasPermission } = useAuth()
  const canCreate = computed(() => (options.createPermission ? hasPermission(options.createPermission) : false))

  // Toast-wrapped action runner — removes the try/catch + toast + refetch from every handler.
  // Returns true on success so callers can close/reset their form.
  async function run(fn: () => Promise<unknown>, messages: CrudToastMessages): Promise<boolean> {
    try {
      await fn()
      toast.add({ title: messages.success, color: 'success', icon: 'i-lucide-check' })
      await options.refetch()
      return true
    } catch (err) {
      toast.add({ title: messages.error, description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
      return false
    }
  }

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
    const ok = await run(() => options.deleteMutation!.mutateAsync(target.id), {
      success: `${capitalized} deleted`,
      error: `Could not delete ${options.noun}`
    })
    if (ok) deleteOpen.value = false
    deleting.value = false
  }

  return { canCreate, run, deleteOpen, deleteTarget, deleting, openDelete, confirmDelete }
}
