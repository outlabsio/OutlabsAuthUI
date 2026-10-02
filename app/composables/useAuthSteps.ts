import { useEventListener } from '@vueuse/core'
import { computed, nextTick, watch, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue'

// Shared step mechanics for the guest flows (sign-in, recovery, access code).
//
// - useUrlStep: the current step lives in the URL (`?step=`), so browser Back/Forward move
//   between steps and a reload stays on the step. A step is only shown when the flow still has
//   what it needs (e.g. the OTP step needs the pending identifier); otherwise the first step.
// - useAuthStepFocus: after a step change, focus moves to the new step's heading
//   (AppAuthStepHeading) so keyboard and screen-reader users land on it — except where the
//   step focuses its own first control (the OTP input autofocuses).
// - onPageRestore: run a reset when the page comes back from the back/forward cache (e.g. Back
//   from an OAuth provider), where a button left in its loading state would stay stuck.

export const AUTH_STEP_HEADING_ID = 'auth-step-heading'

export function useUrlStep<S extends string>(options: {
  // step → its `?step=` value; the first step has none.
  steps: Record<S, string | null>
  initial: S
  available: (step: S) => boolean
}): { step: ComputedRef<S>, goTo: (step: S, mode?: 'push' | 'replace') => Promise<void> } {
  const route = useRoute()
  const router = useRouter()
  const entries = Object.entries(options.steps) as Array<[S, string | null]>

  const step = computed<S>(() => {
    const value = route.query.step
    const match = entries.find(([, param]) => param != null && param === value)
    return match && options.available(match[0]) ? match[0] : options.initial
  })

  async function goTo(next: S, mode: 'push' | 'replace' = 'push') {
    const { step: _current, ...rest } = route.query
    const param = options.steps[next]
    const location = { query: param ? { ...rest, step: param } : rest }
    await (mode === 'replace' ? router.replace(location) : router.push(location))
  }

  return { step, goTo }
}

export function useAuthStepFocus(step: MaybeRefOrGetter<string>, options: { skip?: (step: string) => boolean } = {}) {
  watch(() => toValue(step), async (next) => {
    await nextTick()
    if (options.skip?.(next)) return
    document.getElementById(AUTH_STEP_HEADING_ID)?.focus()
  })
}

export function onPageRestore(reset: () => void) {
  if (typeof window === 'undefined') return
  useEventListener(window, 'pageshow', (event: PageTransitionEvent) => {
    if (event.persisted) reset()
  })
}
