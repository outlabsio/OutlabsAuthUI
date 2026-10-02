import type { AuthConfig } from '~/types/auth'
import type { RuntimeConfigError } from '~/utils/runtime-config'
import type { PermissionMatcher } from '~/utils/permissions'

// Capability model — one pure place that answers "does this backend expose X" and "may this
// actor open section Y". The layout nav, the route middleware and AppPermissionGate all read
// the same APP_SECTIONS table through meetsAccessRequirement(), so nav visibility equals page
// visibility for every persona and preset. Feature flags alone are not enough: the backend
// reports several of them as constant true (api_keys, system_api_keys, activity_tracking), so
// the real signal is `mounted_surfaces` — the routers the host actually included.
// Keep this file free of Vue/Nuxt runtime imports: it is unit-tested in isolation.

// Stable router surface names reported in /auth/config `mounted_surfaces`.
export type AuthSurface
  = | 'auth'
    | 'capabilities'
    | 'users'
    | 'self_service_users'
    | 'session'
    | 'roles'
    | 'permissions'
    | 'entities'
    | 'memberships'
    | 'api_keys'
    | 'api_key_admin'
    | 'integration_principals'
    | 'audit'
    | 'config'
    | 'oauth'
    | 'oauth_associate'

export type AuthFeature = keyof AuthConfig['features']

type CapabilitySource = Pick<AuthConfig, 'features' | 'mounted_surfaces'> & Partial<AuthConfig>

// A mounted router surface. No config at all (not loaded / failed) = false: callers fail closed.
// A config WITHOUT `mounted_surfaces` comes from an older library that predates the field —
// treat every surface as mounted there and let the feature flags decide.
export function configHasSurface(config: CapabilitySource | null | undefined, surface: AuthSurface): boolean {
  if (!config) return false
  if (!Array.isArray(config.mounted_surfaces)) return true
  return config.mounted_surfaces.includes(surface)
}

export function configHasFeature(config: CapabilitySource | null | undefined, feature: AuthFeature): boolean {
  return Boolean(config?.features?.[feature])
}

// EnterpriseRBAC concepts (entities, memberships, tree/entity scopes, root orgs) exist only when
// the hierarchy is enabled AND the entities router is mounted. SimpleRBAC is flat: global roles,
// direct role assignment, no memberships. Every entity/tree control in the console hangs off this.
export function configIsEnterprise(config: CapabilitySource | null | undefined): boolean {
  return configHasFeature(config, 'entity_hierarchy') && configHasSurface(config, 'entities')
}

// Memberships are their own router: an Enterprise host may mount entities without it.
export function configHasMemberships(config: CapabilitySource | null | undefined): boolean {
  return configIsEnterprise(config) && configHasSurface(config, 'memberships')
}

// ── Access requirements ──

export type AccessRequirement = {
  // Every listed router surface must be mounted.
  surfaces?: readonly AuthSurface[]
  // Every listed feature flag must be on.
  features?: readonly AuthFeature[]
  // Any-of, evaluated with the backend permission algebra (superusers always pass).
  permission?: string | readonly string[]
  // Superuser-only (no permission grants it).
  superuser?: boolean
  // Any read of an admin section this backend offers (consoleAdminPermissions). It replaces
  // `permission` once resolved against the config (resolveRequirement), so a denial never names
  // a permission for a concept the backend lacks (entity:read on SimpleRBAC).
  consoleAdmin?: boolean
}

export type AccessContext = {
  config: CapabilitySource | null | undefined
  isSuperuser: boolean
  matcher: PermissionMatcher
}

export function requirementPermissions(requirement: AccessRequirement): string[] {
  const p = requirement.permission
  if (p == null) return []
  return typeof p === 'string' ? [p] : [...p]
}

/**
 * The requirement as it applies to this backend: `consoleAdmin` becomes the read permissions of
 * the admin sections the backend offers, or superuser-only when it offers none. Without a config
 * every admin section counts. Every check and every denial message reads the resolved form, so
 * the nav, the route and the gate's copy agree.
 */
export function resolveRequirement(requirement: AccessRequirement, config: CapabilitySource | null | undefined): AccessRequirement {
  if (!requirement.consoleAdmin) return requirement
  const permissions = consoleAdminPermissions(config)
  const rest = { ...requirement, consoleAdmin: false }
  return permissions.length ? { ...rest, permission: permissions } : { ...rest, permission: undefined, superuser: true }
}

// True when the requirement depends on /auth/config at all (surface or feature).
export function requiresCapabilities(requirement: AccessRequirement): boolean {
  return Boolean(requirement.surfaces?.length || requirement.features?.length)
}

// Surface AND feature half — what the backend exposes, independent of the actor.
export function capabilityAvailable(requirement: AccessRequirement, config: CapabilitySource | null | undefined): boolean {
  if (!requiresCapabilities(requirement)) return true
  if (!config) return false
  return (requirement.surfaces ?? []).every(s => configHasSurface(config, s))
    && (requirement.features ?? []).every(f => configHasFeature(config, f))
}

