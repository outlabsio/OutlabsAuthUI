import { computed, defineAsyncComponent, getCurrentScope, onScopeDispose, readonly, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'
import type { Router } from 'vue-router'

// Keeps a dialog from losing work or being closed mid-request. One guard per open dialog:
//
//   - pending: while the dialog's request runs it cannot be closed at all (ESC, overlay click,
//     X, Cancel and browser Back do nothing), so an action is never "cancelled" while it still
//     completes on the server;
//   - dirty: ESC, overlay click, X, Cancel and browser Back ask "Discard changes?" first
//     (a stacked AppConfirmDialog opened through useOverlay);
//   - hold: like dirty for a dialog that holds something that cannot be shown again (a one-time
//     secret), with its own prompt copy;
//   - browser Back (or Forward) with a dialog open closes the top-most dialog instead of leaving
//     the page; a dirty/held dialog asks first. Other navigations (links, redirects, the session
//     layer's sign-out) are never blocked;
//   - reload and tab close are warned by the browser while any open dialog is dirty, held or
//     pending, except for a reload the session layer makes into another identity
//     (releaseUnloadWarnings).
//
// AppFormDialog and AppConfirmDialog use it already. A hand-built UModal wires it like this:
//
//   const { dismissible, requestClose, onUpdateOpen } = useDialogGuard({ open, dirty, pending })
//   <UModal :open="open" :dismissible="dismissible" :close="{ disabled: pending }"
//           @update:open="onUpdateOpen" @close:prevent="requestClose">
//   … Cancel: <UButton :disabled="pending" @click="requestClose" />

export type DiscardPrompt = {
  title?: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
}

export type DialogGuardOptions = {
  /** The dialog's open state (its v-model). The guard closes it by setting it to false. */
  open: Ref<boolean>
  /** Unsaved input: closing asks first. */
  dirty?: MaybeRefOrGetter<boolean>
  /** A request is running: the dialog cannot be closed. */
  pending?: MaybeRefOrGetter<boolean>
  /** Something that cannot be shown again (a one-time secret): closing through ESC, X or Back asks first. */
  hold?: MaybeRefOrGetter<boolean>
  /** Copy for the discard prompt. */
  discard?: MaybeRefOrGetter<DiscardPrompt | undefined>
}

export const DISCARD_CHANGES: Required<DiscardPrompt> = {
  title: 'Discard changes?',
  description: 'The changes you made in this dialog will be lost.',
  confirmLabel: 'Discard changes',
  cancelLabel: 'Keep editing'
}

type GuardEntry = {
  // Close (asking first when needed); resolves true when the dialog closed.
  requestClose: () => Promise<boolean>
  // A request is running: nothing may close the dialog.
  locked: () => boolean
  // Leaving the page would lose something (dirty, held or pending).
  protects: () => boolean
}

// Open guarded dialogs, bottom to top. Browser Back acts on the top one only.
const openDialogs: GuardEntry[] = []
const installedRouters = new WeakSet<Router>()
let traversing = false
// Set when the console replaces the page on purpose (releaseUnloadWarnings).
let unloadReleased = false

/**
 * Stops the reload/tab-close warning for the rest of this page's life, for a reload the console
 * makes on purpose that the user must not cancel: the session layer reloading into another
 * identity, so no dialog of the previous account stays open on the new account's session. The
 * dialogs themselves are left alone; the page is about to go.
 */
export function releaseUnloadWarnings() {
  unloadReleased = true
}

function removeEntry(entry: GuardEntry) {
  const index = openDialogs.indexOf(entry)
  if (index > -1) openDialogs.splice(index, 1)
}

// History traversals are recognised from the router's history listener, which runs
// synchronously on popstate before any navigation guard (those run in later microtasks).
function installOnce(router: Router) {
  if (installedRouters.has(router)) return
  installedRouters.add(router)
  router.options.history.listen((_to, _from, info) => {
    if (String(info.type) === 'pop') traversing = true
  })
  router.beforeEach(() => {
    const traversal = traversing
    traversing = false
    const top = openDialogs.at(-1)
    if (!traversal || !top) return
    // Back/Forward closes the top dialog (asking when it is dirty) and stays on the page; the
    // router restores the URL of the aborted traversal.
    if (!top.locked()) void top.requestClose()
    return false
  })
  router.afterEach(() => {
    traversing = false
  })
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', (event) => {
      if (unloadReleased || !openDialogs.some(entry => entry.protects())) return
      event.preventDefault()
      // Older browsers need a return value to show their "Leave site?" prompt.
      event.returnValue = ''
    })
  }
}

// Loaded on first use: the prompt is a stacked AppConfirmDialog rendered by UApp's overlay host.
const ConfirmDialog = defineAsyncComponent(() => import('~/components/app/ConfirmDialog.vue'))

export function useDialogGuard(options: DialogGuardOptions) {
  const { open } = options
  const overlay = useOverlay()
  installOnce(useRouter())

  const dirty = computed(() => Boolean(toValue(options.dirty)))
  const pending = computed(() => Boolean(toValue(options.pending)))
  const hold = computed(() => Boolean(toValue(options.hold)))
  const asking = ref(false)

  async function confirmDiscard(): Promise<boolean> {
    const copy = { ...DISCARD_CHANGES, ...toValue(options.discard) }
    const prompt = overlay.create(ConfirmDialog, { destroyOnClose: true })
    const answer = await prompt.open({
      title: copy.title,
      description: copy.description,
      confirmLabel: copy.confirmLabel,
      cancelLabel: copy.cancelLabel,
      closeOnConfirm: true
    })
    return answer === true
  }

  /** Close the dialog: refused while pending; asks first when dirty or held. True when closed. */
  async function requestClose(): Promise<boolean> {
    if (!open.value) return true
    if (pending.value || asking.value) return false
    if (dirty.value || hold.value) {
      asking.value = true
      try {
        if (!(await confirmDiscard())) return false
      } finally {
        asking.value = false
      }
      // The request may have started, or the dialog closed, while the prompt was up.
      if (pending.value) return false
    }
    open.value = false
    return true
  }

  /** Bind to UModal @update:open: opening passes through, closing goes through requestClose. */
  function onUpdateOpen(value: boolean) {
    if (value) open.value = true
    else void requestClose()
  }

  const entry: GuardEntry = {
    requestClose,
    locked: () => pending.value || asking.value,
    protects: () => dirty.value || hold.value || pending.value
  }
  watch(open, (isOpen) => {
    removeEntry(entry)
    if (isOpen) openDialogs.push(entry)
  }, { immediate: true })
  if (getCurrentScope()) onScopeDispose(() => removeEntry(entry))

  return {
    /** Bind to UModal :dismissible — ESC and overlay clicks close only a clean, idle dialog. */
    dismissible: computed(() => !dirty.value && !pending.value && !hold.value),
    requestClose,
    onUpdateOpen,
    /** True while the discard prompt is open. */
    asking: readonly(asking)
  }
}
