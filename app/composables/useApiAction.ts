import { getCurrentScope, onScopeDispose, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'
import { useQueryCache } from '@pinia/colada'
import { ApiError, apiFormErrors, formFieldFor, normalizeApiError, type ApiFailureKind, type ApiIssue, type NormalizedApiError } from '~/api/errors'
import { MY_PERMISSIONS_KEY } from '~/queries/session'

// The single home for the "run a mutation, report the outcome" pattern used across every feature.
// Mutations invalidate related queries on settle without awaiting them (queries/invalidation.ts),
// so `run` never refetches and a refetch failure never turns a successful write into an error.
// It returns a discriminated outcome so callers can use the result (e.g. a one-time secret) and
// only close/reset/navigate on success.
//
// Failures are classified by the error model (app/api/errors.ts) and treated by kind:
//   validation   -> issues land on the matching UFormField (`form`, `fieldMap`) and stay there
//                   until the user changes that value; the rest are listed in the dialog's alert
//                   (`inline`) or the toast;
//   forbidden    -> names the missing permissions and refreshes the actor's permissions;
//   not_found    -> `onNotFound` (e.g. close the dialog) plus a toast saying it no longer exists,
//                   limited to `notFoundCodes` when the request also names other records;
//   rate_limited -> the cooldown in seconds;
//   server / network / timeout -> a retry hint (status in the title for server errors);
//   ended session -> nothing: the session layer explains it on the sign-in page.
//
// Toast content stays flexible so it fits CRUD and auth flows: `success` is optional; `error` is a
// title string (description from the error model), a full { title, description }, or a function
// of the error. A function returning null means the caller explains that error itself (kept for
// existing callers; prefer `inline`).

export type ToastContent = string | { title: string, description?: string }
export type ActionToasts = {
  success?: ToastContent
  error: ToastContent | ((error: unknown) => ToastContent | null)
}

/** The part of the UForm API `run` uses; a template ref to <UForm> satisfies it. */
export type ActionForm = {
  setErrors: (errors: Array<{ name?: string, message: string }>, name?: string) => void
  getErrors: (name?: string) => Array<{ name?: string, message: string, id?: string }>
  // UForm exposes both. `loading` is true while a submit runs; `$props.state` is the form state
  // the server's issues refer to. Without them server issues are set once and not kept.
  loading?: boolean
  $props?: { state?: unknown }
}

/** A role the action grants, so a delegation denial can name the roles that caused it. */
export type ActionRole = { display_name?: string | null, name?: string | null, permissions?: readonly string[] | null }

/** What a dialog renders for a failed action (see AppApiErrorAlert). */
export type ActionError = {
  kind: ApiFailureKind
  status: number
  code: string | null
  title: string
  description: string
  // Validation issues that did not land on a form field.
  issues: ApiIssue[]
  missingPermissions: string[]
  requiredPermissions: string[]
  // Display names of the granted roles that carry a missing permission.
  contributingRoles: string[]
  retryAfterSeconds: number | null
}

export type ActionOptions = ActionToasts & {
  // The dialog's UForm: server validation issues land on its fields (form.setErrors).
  form?: MaybeRefOrGetter<ActionForm | null | undefined>
  // Wire field path -> form field name; an entry for a field also covers its members (`value.str`,
  // `role_ids.0`). `null` keeps that path off the fields (listed instead).
  fieldMap?: Record<string, string | null>
  // Answers that are not validation issues but belong on a field of `form`, e.g. a wrong current
  // password (401 INVALID_CREDENTIALS) on Current password. They land, stay and take focus like
  // server validation issues do.
  fieldErrors?: (error: unknown) => Array<{ name: string, message: string }>
  // Where the caller shows the error instead of a toast. A ref receives the ActionError (the
  // dialog renders it with <AppApiErrorAlert>; it is cleared when the run starts). A predicate
  // marks the errors the caller explains itself from the returned outcome.
  inline?: Ref<ActionError | null> | ((error: NormalizedApiError) => boolean)
  // The target no longer exists (404/410): typically closes the dialog. A toast explains it.
  onNotFound?: (error: NormalizedApiError) => void
  // The error codes that mean the dialog's own record is gone, e.g. ['USER_NOT_FOUND']. Without
  // it every not-found answer calls onNotFound, which is right when the request names only that
  // record (DELETE /users/{id}). A request that also names other records (roles to grant, an
  // entity) should pass it: a missing role or entity is then reported like any other failure,
  // in the dialog, which stays open.
  notFoundCodes?: readonly string[]
  // Roles the action grants; a delegation denial then names those carrying missing permissions.
  grantedRoles?: MaybeRefOrGetter<readonly ActionRole[] | null | undefined>
}

export type ActionOutcome<R> = { ok: true, data: R } | { ok: false, error: unknown, apiError: NormalizedApiError }

function resolveToast(content: ToastContent, fallbackDescription?: string): { title: string, description?: string } {
  return typeof content === 'string'
    ? { title: content, description: fallbackDescription }
    : { title: content.title, description: content.description ?? fallbackDescription }
}

/** Display names of the roles that carry any of the missing permissions. */
export function contributingRoleNames(roles: readonly ActionRole[] | null | undefined, missing: readonly string[]): string[] {
  if (!roles?.length || !missing.length) return []
  const wanted = new Set(missing)
  return roles
    .filter(role => (role.permissions ?? []).some(name => wanted.has(name)))
    .map(role => role.display_name || role.name || '')
    .filter(Boolean)
}

function issueLine(issue: ApiIssue) {
  return issue.label ? `${issue.label}: ${issue.message}` : issue.message
}

// A write that timed out may still have been applied server-side.
const TIMEOUT_WRITE_HINT = 'The change may still have been saved; refresh before trying again.'

/**
 * The dialog/toast view of a failure. `unmatched` are the validation issues that did not land on
 * a form field (all of them without a form); `landed` counts the ones that did.
 */
export function describeActionError(
  apiError: NormalizedApiError,
  title: string,
  { unmatched = apiError.issues, landed = 0, roles }: { unmatched?: ApiIssue[], landed?: number, roles?: readonly ActionRole[] | null } = {}
): ActionError {
  let description = apiError.message
  if (apiError.issues.length) {
    description = landed && unmatched.length
      ? 'Check the highlighted fields and the problems listed here.'
      : landed
        ? 'Check the highlighted fields.'
        : apiError.issues.length === 1 ? apiError.message : 'Fix these problems and try again.'
  } else if (apiError.kind === 'forbidden' && apiError.missingPermissions.length) {
    description = apiError.message.replace(/\s*Missing: .*$/, '')
  } else if (apiError.kind === 'timeout') {
    description = `${apiError.message} ${TIMEOUT_WRITE_HINT}`
  }
  return {
    kind: apiError.kind,
    status: apiError.status,
    code: apiError.code,
    title: apiError.kind === 'server' && apiError.status ? `${title} (HTTP ${apiError.status})` : title,
    description,
    issues: unmatched.length > 1 || landed ? unmatched : [],
    missingPermissions: apiError.missingPermissions,
    requiredPermissions: apiError.requiredPermissions,
    contributingRoles: contributingRoleNames(roles, apiError.missingPermissions),
    retryAfterSeconds: apiError.retryAfterSeconds
  }
}

// A toast has no badges or list, so everything goes into one description.
function toastDescription(view: ActionError, apiError: NormalizedApiError): string {
  if (view.missingPermissions.length) {
    const roles = view.contributingRoles.length ? ` Granted through: ${view.contributingRoles.join(', ')}.` : ''
    return `${apiError.message}${roles}`
  }
  const listed = view.issues.length ? ` ${view.issues.map(issueLine).join('; ')}.` : ''
  return `${view.description}${listed}`.trim()
}

/**
 * Moves focus to the first field with an error. Use as a UForm `@error` handler for client-side
 * validation (`@error="focusFirstFormError"`); `run` does the same for server issues.
 */
export function focusFirstFormError(event: { errors: Array<{ id?: string }> } | Array<{ id?: string }>) {
  const errors = Array.isArray(event) ? event : event.errors
  if (typeof document === 'undefined') return
  // UForm disables its inputs while a submit (and its validation) runs and re-enables them on the
  // next render; a disabled input cannot take focus, so focus once that render is done.
  setTimeout(() => {
    // The first invalid field on screen, whatever order the schema reported them in.
    const element = errors
      .map(error => (error.id ? document.getElementById(error.id) : null))
      .filter((candidate): candidate is HTMLElement => Boolean(candidate))
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))[0]
    element?.focus()
    element?.scrollIntoView({ block: 'center' })
  }, 0)
}