// Permission half — what THIS actor may do.
export function permissionGranted(requirement: AccessRequirement, context: Pick<AccessContext, 'isSuperuser' | 'matcher'>): boolean {
  if (requirement.superuser) return context.isSuperuser
  const permissions = requirementPermissions(requirement)
  if (!permissions.length) return true
  return context.isSuperuser || context.matcher.allowsAny(permissions)
}

// The one predicate: surface AND feature AND permission.
export function meetsAccessRequirement(requirement: AccessRequirement, context: AccessContext): boolean {
  const resolved = resolveRequirement(requirement, context.config)
  return capabilityAvailable(resolved, context.config) && permissionGranted(resolved, context)
}

// ── App sections (nav items == gated routes) ──

export type AppSectionId
  = | 'dashboard'
    | 'users'
    | 'roles'
    | 'permissions'
    | 'api-keys'
    | 'service-accounts'
    | 'entities'
    | 'audit'
    | 'settings'
    | 'account'

// Where a section is offered in the shell. Sidebar groups render in APP_NAV_GROUPS order, each
// under its label; 'user' sections are the signed-in actor's own pages, offered from the user
// menu in the sidebar footer instead of the sidebar list.
export type AppNavGroupId = 'overview' | 'directory' | 'access-control' | 'integrations' | 'monitoring' | 'system' | 'user'

export type AppNavGroup = {
  id: AppNavGroupId
  // Group heading in the expanded sidebar (hidden when collapsed, where separators remain).
  label?: string
  // 'sidebar' = the main list, 'sidebar-bottom' = pinned to the bottom of the sidebar,
  // 'user-menu' = the footer user menu (and the command palette).
  placement: 'sidebar' | 'sidebar-bottom' | 'user-menu'
}

export const APP_NAV_GROUPS: readonly AppNavGroup[] = [
  { id: 'overview', placement: 'sidebar' },
  { id: 'directory', label: 'Directory', placement: 'sidebar' },
  { id: 'access-control', label: 'Access control', placement: 'sidebar' },
  { id: 'integrations', label: 'Integrations', placement: 'sidebar' },
  { id: 'monitoring', label: 'Monitoring', placement: 'sidebar' },
  { id: 'system', placement: 'sidebar-bottom' },
  { id: 'user', placement: 'user-menu' }
]

export type AppSection = {
  id: AppSectionId
  // The section's one name: menu entry (sidebar, user menu, palette), page and document title,
  // back-link label and default gate subject.
  label: string
  icon: string
  to: string
  // Which shell group offers it (APP_NAV_GROUPS). Within a group, APP_SECTIONS order applies.
  nav: AppNavGroupId
  requires: AccessRequirement
  // Former routes of the section: the route guard redirects them (and anything beneath them) to
  // `to`, keeping the query and hash, so old bookmarks and links keep working.
  legacyPaths?: readonly string[]
}

// What makes an account a console admin: read access to any of these sections (their base read
// names, so the `_tree` / `_all` grants of delegated admins count). Gates admin-only pages such
// as Settings through `consoleAdmin`.
const CONSOLE_ADMIN_SECTIONS: readonly AppSectionId[] = ['users', 'roles', 'permissions', 'entities', 'service-accounts']

/**
 * The read permissions of the admin sections this backend offers (surface and feature present):
 * on SimpleRBAC no entity:read. Without a config (not loaded yet) every admin section counts.
 */
export function consoleAdminPermissions(config: CapabilitySource | null | undefined): string[] {
  const offered = CONSOLE_ADMIN_SECTIONS.map(appSection)
    .filter(section => !config || capabilityAvailable(section.requires, config))
  return [...new Set(offered.flatMap(section => requirementPermissions(section.requires)))]
}

