import { getApiErrorMessage } from '~/api/client'

// The single home for the "run a mutation, toast the outcome" pattern used across every feature.
// Mutations invalidate their domain root via onSettled (see queries/**), so active queries
// refresh automatically — `run` does NOT refetch. It returns a discriminated outcome so callers
// can use the result (e.g. a one-time secret) and only close/reset their form on success.

export type ActionToasts = { success: string, error: string }
export type ActionOutcome<R> = { ok: true, data: R } | { ok: false, error: unknown }

export function useApiAction() {
  const toast = useToast()

  async function run<R>(fn: () => Promise<R>, messages: ActionToasts): Promise<ActionOutcome<R>> {
    try {
      const data = await fn()
      toast.add({ title: messages.success, color: 'success', icon: 'i-lucide-check' })
      return { ok: true, data }
    } catch (error) {
      toast.add({ title: messages.error, description: getApiErrorMessage(error), color: 'error', icon: 'i-lucide-triangle-alert' })
      return { ok: false, error }
    }
  }

  return { run }
}
