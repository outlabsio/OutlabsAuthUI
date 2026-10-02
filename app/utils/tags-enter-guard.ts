// Enter in a tags field (UInputTags) adds the typed tag and never submits the form around it.
//
// AppFormDialog's footer button is the form's default button, so the browser submits the form
// implicitly when Enter is pressed in one of its text inputs. reka-ui's tags input cancels Enter
// only after awaiting a tick, and not at all when the field is empty, so without this guard an
// admin following "Press Enter after each tag" could save a half-finished form. Cancelling the
// key itself is not an option: reka checks `defaultPrevented` after its tick and would then skip
// adding the tag. So the guard never touches the key events. An Enter in a tags input arms it
// until the next task, and a submit while it is armed is cancelled before UForm sees it.
// Implicit submission runs synchronously in the default action of that key event (keypress in
// Chromium, Firefox and WebKit), so it always meets an armed guard; a click on the submit button
// is a later task and submits as usual.

/**
 * The text input of a Nuxt UI UInputTags. Other Nuxt UI inputs mark theirs `data-slot="base"`.
 * If an upgrade renames the slot, `e2e/app/dialog-kit.spec.ts` "Enter in a tags field" fails.
 */
export const TAGS_INPUT_SELECTOR = 'input[data-slot="input"]'

type KeyEventLike = Pick<KeyboardEvent, 'key' | 'target'>
type SubmitEventLike = Pick<Event, 'preventDefault' | 'stopPropagation'>

function isTagsInput(target: EventTarget | null): boolean {
  return !!target && typeof (target as Element).matches === 'function' && (target as Element).matches(TAGS_INPUT_SELECTOR)
}

/**
 * Bind `onKey` to capture-phase `keydown` and `keypress`, and `onSubmit` to capture-phase
 * `submit`, on an element that contains the form (so it runs before UForm's own handler).
 * `nextTask` schedules the disarm; tests pass a manual queue.
 */
export function createTagsEnterGuard(nextTask: (run: () => void) => void = run => setTimeout(run, 0)) {
  let armed = false
  return {
    onKey(event: KeyEventLike) {
      if (event.key !== 'Enter' || !isTagsInput(event.target)) return
      armed = true
      nextTask(() => {
        armed = false
      })
    },
    /** Returns whether the submit was cancelled. */
    onSubmit(event: SubmitEventLike): boolean {
      if (!armed) return false
      event.preventDefault()
      event.stopPropagation()
      return true
    }
  }
}
