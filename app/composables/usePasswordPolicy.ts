import type { MaybeRefOrGetter } from 'vue'
import { passwordPolicyHint, resolvePasswordPolicy } from '~/utils/password-policy'

// The password policy every new-password form validates with and states (F-097): the one the
// backend publishes in /auth/config (`password_policy`), with the request models' bounds applied,
// or outlabs-auth's default while the capabilities are unknown (their request failed). The owning
// composables build their form schema from `policy` (newPasswordSchemaFor and the schema
// factories in app/schemas) and pass `hint` to the new-password field's `help`.

/** A UForm instance as its template ref exposes it (the parts a re-check needs). */
export type RecheckableForm = {
  getErrors: () => Array<{ name?: string }>
  validate: (options: { name: string[], silent: boolean }) => Promise<unknown>
}

export function usePasswordPolicy() {
  const { capabilities } = useAuth()
  const policy = computed(() => resolvePasswordPolicy(capabilities.value?.password_policy))
  const hint = computed(() => passwordPolicyHint(policy.value))
  return { policy, hint }
}

/**
 * Re-checks the fields a page form flags when its schema changes: the policy can arrive after
 * the form rendered (the capabilities failed to load at boot and a later request succeeded), and
 * UForm does not re-validate on a new schema by itself, so a message from the fallback rules
 * would otherwise stay until the next keystroke. (Admin dialogs open only where the capabilities
 * loaded: those pages fail closed without them.)
 */
export function useRecheckOnSchemaChange(form: MaybeRefOrGetter<RecheckableForm | null | undefined>, schema: MaybeRefOrGetter<unknown>) {
  // After the render (flush 'post'): UForm validates with its `schema` prop, which holds the new
  // schema only once the component that binds it has updated.
  watch(() => toValue(schema), () => {
    const instance = toValue(form)
    if (!instance) return
    const flagged = [...new Set(instance.getErrors().flatMap(error => (error.name ? [error.name] : [])))]
    if (flagged.length) void instance.validate({ name: flagged, silent: true })
  }, { flush: 'post' })
}
