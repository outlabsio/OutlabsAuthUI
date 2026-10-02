import type { NavigationMenuItem } from '@nuxt/ui'
import { APP_SECTIONS, type AppSection } from '~/utils/capabilities'
import { groupAppSections, navCurrentFor } from '~/utils/navigation'

const CONFIG_TOAST_ID = 'auth-config-unavailable'
const PERMISSIONS_TOAST_ID = 'permissions-unavailable'

// Feature logic for the app shell's navigation. Items come from APP_SECTIONS filtered by the one
// access predicate (surface AND feature AND permission) — the same requirement the route guard
// and each page's AppPermissionGate read — so a visible item always opens a usable page. The
// sidebar, the user menu and the command palette all read this one list.
export function useAppNavigation() {
  const { canAccess } = useAuth()
  const route = useRoute()

  // Every section this actor may open, in APP_SECTIONS order.
  const sections = computed<AppSection[]>(() => APP_SECTIONS.filter(section => canAccess(section.id)))
  const groupings = computed(() => groupAppSections(sections.value))

  function toItem(section: AppSection): NavigationMenuItem {
    // The owning section stays active on its detail routes (/app/users/<id>), not only on the
    // list route the link points at.
    const current = navCurrentFor(section, route.fullPath)
    return {
      'label': section.label,
      'icon': section.icon,
      'to': section.to,
      'active': current != null,
      'aria-current': current
    }
  }

  // Main sidebar list: one list per group, headed by the group label (hidden when the sidebar
  // is collapsed; the separators between lists remain).
  const sidebar = computed<NavigationMenuItem[][]>(() => groupings.value
    .filter(({ group }) => group.placement === 'sidebar')
    .map(({ group, sections }) => [
      ...(group.label ? [{ label: group.label, type: 'label' as const }] : []),
      ...sections.map(toItem)
    ]))

  // Pinned to the bottom of the sidebar (Settings).
  const sidebarBottom = computed<NavigationMenuItem[]>(() => groupings.value
    .filter(({ group }) => group.placement === 'sidebar-bottom')
    .flatMap(({ sections }) => sections.map(toItem)))

  // The actor's own pages (Account, My API keys), offered from the user menu.
  const userSections = computed<AppSection[]>(() => groupings.value
    .filter(({ group }) => group.placement === 'user-menu')
    .flatMap(({ sections }) => sections))

  return { sections, sidebar, sidebarBottom, userSections }
}

type RetryNotice = {
  id: string
  title: string
  description: string
  icon: string
  // True while the notice applies.
  failing: () => boolean
  retry: () => Promise<unknown>
}

// A persistent warning toast with Retry, shown while `failing()` holds. A toast is used because
// the dashboard group is a fixed full-viewport layout with no slot above the panels. Each notice
// gets a fresh id: useToast().remove() filters its id out on a 200ms timer, which would otherwise
// swallow a notice re-shown right after a failed retry.
function useRetryNotice(notice: RetryNotice) {
  const toast = useToast()

  let noticeId: string | null = null
  function show() {
    if (noticeId && toast.toasts.value.some(t => t.id === noticeId && t.open !== false)) return
    noticeId = `${notice.id}-${Date.now()}`
    toast.add({
      id: noticeId,
      title: notice.title,
      description: notice.description,
      icon: notice.icon,
      color: 'warning',
      duration: Number.POSITIVE_INFINITY,
      progress: false,
      close: false,
      actions: [{ label: 'Retry', icon: 'i-lucide-refresh-cw', color: 'neutral', variant: 'outline', onClick: () => void retry() }]
    })
  }
  function hide() {
    if (!noticeId) return
    toast.remove(noticeId)
    noticeId = null
  }
  // A toast action closes its toast, so a retry that fails again shows the notice again.
  async function retry() {
    await notice.retry()
    if (notice.failing()) show()
  }
  watch(notice.failing, (failing) => {
    if (failing) show()
    else hide()
  }, { immediate: true })
}

// /auth/config failed and nothing is cached: capability-gated sections are hidden (fail
// closed). Say so persistently, with a Retry, until the config loads. Call it once, from the app
// shell.
export function useCapabilitiesNotice() {
  const { configState, refetchConfig, isAuthenticated } = useAuth()
  useRetryNotice({
    id: CONFIG_TOAST_ID,
    title: 'Can\'t load the auth server\'s capabilities',
    description: 'Sections that depend on them stay hidden until they load.',
    icon: 'i-lucide-cloud-off',
    failing: () => configState.value === 'error' && isAuthenticated.value,
    retry: refetchConfig
  })
}

// The actor's permissions (/permissions/me) failed to load: sections that need a permission are
// hidden and their pages say so with Retry (AppPermissionGate). Say it once for the whole shell
// too, so the short nav does not read as lost access. Superusers need no permissions. Call it
// once, from the app shell.
export function usePermissionsNotice() {
  const { permissionsState, refetchPermissions, isAuthenticated, isSuperuser } = useAuth()
  useRetryNotice({
    id: PERMISSIONS_TOAST_ID,
    title: 'Can\'t load your permissions',
    description: 'Sections that need them stay hidden until they load.',
    icon: 'i-lucide-shield-question-mark',
    failing: () => permissionsState.value === 'error' && isAuthenticated.value && !isSuperuser.value,
    retry: refetchPermissions
  })
}
