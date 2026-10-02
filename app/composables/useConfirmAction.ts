import { computed, reactive, ref, shallowRef, toValue, type MaybeRefOrGetter } from 'vue'
import type { ActionError, ToastContent } from '~/composables/useApiAction'

// The state and flow behind one AppConfirmDialog: which record it is about, the copy for that
// record, the pending lock and the dialog's own error surface. `ask(record)` opens it;
// `confirm()` runs the action through useApiAction and closes the dialog on success. A failure
// stays in the dialog (AppApiErrorAlert); a record that no longer exists closes it with a toast.
//
//   // composable
//   const deleteUser = useConfirmAction<User>({
//     describe: user => ({
//       title: `Delete user ${user.email}`,
//       effects: ['Signs them out everywhere.', …],
//       confirmLabel: 'Delete user',
//       confirmText: user.email
//     }),
//     action: user => remove.mutateAsync(user.id),
//     success: 'User deleted',
//     error: 'Could not delete user'
//   })
//   rowMenu: { label: 'Delete', onSelect: () => deleteUser.ask(user) }
//
//   <!-- template -->
//   <AppConfirmDialog v-model:open="deleteUser.open" v-bind="deleteUser.dialog" @confirm="deleteUser.confirm" />

export type ConfirmCopy = {
  /** "<Verb> <target>", e.g. "Archive role Regional admin". */
  title: string
  description?: string
  /** Concrete effects in the backend's terms, one sentence each. */
  effects?: string[]
  effectsTitle?: string
  /** The button: "<Verb> <noun>", e.g. "Archive role". */
  confirmLabel: string
  confirmColor?: 'error' | 'warning' | 'primary' | 'neutral'
  /** Typed confirmation (email, name or slug) for the highest-impact actions. */
  confirmText?: string | null
}

export type ConfirmActionOptions<T, R> = {
  describe: (target: T) => ConfirmCopy
  action: (target: T) => Promise<R>
  success?: ToastContent | ((target: T, data: R) => ToastContent)
  error: string | ((target: T) => string)
  /** Codes that mean this record is gone (see useApiAction); default: any not-found answer. */
  notFoundCodes?: readonly string[]
  /** Runs after a successful action (the dialog is already closing), e.g. to reveal a new secret. */
  onSuccess?: (data: R, target: T) => void
  /** Refuse to open: e.g. the actor lost the permission. */
  enabled?: MaybeRefOrGetter<boolean>
}

export type ConfirmDialogBindings = ConfirmCopy & { pending: boolean, error: ActionError | null }

export type ConfirmAction<T> = {
  open: boolean
  readonly target: T | null
  readonly pending: boolean
  readonly error: ActionError | null
  /** Props for AppConfirmDialog (v-bind). */
  readonly dialog: ConfirmDialogBindings
  ask: (target: T) => void
  confirm: () => Promise<boolean>
}

export function useConfirmAction<T, R = unknown>(options: ConfirmActionOptions<T, R>): ConfirmAction<T> {
  const { run } = useApiAction()
  const toast = useToast()
  const open = ref(false)
  const target = shallowRef<T | null>(null)
  const pending = ref(false)
  const error = ref<ActionError | null>(null)

  const dialog = computed<ConfirmDialogBindings>(() => ({
    ...(target.value ? options.describe(target.value) : { title: '', confirmLabel: '' }),
    pending: pending.value,
    error: error.value
  }))

  function ask(record: T) {
    if (pending.value || toValue(options.enabled) === false) return
    target.value = record
    error.value = null
    open.value = true
  }

  async function confirm(): Promise<boolean> {
    const record = target.value
    if (!record || pending.value) return false
    pending.value = true
    const res = await run(() => options.action(record), {
      success: typeof options.success === 'function' ? undefined : options.success,
      error: typeof options.error === 'function' ? options.error(record) : options.error,
      inline: error,
      notFoundCodes: options.notFoundCodes,
      onNotFound: () => {
        open.value = false
      }
    })
    pending.value = false
    if (!res.ok) return false
    if (typeof options.success === 'function') {
      toast.add({ ...toastContent(options.success(record, res.data)), color: 'success', icon: 'i-lucide-check' })
    }
    open.value = false
    options.onSuccess?.(res.data, record)
    return true
  }

  return reactive({ open, target, pending, error, dialog, ask, confirm }) as ConfirmAction<T>
}

function toastContent(content: ToastContent) {
  return typeof content === 'string' ? { title: content } : content
}