// Within each nav group, array order = menu order. Changing a section's requirement here changes
// the nav item, the route guard, the page gate and the command palette entry together.
export const APP_SECTIONS: readonly AppSection[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/app/dashboard', nav: 'overview', requires: {} },
  { id: 'users', label: 'Users', icon: 'i-lucide-users', to: '/app/users', nav: 'directory', requires: { surfaces: ['users'], permission: 'user:read' } },
  { id: 'roles', label: 'Roles', icon: 'i-lucide-shield', to: '/app/roles', nav: 'access-control', requires: { surfaces: ['roles'], permission: 'role:read' } },
  { id: 'permissions', label: 'Permissions', icon: 'i-lucide-key-round', to: '/app/permissions', nav: 'access-control', requires: { surfaces: ['permissions'], permission: 'permission:read' } },
  // Personal keys: any signed-in actor manages their own keys when the router is mounted.
  // Self-service, so it lives in the user menu, away from the service-account keys.
  { id: 'api-keys', label: 'My API keys', icon: 'i-lucide-key', to: '/app/api-keys', nav: 'user', requires: { surfaces: ['api_keys'], features: ['api_keys'] } },
  // Service accounts (outlabs-auth integration principals) and their keys. api_key:read also
  // matches the tree-scoped grant a delegated admin holds (entity-anchored accounts).
  { id: 'service-accounts', label: 'Service accounts', icon: 'i-lucide-server-cog', to: '/app/service-accounts', nav: 'integrations', requires: { surfaces: ['integration_principals'], features: ['system_api_keys'], permission: 'api_key:read' }, legacyPaths: ['/app/users/api-keys'] },
  { id: 'entities', label: 'Entities', icon: 'i-lucide-building-2', to: '/app/entities', nav: 'directory', requires: { surfaces: ['entities'], features: ['entity_hierarchy'], permission: 'entity:read' } },
  // The audit search endpoint requires user:read (backend routers/audit.py).
  { id: 'audit', label: 'Audit', icon: 'i-lucide-scroll-text', to: '/app/audit', nav: 'monitoring', requires: { surfaces: ['audit'], features: ['activity_tracking'], permission: 'user:read' } },
  // Server capabilities and the entity-type taxonomy are for admins (F-186): any account that
  // can read one of the admin sections. Editing entity types additionally needs a superuser.
  { id: 'settings', label: 'Settings', icon: 'i-lucide-settings', to: '/app/settings', nav: 'system', requires: { consoleAdmin: true } },
  { id: 'account', label: 'Account', icon: 'i-lucide-circle-user', to: '/app/account', nav: 'user', requires: {} }
]

export function appSection(id: AppSectionId): AppSection {
  const section = APP_SECTIONS.find(s => s.id === id)
  if (!section) throw new Error(`Unknown app section: ${id}`)
  return section
}

// The section that owns a route path — longest matching prefix, so /app/users/<id> resolves to
// Users and /app/service-accounts/<id> to Service accounts.
export function findAppSection(path: string): AppSection | undefined {
  let match: AppSection | undefined
  for (const section of APP_SECTIONS) {
    if (path === section.to || path.startsWith(`${section.to}/`)) {
      if (!match || section.to.length > match.to.length) match = section
    }
  }
  return match
}

// Where a former route of a section lives now (APP_SECTIONS legacyPaths): the section's route,
// with the rest of the old path appended; null for every current route.
export function legacyRedirect(path: string): string | null {
  for (const section of APP_SECTIONS) {
    for (const legacy of section.legacyPaths ?? []) {
      if (path === legacy || path === `${legacy}/`) return section.to
      if (path.startsWith(`${legacy}/`)) return `${section.to}${path.slice(legacy.length)}`
    }
  }
  return null
}

// ── API contract ──

// The first-party API contract this console speaks. A backend reporting another major is
// refused (ConfigErrorScreen) rather than rendered with silently broken calls. Only a major that
// parses AND differs blocks: a version string in a shape this console can't read (format drift,
// pre-release suffixes, another naming) is 'unknown', like an absent one, so a reporting change
// never locks operators out of every page — Settings warns instead.
export const SUPPORTED_API_CONTRACT = 'outlabs-auth.api/v1'
// Lenient on the tail: 'outlabs-auth.api/v1', '/v1.2', '/v1-rc1' and '/1' all read as major 1.
const CONTRACT_PATTERN = /^outlabs-auth\.api\/v?(\d+)(?!\d)/i

export type ApiContractCheck
  = | { status: 'supported', version: string }
    // version is set when the server reported a string this console can't parse.
    | { status: 'unknown', version?: string }
    | { status: 'unsupported', version: string }

export function checkApiContract(config: Pick<AuthConfig, 'api_contract_version'> | null | undefined): ApiContractCheck {
  const version = config?.api_contract_version?.trim()
  if (!version) return { status: 'unknown' }
  const major = CONTRACT_PATTERN.exec(version)?.[1]
  if (major == null) return { status: 'unknown', version }
  const supportedMajor = CONTRACT_PATTERN.exec(SUPPORTED_API_CONTRACT)?.[1]
  return Number(major) === Number(supportedMajor) ? { status: 'supported', version } : { status: 'unsupported', version }
}

// Blocking error for app.vue's ConfigErrorScreen, or null when the contract is usable.
export function apiContractError(config: Pick<AuthConfig, 'api_contract_version' | 'library_version' | 'preset'> | null | undefined): RuntimeConfigError | null {
  const check = checkApiContract(config)
  if (check.status !== 'unsupported') return null
  return {
    message: 'The auth server speaks an API version this console does not support. Point the console at a compatible '
      + 'outlabsAuth backend or deploy a console release that supports this version.',
    issues: [
      `Server API contract: ${check.version}`,
      `Supported by this console: ${SUPPORTED_API_CONTRACT}`,
      ...(config?.library_version ? [`Server library version: ${config.library_version}`] : [])
    ]
  }
}
