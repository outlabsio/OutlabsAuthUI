import { useQuery } from '@pinia/colada'
import { auditEventsQuery } from '~/queries/audit'
import { entitiesListQuery, entityOrganisationQuery } from '~/queries/entities'
import { permissionsListQuery } from '~/queries/permissions'
import { rolesListQuery } from '~/queries/roles'
import { usersListQuery, usersOrphanedQuery } from '~/queries/users'
import { emptyAuditFilters } from '~/types/audit'
import { APP_SECTIONS, appSection, type AppSectionId } from '~/utils/capabilities'
import { dashboardTileLabel, type DashboardTileStatus } from '~/utils/dashboard'
import { shellOrder } from '~/utils/navigation'

// The landing page (F-089). Admins get live counts linking to the filtered lists they summarise
// (each read is one `limit=1` request, gated on the same section requirement as its list, so a
// tile exists only where its page opens), the wrong passwords of the last day and the latest
// audit events. Everyone else gets their own access at a glance and a launcher to the pages they
// can open. Backend capability details live in Settings.

export type DashboardTile = {
  key: string
  label: string
  description: string
  icon: string
  to: string
  value: number | null
  status: DashboardTileStatus
  // The tile is one link; its stock accessible name is the title alone, so the count (the point
  // of the tile) is named too (dashboardTileLabel).
  ariaLabel: string
}

const RECENT_LIMIT = 6

// One sentence per section for the launcher.
const SECTION_DESCRIPTIONS: Record<AppSectionId, string> = {
  'dashboard': 'Overview of this console.',
  'users': 'Accounts, their access and their history.',
  'roles': 'Bundles of permissions you assign.',
  'permissions': 'The actions roles can grant.',
  'api-keys': 'Keys that let your scripts act as you.',
  'service-accounts': 'Machine identities and their keys.',
  'entities': 'Organizations and the units inside them.',
  'audit': 'Who did what, and when.',
  'settings': 'Server capabilities and entity types.',
  'account': 'Your profile, password, sessions and access.'
}

