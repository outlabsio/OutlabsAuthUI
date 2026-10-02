import { watch, type Ref } from 'vue'

// Where keyboard focus goes when a dialog closes. reka's focus scope returns it to whatever was
// focused when the dialog opened. A row menu item that opens a dialog is gone by then (it unmounts
// with its menu), so focus fell back to <body> and a keyboard user lost their place in the table.
// A menu is labelled by the button that opened it, so a menu item resolves to that button, and
// closing the dialog focuses it. Anything else keeps reka's default.
function menuTriggerOf(active: Element | null): HTMLElement | null {
  if (!(active instanceof HTMLElement)) return null
  const menu = active.closest('[role="menu"]')
  const triggerId = menu?.getAttribute('aria-labelledby')
  return triggerId ? document.getElementById(triggerId) : null
}

/** Pass `onCloseAutoFocus` to UModal's `content` prop. */
export function useDialogReturnFocus(open: Ref<boolean>) {
  let target: HTMLElement | null = null
  // Synchronously, while the menu item that opened the dialog still holds focus.
  watch(open, (isOpen) => {
    if (isOpen && import.meta.client) target = menuTriggerOf(document.activeElement)
  }, { flush: 'sync' })

  function onCloseAutoFocus(event: Event) {
    const element = target
    target = null
    if (!element?.isConnected) return
    event.preventDefault()
    element.focus()
  }

  return { onCloseAutoFocus }
}