function valueAt(state: unknown, path: string): string {
  let current: unknown = state
  for (const part of path.split('.')) {
    if (current === null || typeof current !== 'object') {
      current = undefined
      break
    }
    current = (current as Record<string, unknown>)[part]
  }
  try {
    return JSON.stringify(current) ?? 'undefined'
  } catch {
    return String(current)
  }
}

/**
 * Keeps server issues on their fields until the user changes the value they refer to, and
 * returns the function that stops doing so.
 *
 * UForm re-validates a field on blur, on change and 300 ms after the last keystroke
 * (validateOnInputDelay), replacing that field's errors with the client-side result. For a value
 * the server refused that result is a pass, so a submit made inside that window (retype the
 * email, press Enter) would lose the server's error a moment after it landed. The errors are put
 * back while the field still holds the submitted value; once it changes, UForm's own validation
 * owns the field again. Keeping stops at the form's next submit, when the form unmounts (the
 * dialog closed) or when `run` starts again for it.
 */
function keepServerErrors(
  form: ActionForm,
  currentForm: () => ActionForm | null | undefined,
  errors: Array<{ name: string, message: string }>,
  onEnd: () => void
): (() => void) | null {
  const state = form.$props?.state
  if (!state || typeof state !== 'object' || !errors.length) return null
  const kept = new Map<string, { messages: string[], value: string }>()
  for (const { name, message } of errors) {
    const entry = kept.get(name) ?? { messages: [], value: valueAt(state, name) }
    entry.messages.push(message)
    kept.set(name, entry)
  }
  // `run` starts inside the submit that failed; only a submit after that one ends the keeping.
  let idleSinceFailure = !form.loading
  const stopWatching = watch(
    () => [currentForm(), form.loading, form.getErrors(), [...kept.keys()].map(name => valueAt(state, name))] as const,
    ([instance, loading, shown]) => {
      if (instance !== form) return stop()
      if (loading) {
        if (idleSinceFailure) stop()
        return
      }
      idleSinceFailure = true
      for (const [name, entry] of kept) {
        if (valueAt(state, name) !== entry.value) kept.delete(name)
      }
      if (!kept.size) return stop()
      for (const [name, { messages }] of kept) {
        const present = new Set(shown.filter(error => error.name === name).map(error => error.message))
        if (messages.every(message => present.has(message))) continue
        const others = form.getErrors(name).filter(error => !messages.includes(error.message))
        form.setErrors([...others, ...messages.map(message => ({ name, message }))], name)
      }
    }
  )
  function stop() {
    stopWatching()
    onEnd()
  }
  return stop
}

