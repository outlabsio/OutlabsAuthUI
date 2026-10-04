import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive, ref, shallowRef } from 'vue'
import { ApiError } from '~/api/errors'
import type { ActionError, ActionForm } from '~/composables/useApiAction'

// useApiAction decides how every mutation failure is shown. These tests drive `run` with the
// Nuxt UI toast and the Pinia Colada cache stubbed, so each treatment is pinned: fields, the
// inline alert, delegation denials, not-found, ended sessions and the toast fallbacks.

const toastAdd = vi.fn()
const invalidateQueries = vi.fn(() => Promise.resolve())

vi.mock('@pinia/colada', async importOriginal => ({
  ...(await importOriginal<typeof import('@pinia/colada')>()),
  useQueryCache: () => ({ invalidateQueries })
}))

const { useApiAction, describeActionError, contributingRoleNames } = await import('~/composables/useApiAction')
const { normalizeApiError } = await import('~/api/errors')

function httpError(status: number, data: Record<string, unknown> | null) {
  return new ApiError({ message: 'Request failed', status, statusText: '', data })
}

function fakeForm(fields: string[]): ActionForm & { errors: Array<{ name?: string, message: string, id?: string }> } {
  const form = {
    errors: [] as Array<{ name?: string, message: string, id?: string }>,
    setErrors(errors: Array<{ name?: string, message: string }>) {
      // Like UForm: only errors for registered inputs are kept.
      form.errors = errors.filter(e => e.name && fields.includes(e.name)).map(e => ({ ...e, id: `input-${e.name}` }))
    },
    getErrors() {
      return form.errors
    }
  }
  return form
}

// A reactive stand-in for <UForm>: its errors, its loading flag while a submit runs, its state
// prop, and the name-filtered re-validation UForm runs on blur, change and 300 ms after typing
// (validateOnInputDelay), which replaces that field's errors with the client-side result.
// `fields` registers inputs that have no state key of their own (a field the schema refines).
function reactiveForm<S extends Record<string, unknown>>(initial: S, fields: string[] = []) {
  const state = reactive({ ...initial })
  const errors = shallowRef<Array<{ name?: string, message: string }>>([])
  const loading = ref(false)
  const form = {
    $props: { state },
    get loading() {
      return loading.value
    },
    setErrors(next: Array<{ name?: string, message: string }>, name?: string) {
      const kept = name ? errors.value.filter(error => error.name !== name) : []
      errors.value = [...kept, ...next.filter(error => !error.name || error.name in state || fields.includes(error.name))]
    },
    getErrors(name?: string) {
      return name ? errors.value.filter(error => error.name === name) : errors.value
    },
    // Client-side validation of one field; the schema accepts every value here.
    revalidate(name: string) {
      errors.value = errors.value.filter(error => error.name !== name)
    }
  }
  // Like UForm's submit: loading while the handler (and `run`) runs, the full client validation first.
  async function submit(handler: () => Promise<unknown>) {
    loading.value = true
    errors.value = []
    try {
      await handler()
    } finally {
      loading.value = false
    }
  }
  return { form, state, submit }
}

const duplicateEmail = () => httpError(409, { error: 'USER_ALREADY_EXISTS', message: 'User with email taken@example.com already exists' })

beforeEach(() => {
  // Nuxt auto-import; the config unstubs globals after every test.
  vi.stubGlobal('useToast', () => ({ add: toastAdd }))
  toastAdd.mockClear()
  invalidateQueries.mockClear()
})