export function useDashboard() {
  const { canAccess, can, isEnterprise, hasMemberships, configState, refetchConfig, displayName, capabilities } = useAuth()
  const { anchoredRootId } = useEntityScope()

  const usersOn = computed(() => canAccess('users'))
  const count = (data: { total?: number } | undefined) => (data ? data.total ?? null : null)

  const activeUsers = useQuery(() => ({ ...usersListQuery({ page: 1, limit: 1, status: 'active' }), enabled: usersOn.value }))
  const invitedOn = computed(() => usersOn.value && can('invitations'))
  const invitedUsers = useQuery(() => ({ ...usersListQuery({ page: 1, limit: 1, status: 'invited' }), enabled: invitedOn.value }))
  const suspendedOn = computed(() => usersOn.value && can('user_status'))
  const suspendedUsers = useQuery(() => ({ ...usersListQuery({ page: 1, limit: 1, status: 'suspended' }), enabled: suspendedOn.value }))
  // The orphaned list answers every admin who reads users with the orphans in their reach: a
  // delegated admin's are those rooted in their organization (F-161).
  const orphanedOn = computed(() => usersOn.value && isEnterprise.value && hasMemberships.value)
  const orphanedUsers = useQuery(() => ({ ...usersOrphanedQuery({ page: 1, limit: 1 }), enabled: orphanedOn.value }))

  const rolesOn = computed(() => canAccess('roles'))
  const roles = useQuery(() => ({ ...rolesListQuery({ page: 1, limit: 1 }), enabled: rolesOn.value }))
  const permissionsOn = computed(() => canAccess('permissions'))
  const permissions = useQuery(() => ({ ...permissionsListQuery({ page: 1, limit: 1 }), enabled: permissionsOn.value }))

  // A delegated admin's organisation (its entities), else every organisation (roots).
  const entitiesOn = computed(() => canAccess('entities'))
  const organisations = useQuery(() => ({ ...entitiesListQuery({ page: 1, limit: 1, rootOnly: true }), enabled: entitiesOn.value && !anchoredRootId.value }))
  const organisation = useQuery(() => ({ ...entityOrganisationQuery(anchoredRootId.value ?? ''), enabled: entitiesOn.value && Boolean(anchoredRootId.value) }))

  const auditOn = computed(() => canAccess('audit'))
  const failedSignIns = useQuery(() => ({
    ...auditEventsQuery({ page: 1, limit: 1, filters: { ...emptyAuditFilters, eventType: 'user.login_failed', range: '24h' } }),
    enabled: auditOn.value
  }))
  const recent = useQuery(() => ({ ...auditEventsQuery({ page: 1, limit: RECENT_LIMIT, filters: emptyAuditFilters }), enabled: auditOn.value }))

  const tileStatus = (q: { status: { value: string } }) => q.status.value as DashboardTile['status']

  const tiles = computed<DashboardTile[]>(() => {
    const out: Omit<DashboardTile, 'ariaLabel'>[] = []
    const users = appSection('users').to
    if (usersOn.value) out.push({ key: 'active-users', label: 'Active users', description: 'Accounts that can sign in.', icon: 'i-lucide-users', to: users, value: count(activeUsers.data.value), status: tileStatus(activeUsers) })
    if (invitedOn.value) out.push({ key: 'invited-users', label: 'Pending invitations', description: 'Invited, not yet accepted.', icon: 'i-lucide-mail', to: `${users}?status=invited`, value: count(invitedUsers.data.value), status: tileStatus(invitedUsers) })
    if (suspendedOn.value) out.push({ key: 'suspended-users', label: 'Suspended users', description: 'Cannot sign in until reactivated.', icon: 'i-lucide-user-x', to: `${users}?status=suspended`, value: count(suspendedUsers.data.value), status: tileStatus(suspendedUsers) })
    if (orphanedOn.value) out.push({ key: 'orphaned-users', label: 'Users without a membership', description: 'Lost every entity membership.', icon: 'i-lucide-user-minus', to: `${users}?orphaned=true`, value: count(orphanedUsers.data.value), status: tileStatus(orphanedUsers) })
    if (rolesOn.value) out.push({ key: 'roles', label: 'Roles', description: 'Defined roles you can see.', icon: 'i-lucide-shield', to: appSection('roles').to, value: count(roles.data.value), status: tileStatus(roles) })
    if (permissionsOn.value) out.push({ key: 'permissions', label: 'Permissions', description: 'Actions roles can grant.', icon: 'i-lucide-key-round', to: appSection('permissions').to, value: count(permissions.data.value), status: tileStatus(permissions) })
    if (entitiesOn.value) {
      out.push(anchoredRootId.value
        ? {
            key: 'entities',
            label: 'Entities',
            description: 'In your organization, the organization included.',
            icon: 'i-lucide-building-2',
            to: appSection('entities').to,
            value: organisation.data.value ? organisation.data.value.filter(entity => entity.status !== 'archived').length : null,
            status: tileStatus(organisation)
          }
        : { key: 'organizations', label: 'Organizations', description: 'Top-level entities.', icon: 'i-lucide-building-2', to: appSection('entities').to, value: count(organisations.data.value), status: tileStatus(organisations) })
    }
    // outlabs-auth audits a failed sign-in (user.login_failed) only for a wrong password on an
    // existing, unlocked account: unknown emails, locked accounts and wrong one-time codes are not
    // recorded, so the tile says what it counts (the rest is a backend gap, PRODUCTION.md section 8).
    if (auditOn.value) out.push({ key: 'failed-sign-ins', label: 'Wrong passwords', description: 'On existing accounts, last 24 hours.', icon: 'i-lucide-shield-alert', to: `${appSection('audit').to}?eventType=user.login_failed&range=24h`, value: count(failedSignIns.data.value), status: tileStatus(failedSignIns) })
    return out.map(tile => ({ ...tile, ariaLabel: dashboardTileLabel(tile.label, tile.status, tile.value) }))
  })

  // Admins see counts; everyone else their own access and a launcher.
  const isAdminView = computed(() => tiles.value.length > 0)

  // In shell order, like the sidebar, the user menu and the command palette.
  const launcher = computed(() => shellOrder(APP_SECTIONS.filter(section => canAccess(section.id)))
    .filter(section => section.id !== 'dashboard')
    .map(section => ({ id: section.id, label: section.label, icon: section.icon, to: section.to, description: SECTION_DESCRIPTIONS[section.id] })))

  const recentEvents = computed(() => recent.data.value?.items ?? [])

  const contractNotice = useApiContractNotice()
  const serverLine = computed(() => {
    const c = capabilities.value
    if (!c) return null
    return c.library_version ? `${c.preset} · outlabs-auth ${c.library_version}` : c.preset
  })

  return {
    displayName,
    configState,
    refetchConfig,
    isAdminView,
    tiles,
    launcher,
    auditOn,
    recentEvents,
    recentStatus: recent.status,
    recentError: recent.error,
    refetchRecent: recent.refetch,
    auditPath: appSection('audit').to,
    canOpenSettings: computed(() => canAccess('settings')),
    serverLine,
    contractNotice
  }
}