export function useApiAction() {
  const toast = useToast()
  const queryCache = useQueryCache()
  // Forms whose server errors are being kept on their fields (see keepServerErrors).
  const keeping = new Map<ActionForm, () => void>()
  function stopKeeping(form: ActionForm | null | undefined) {
    if (form) keeping.get(form)?.()
  }
  if (getCurrentScope()) {
    onScopeDispose(() => {
      for (const stop of [...keeping.values()]) stop()
    })
  }

  async function run<R>(fn: () => Promise<R>, options: ActionOptions): Promise<ActionOutcome<R>> {
    const inlineRef = typeof options.inline === 'function' ? null : options.inline ?? null
    if (inlineRef) inlineRef.value = null
    stopKeeping(toValue(options.form))
    try {
      const data = await fn()
      if (options.success) {
        toast.add({ ...resolveToast(options.success), color: 'success', icon: 'i-lucide-check' })
      }
      return { ok: true, data }
    } catch (error) {
      const apiError = normalizeApiError(error)
      if (!(error instanceof ApiError)) console.error('[useApiAction] unexpected failure', error)
      // An ended session is explained on the sign-in page the session layer routes to.
      if (apiError.sessionEnded) return { ok: false, error, apiError }
      // A denial means the console's view of the actor's permissions may be stale.
      if (apiError.kind === 'forbidden') queryCache.invalidateQueries({ key: MY_PERMISSIONS_KEY }).catch(() => {})

      const content = typeof options.error === 'function' ? options.error(error) : options.error
      const explainedByCaller = content === null
        || (typeof options.inline === 'function' && options.inline(apiError))

      // Validation issues onto the form's fields; whatever does not land stays listed.
      let unmatched = apiError.issues
      let landed = 0
      const form = toValue(options.form)
      const answers = form && options.fieldErrors ? options.fieldErrors(error) : []
      if (form && (apiError.issues.length || answers.length)) {
        const mapped = apiFormErrors(apiError, options.fieldMap)
        const fieldErrors = [...mapped.fieldErrors, ...answers]
        const unmapped = mapped.unmatched
        form.setErrors(fieldErrors)
        const shown = form.getErrors()
        const shownNames = new Set(shown.map(e => e.name))
        const onFields = fieldErrors.filter(e => shownNames.has(e.name))
        landed = onFields.length
        const missed = new Set(fieldErrors.filter(e => !shownNames.has(e.name)).map(e => e.name))
        unmatched = [...unmapped, ...apiError.issues.filter(issue => missed.has(formFieldFor(issue.path, options.fieldMap) ?? ''))]
        // UForm's own input validation would replace them within 300 ms; keep them until edited.
        const stop = keepServerErrors(form, () => toValue(options.form), onFields, () => keeping.delete(form))
        if (stop) keeping.set(form, stop)
        // UForm disables its inputs until the submit handler returns; focusFirstFormError waits.
        if (landed) focusFirstFormError(form.getErrors())
      }

      const fallbackTitle = content ? resolveToast(content).title : 'Something went wrong'
      const view = describeActionError(apiError, fallbackTitle, { unmatched, landed, roles: toValue(options.grantedRoles) })
      const callerDescription = content && typeof content !== 'string' ? content.description : undefined

      const recordGone = apiError.kind === 'not_found'
        && (!options.notFoundCodes || (apiError.code !== null && options.notFoundCodes.includes(apiError.code)))
      if (recordGone && options.onNotFound) {
        options.onNotFound(apiError)
        toast.add({ title: view.title, description: apiError.message, color: 'error', icon: 'i-lucide-triangle-alert' })
        return { ok: false, error, apiError }
      }
      if (explainedByCaller) return { ok: false, error, apiError }
      if (inlineRef) {
        inlineRef.value = callerDescription ? { ...view, description: callerDescription } : view
        return { ok: false, error, apiError }
      }

      toast.add({
        title: view.title,
        description: callerDescription ?? toastDescription(view, apiError),
        color: 'error',
        icon: 'i-lucide-triangle-alert'
      })
      return { ok: false, error, apiError }
    }
  }

  return { run }
}