describe('run', () => {
  it('returns the data and toasts success', async () => {
    const { run } = useApiAction()
    const outcome = await run(() => Promise.resolve({ api_key: 'example-secret' }), { success: 'API key created', error: 'Could not create API key' })
    expect(outcome).toEqual({ ok: true, data: { api_key: 'example-secret' } })
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: 'API key created', color: 'success' }))
  })

  it('puts server validation issues on the matching fields and lists the rest inline', async () => {
    const { run } = useApiAction()
    const form = fakeForm(['email', 'password'])
    const inline = ref<ActionError | null>(null)
    const outcome = await run(() => Promise.reject(httpError(422, {
      error: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: {
        errors: [
          { loc: ['body', 'email'], msg: 'value is not a valid email address' },
          { loc: ['body', 'password'], msg: 'Value error, Password too weak' },
          { loc: ['body', 'metadata'], msg: 'Input should be a valid dictionary' }
        ]
      }
    })), { error: 'Could not create user', form, inline })

    expect(outcome.ok).toBe(false)
    expect(form.errors.map(e => [e.name, e.message])).toEqual([
      ['email', 'Value is not a valid email address'],
      ['password', 'Password too weak']
    ])
    expect(inline.value).toMatchObject({
      kind: 'validation',
      title: 'Could not create user',
      description: 'Check the highlighted fields and the problems listed here.'
    })
    expect(inline.value?.issues).toEqual([{ path: 'metadata', label: 'Metadata', message: 'Input should be a valid dictionary' }])
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('renames wire fields through fieldMap', async () => {
    const { run } = useApiAction()
    const form = fakeForm(['new_password'])
    await run(() => Promise.reject(httpError(400, { error: 'INVALID_PASSWORD', message: 'Password must contain a digit' })), {
      error: 'Could not reset password',
      form,
      fieldMap: { password: 'new_password' }
    })
    expect(form.errors).toEqual([{ name: 'new_password', message: 'Password must contain a digit', id: 'input-new_password' }])
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: 'Could not reset password', description: 'Check the highlighted fields.' }))
  })

  it('lands caller-recognised answers on fields (fieldErrors), even when they are not validation issues', async () => {
    const { run } = useApiAction()
    const { form, submit } = reactiveForm({ current_password: 'Wrong-pass1!', new_password: 'Next-pass1!' })
    const wrongPassword = httpError(401, { error: 'INVALID_CREDENTIALS', message: 'Current password is incorrect' })
    await submit(() => run(() => Promise.reject(wrongPassword), {
      error: () => null,
      form,
      fieldErrors: error => ((error as ApiError).status === 401 ? [{ name: 'current_password', message: 'Current password is incorrect.' }] : [])
    }))
    expect(form.getErrors()).toEqual([{ name: 'current_password', message: 'Current password is incorrect.' }])
    // Kept through UForm's re-validation of the unchanged value, like a server validation issue.
    form.revalidate('current_password')
    await nextTick()
    expect(form.getErrors('current_password')).toEqual([{ name: 'current_password', message: 'Current password is incorrect.' }])
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('keeps a server error on its field while UForm re-validates the unchanged value', async () => {
    const { run } = useApiAction()
    const { form, submit } = reactiveForm({ email: 'taken@example.com', password: 'x' })
    const formRef = shallowRef(form)
    await submit(() => run(() => Promise.reject(duplicateEmail()), { error: 'Could not create user', form: formRef }))
    await nextTick()
    expect(form.getErrors('email')).toHaveLength(1)

    // The debounced input validation of the keystrokes before the submit fires after the answer.
    form.revalidate('email')
    await nextTick()
    expect(form.getErrors('email').map(error => error.message)).toEqual(['User with email taken@example.com already exists'])
    // Blur and change validation of the same value do the same.
    form.revalidate('email')
    await nextTick()
    expect(form.getErrors('email')).toHaveLength(1)
  })

  it('hands the field back to client validation once the value changes', async () => {
    const { run } = useApiAction()
    const { form, state, submit } = reactiveForm({ email: 'taken@example.com' })
    await submit(() => run(() => Promise.reject(duplicateEmail()), { error: 'Could not create user', form }))
    await nextTick()

    state.email = 'someone-else@example.com'
    await nextTick()
    form.revalidate('email')
    await nextTick()
    expect(form.getErrors('email')).toEqual([])
    // Typing the refused value again does not bring the old answer back.
    state.email = 'taken@example.com'
    form.revalidate('email')
    await nextTick()
    expect(form.getErrors('email')).toEqual([])
  })

  it('keeps a server error on a field without a state key until what fieldValues reads changes', async () => {
    const { run } = useApiAction()
    // An ABAC condition's Value: the schema checks it as `value`, its control writes text_value.
    const { form, state, submit } = reactiveForm({ operator: 'matches', text_value: '(?<team>ops)', description: '' }, ['value'])
    const message = 'Invalid regular expression: unknown extension ?<t at position 1'
    const refusal = httpError(400, { error: 'INVALID_INPUT', message, details: { reason: 'invalid_abac_condition', field: 'value' } })
    await submit(() => run(() => Promise.reject(refusal), {
      error: 'Could not add condition',
      form,
      fieldValues: { value: () => [state.operator, state.text_value] }
    }))
    await nextTick()
    expect(form.getErrors('value').map(error => error.message)).toEqual([message])

    // Kept through an edit to another field and the re-validation that follows it.
    state.description = 'Ops only'
    await nextTick()
    form.revalidate('value')
    await nextTick()
    expect(form.getErrors('value').map(error => error.message)).toEqual([message])

    // Editing the pattern hands the field back to client validation.
    state.text_value = '(?P<team>ops)'
    await nextTick()
    form.revalidate('value')
    await nextTick()
    expect(form.getErrors('value')).toEqual([])
  })

  it('stops keeping server errors at the next submit and when the form unmounts', async () => {
    const { run } = useApiAction()
    const { form, submit } = reactiveForm({ email: 'taken@example.com' })
    const formRef = shallowRef<typeof form | null>(form)
    await submit(() => run(() => Promise.reject(duplicateEmail()), { error: 'Could not create user', form: formRef }))
    await nextTick()

    // The resubmit's own client validation clears them and they stay cleared while it runs.
    let seenDuringSubmit: unknown[] = ['not checked']
    await submit(async () => {
      await nextTick()
      seenDuringSubmit = form.getErrors()
    })
    expect(seenDuringSubmit).toEqual([])

    await submit(() => run(() => Promise.reject(duplicateEmail()), { error: 'Could not create user', form: formRef }))
    await nextTick()
    formRef.value = null
    await nextTick()
    form.revalidate('email')
    await nextTick()
    expect(form.getErrors('email')).toEqual([])
  })

  it('lists every issue in the toast when there is no form', async () => {
    const { run } = useApiAction()
    await run(() => Promise.reject(httpError(422, {
      detail: [
        { loc: ['query', 'subject_user_id'], msg: 'Input should be a valid UUID' },
        { loc: ['query', 'actor_user_id'], msg: 'Input should be a valid UUID' }
      ]
    })), { error: 'Could not load audit events' })
    const toast = toastAdd.mock.calls[0]![0] as { description: string }
    expect(toast.description).toBe('Fix these problems and try again. Subject user ID: Input should be a valid UUID; Actor user ID: Input should be a valid UUID.')
  })

  it('names missing permissions and the roles that carry them, and refreshes the actor\'s permissions', async () => {
    const { run } = useApiAction()
    const inline = ref<ActionError | null>(null)
    await run(() => Promise.reject(httpError(403, {
      error: 'PERMISSION_DENIED',
      message: 'You cannot grant permissions you do not hold',
      details: { missing_permissions: ['user:delete'] }
    })), {
      error: 'Could not send invitation',
      inline,
      grantedRoles: [
        { display_name: 'Viewer', permissions: ['user:read'] },
        { display_name: 'Owner', permissions: ['user:read', 'user:delete'] }
      ]
    })
    expect(inline.value).toMatchObject({
      kind: 'forbidden',
      description: 'You cannot grant permissions you do not hold.',
      missingPermissions: ['user:delete'],
      contributingRoles: ['Owner']
    })
    expect(invalidateQueries).toHaveBeenCalledWith({ key: ['my-permissions'] })
  })

  it('puts the missing permissions into the toast when nothing renders them inline', async () => {
    const { run } = useApiAction()
    await run(() => Promise.reject(httpError(403, {
      error: 'PERMISSION_DENIED',
      message: 'You cannot grant permissions you do not hold',
      details: { missing_permissions: ['role:update'] }
    })), { error: 'Could not assign roles', grantedRoles: [{ display_name: 'Editor', permissions: ['role:update'] }] })
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({
      description: 'You cannot grant permissions you do not hold. Missing: role:update. Granted through: Editor.'
    }))
  })

  it('calls onNotFound and explains it in a toast', async () => {
    const { run } = useApiAction()
    const onNotFound = vi.fn()
    const inline = ref<ActionError | null>(null)
    await run(() => Promise.reject(httpError(404, { error: 'USER_NOT_FOUND', message: 'User not found' })), { error: 'Could not update user', inline, onNotFound })
    expect(onNotFound).toHaveBeenCalledOnce()
    expect(inline.value).toBeNull()
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: 'Could not update user', description: expect.stringMatching(/may have been deleted/) }))
  })

  it('limits onNotFound to the codes of the dialog\'s own record', async () => {
    const { run } = useApiAction()
    const onNotFound = vi.fn()
    const inline = ref<ActionError | null>(null)
    // A role the request refers to was deleted elsewhere: the dialog stays open and says so.
    await run(() => Promise.reject(httpError(404, { error: 'ROLE_NOT_FOUND', message: 'Role not found' })), {
      error: 'Could not send invitation',
      inline,
      onNotFound,
      notFoundCodes: ['USER_NOT_FOUND']
    })
    expect(onNotFound).not.toHaveBeenCalled()
    expect(inline.value).toMatchObject({ kind: 'not_found', title: 'Could not send invitation' })
    expect(toastAdd).not.toHaveBeenCalled()

    await run(() => Promise.reject(httpError(404, { error: 'USER_NOT_FOUND', message: 'User not found' })), {
      error: 'Could not update user',
      inline,
      onNotFound,
      notFoundCodes: ['USER_NOT_FOUND']
    })
    expect(onNotFound).toHaveBeenCalledOnce()
  })

  it('stays silent for an ended session', async () => {
    const { run } = useApiAction()
    const inline = ref<ActionError | null>(null)
    const outcome = await run(() => Promise.reject(new ApiError({ kind: 'session_ended', status: 401, statusText: '', data: null, message: 'Your session has ended.' })), { error: 'Could not save', inline })
    expect(outcome.ok).toBe(false)
    expect(inline.value).toBeNull()
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('lets the caller explain errors itself (null content or an inline predicate)', async () => {
    const { run } = useApiAction()
    const wrongApp = httpError(403, { error: 'HTTP_ERROR', message: 'Wrong application', details: { code: 'wrong_application' } })
    await run(() => Promise.reject(wrongApp), { error: () => null })
    await run(() => Promise.reject(wrongApp), { error: 'Sign in failed', inline: e => e.code === 'wrong_application' })
    expect(toastAdd).not.toHaveBeenCalled()
    await run(() => Promise.reject(httpError(401, { error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' })), { error: 'Sign in failed', inline: e => e.code === 'wrong_application' })
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: 'Sign in failed', description: 'Invalid email or password.' }))
  })

  it('adds the status to server-error titles and a retry hint to write timeouts', async () => {
    const { run } = useApiAction()
    await run(() => Promise.reject(httpError(500, { error: 'INTERNAL_SERVER_ERROR', message: 'Internal server error', details: {} })), { error: 'Could not create role' })
    expect(toastAdd).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Could not create role (HTTP 500)' }))
    await run(() => Promise.reject(new ApiError({ kind: 'timeout', status: 0, statusText: '', data: null, message: 'No answer within 15 seconds.' })), { error: 'Could not create role' })
    expect(toastAdd).toHaveBeenLastCalledWith(expect.objectContaining({ description: 'No answer within 15 seconds. The change may still have been saved; refresh before trying again.' }))
  })

  it('logs failures that are not API errors', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { run } = useApiAction()
    await run(() => Promise.reject(new TypeError('undefined is not a function')), { error: 'Could not save' })
    expect(consoleError).toHaveBeenCalled()
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: 'Could not save', description: expect.stringMatching(/Something went wrong/) }))
  })

  it('keeps a caller-supplied description', async () => {
    const { run } = useApiAction()
    await run(() => Promise.reject(httpError(409, { detail: 'Duplicate' })), { error: { title: 'Could not add member', description: 'They are already a member.' } })
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ description: 'They are already a member.' }))
  })
})

describe('view helpers', () => {
  it('matches contributing roles on exact permission names', () => {
    expect(contributingRoleNames([{ name: 'a', permissions: ['x:read'] }, { display_name: 'B', permissions: ['x:delete'] }], ['x:delete'])).toEqual(['B'])
    expect(contributingRoleNames(null, ['x:delete'])).toEqual([])
  })

  it('describes a single unmatched issue in the description instead of a list', () => {
    const view = describeActionError(normalizeApiError(httpError(422, { detail: [{ loc: ['body', 'name'], msg: 'Too short' }] })), 'Could not create role')
    expect(view.description).toBe('Name: Too short.')
    expect(view.issues).toEqual([])
  })
})
