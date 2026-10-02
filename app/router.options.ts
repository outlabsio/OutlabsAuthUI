import type { RouterConfig } from 'nuxt/schema'
import { START_LOCATION, type RouteLocationNormalized, type RouterScrollBehavior } from 'vue-router'
import { restorePanels } from '~/navigation/panel-memory'
import { planScroll } from '~/utils/navigation'

type ScrollResult = ReturnType<RouterScrollBehavior>

// Scroll behaviour (F-217). This replaces Nuxt's default scrollBehavior; planScroll
// (utils/navigation.ts) decides, this file applies.
// - Console pages live in the fixed dashboard layout and scroll their panel bodies, never the
//   window. A push opens the new page at the top of its panels (fresh components). A
//   Back/Forward traversal (vue-router passes a savedPosition) restores the remembered panel
//   scroll and focus once the page has rendered (app/navigation/panel-memory.ts). A #hash is
//   scrolled into view inside its panel.
// - Guest pages scroll the window, as Nuxt's default does: the saved position on Back/Forward,
//   else the #hash anchor, else the top, applied after the new page has rendered; a same-page
//   hash change scrolls at once; definePageMeta({ scrollToTop: false }) keeps the position.

// The anchor's element, or null for a hash that is not a valid selector or not on the page.
function anchorElement(hash: string): HTMLElement | null {
  try {
    return document.querySelector<HTMLElement>(hash)
  } catch {
    return null
  }
}

// Nuxt's default: honour the anchor's scroll-margin-top and the document's scroll-padding-top.
function anchorOffsetTop(hash: string): number {
  const element = anchorElement(hash)
  if (!element) return 0
  return (Number.parseFloat(getComputedStyle(element).scrollMarginTop) || 0)
    + (Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0)
}

function scrollToTopMeta(to: RouteLocationNormalized, from: RouteLocationNormalized): boolean | undefined {
  const option = to.meta.scrollToTop
  return typeof option === 'function' ? option(to, from) : option
}

export default <RouterConfig>{
  scrollBehavior(to, from, savedPosition): ScrollResult {
    const nuxtApp = useNuxtApp()
    const router = useRouter()
    const initial = from === START_LOCATION
    const plan = planScroll(to, initial ? null : from, savedPosition != null, scrollToTopMeta(to, from))

    // Run once the new page has rendered, if the router is still on it.
    const afterRender = (apply: () => void) => {
      nuxtApp.hooks.hookOnce('page:loading:end', () => {
        requestAnimationFrame(() => {
          if (router.currentRoute.value.fullPath === to.fullPath) apply()
        })
      })
    }

    switch (plan.kind) {
      case 'keep':
        return false
      case 'restore-panels':
        // Same page component (a query change such as ?entity=): nothing re-suspends, restore now.
        if (plan.afterRender) afterRender(() => restorePanels(to.fullPath))
        else restorePanels(to.fullPath)
        return false
      case 'reveal-anchor': {
        // The nearest scrolling ancestor is the anchor's panel; the window stays put.
        const reveal = () => anchorElement(to.hash)?.scrollIntoView({ block: 'start' })
        if (plan.afterRender) afterRender(reveal)
        else reveal()
        return false
      }
      case 'window': {
        const behavior = (router.options as { scrollBehaviorType?: ScrollBehavior }).scrollBehaviorType ?? 'auto'
        const position = () => plan.position === 'saved' && savedPosition
          ? savedPosition
          // Only a hash naming an element on the page is an anchor. Anything else (the OAuth
          // callback's #access_token=… fragment) would make vue-router warn with the raw hash,
          // tokens included, so it scrolls to the top instead.
          : plan.position === 'anchor' && anchorElement(to.hash)
            ? { el: to.hash, top: anchorOffsetTop(to.hash), behavior }
            : { left: 0, top: 0 }
        if (!plan.afterRender) return position()
        return new Promise((resolve) => {
          nuxtApp.hooks.hookOnce('page:loading:end', () => {
            requestAnimationFrame(() => resolve(router.currentRoute.value.fullPath === to.fullPath ? position() : false))
          })
        })
      }
    }
  }
}
