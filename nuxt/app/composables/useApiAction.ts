import { getApiErrorMessage } from '~/api/client'

// The single home for the "run a mutation, toast the outcome" pattern used across every feature.
// Mutations invalidate their domain root via onSettled (see queries/**), so active queries
// refresh automatically — `run` does NOT refetch. It returns a discriminated outcome so callers
// can use the result (e.g. a one-time secret) and only close/reset/navigate on success.
//
// Toast content is flexible so it fits both CRUD (fixed titles) and auth flows:
//   - `success` is optional (navigate-on-success flows show no toast);
//   - `error` may be a title string (description defaults to the parsed API error), a full
//     { title, description }, or a function of the error (e.g. describeAuthError for 429 cooldowns).

export type ToastContent = string | { title: string, description?: string }
export type ActionToasts = {
  success?: ToastContent
  error: ToastContent | ((error: unknown) => ToastContent)
}
export type ActionOutcome<R> = { ok: true, data: R } | { ok: false, error: unknown }

function resolveToast(content: ToastContent, fallbackDescription?: string): { title: string, description?: string } {
  return typeof content === 'string'
    ? { title: content, description: fallbackDescription }
    : { title: content.title, description: content.description ?? fallbackDescription }
}

export function useApiAction() {
  const toast = useToast()

  async function run<R>(fn: () => Promise<R>, messages: ActionToasts): Promise<ActionOutcome<R>> {
    try {
      const data = await fn()
      if (messages.success) {
        toast.add({ ...resolveToast(messages.success), color: 'success', icon: 'i-lucide-check' })
      }
      return { ok: true, data }
    } catch (error) {
      const raw = typeof messages.error === 'function' ? messages.error(error) : messages.error
      toast.add({ ...resolveToast(raw, getApiErrorMessage(error)), color: 'error', icon: 'i-lucide-triangle-alert' })
      return { ok: false, error }
    }
  }

  return { run }
}
