import type { MaybeRefOrGetter } from 'vue'
import { useQuery } from '@pinia/colada'
import { entityPathQuery } from '~/queries/entities'
import { entityRolesQuery } from '~/queries/roles'
import type { Role, RoleType } from '~/types/role'

// The one role pool for every access-granting dialog: the roles the backend would actually
// accept for this target and this actor, so admins never fill a dialog only to be refused.
//
// Targets:
// - { kind: 'direct', rootEntityId }: direct user roles (Assign roles, Invite without an entity).
//   Active, never entity-local; on EnterpriseRBAC system-wide roles plus the user's own
//   organization's roles.
// - { kind: 'entity', entityId }: a membership at that entity (Add/Edit member, Add/Edit
//   membership, Invite with an entity). The backend's own list (GET /roles/entity/{id}) when the
//   actor holds role:read_tree; otherwise the same rules applied here to the role catalog and the
//   entity's path (utils/role-access.ts). No entity yet -> status 'idle' and an empty pool.
//
// Every role carries `type` (System-wide / Organization / Entity) and `missingPermissions`:
// the permissions a non-superuser actor lacks (delegation containment, SEC-2). Such a role is
// listed but must not be selectable. The backend stays the final gate: it evaluates delegation
// in the target entity's context and counts per-entity-type role permissions, neither of which
// the console can see, so a grant can still be refused (the dialog shows the API's reason).

export type AssignableRolesTarget
  = | { kind: 'direct', rootEntityId?: string | null }
    | { kind: 'entity', entityId?: string | null }

export type AssignableRole = Role & {
  type: RoleType
  // Non-empty = this actor cannot grant the role (they do not hold these permissions).
  missingPermissions: string[]
}

// idle: an entity target with no entity chosen. denied: the actor cannot list roles at all.
export type AssignableRolesStatus = 'idle' | 'denied' | 'pending' | 'error' | 'success'

export type UseAssignableRolesOptions = {
  // Fetch only while this is true (e.g. while the dialog is open). Defaults to true.
  enabled?: MaybeRefOrGetter<boolean>
  // Role ids to leave out of the pool (e.g. roles the user already holds directly).
  exclude?: MaybeRefOrGetter<Iterable<string> | null | undefined>
}

export function useAssignableRoles(target: MaybeRefOrGetter<AssignableRolesTarget>, options: UseAssignableRolesOptions = {}) {
  const { hasPermission, isSuperuser, isEnterprise, canAccess } = useAuth()
  const catalog = useRoleCatalog()

  const enabled = computed(() => toValue(options.enabled) ?? true)
  const resolvedTarget = computed(() => toValue(target))
  const entityId = computed(() => {
    const t = resolvedTarget.value
    return t.kind === 'entity' && isEnterprise.value ? (t.entityId || null) : null
  })
  const awaitingEntity = computed(() => resolvedTarget.value.kind === 'entity' && !entityId.value)

  // The backend's own answer for an entity: GET /roles/entity/{id} needs role:read_tree there.
  // An actor holding it on another branch only gets a 403, which falls back to the rules below.
  const serverAllowed = computed(() => canAccess('roles') && hasPermission('role:read_tree'))
  const server = useQuery(() => ({
    ...entityRolesQuery(entityId.value ?? ''),
    enabled: enabled.value && Boolean(entityId.value) && serverAllowed.value
  }))
  const useRules = computed(() => !serverAllowed.value || server.status.value === 'error')

  // Client-side rules need the entity's path (type, root, ancestors) plus the role catalog.
  const pathAllowed = computed(() => canAccess('entities'))
  // Not gated on `enabled` / `useRules`: the entity detail and membership rows read the same key,
  // and Pinia Colada keeps ONE options object per entry (the last observer to compute its
  // options wins), so a closed dialog's `enabled: false` would stop their refetch after a write.
  // The path is small and usually cached already.
  const path = useQuery(() => ({
    ...entityPathQuery(entityId.value ?? ''),
    enabled: Boolean(entityId.value) && pathAllowed.value
  }))
  const entityContext = computed(() => (path.data.value ? entityRoleContextFromPath(path.data.value) : null))

  const denied = computed(() => {
    if (awaitingEntity.value) return false
    if (resolvedTarget.value.kind === 'entity' && !useRules.value) return false
    return !catalog.available.value || (resolvedTarget.value.kind === 'entity' && !pathAllowed.value)
  })

  const baseRoles = computed<Role[]>(() => {
    const t = resolvedTarget.value
    if (t.kind === 'direct') {
      return catalog.all.value.filter(role => roleDirectlyAssignable(role, { enterprise: isEnterprise.value, rootEntityId: t.rootEntityId }))
    }
    if (!entityId.value) return []
    if (!useRules.value) return (server.data.value?.items ?? []).filter(role => (role.status ?? 'active') === 'active')
    const context = entityContext.value
    return context ? catalog.all.value.filter(role => roleAvailableAtEntity(role, context)) : []
  })

  const roles = computed<AssignableRole[]>(() => {
    const excluded = new Set(toValue(options.exclude) ?? [])
    const superuser = isSuperuser.value
    return baseRoles.value
      .filter(role => !excluded.has(role.id))
      .map(role => ({
        ...role,
        type: roleTypeOf(role),
        missingPermissions: superuser ? [] : missingDelegatedPermissions(role.permissions, hasPermission)
      }))
      .sort((a, b) => compareRolesForPicker(a, b, isEnterprise.value))
  })

  const status = computed<AssignableRolesStatus>(() => {
    if (awaitingEntity.value) return 'idle'
    if (denied.value) return 'denied'
    const t = resolvedTarget.value
    const involved = t.kind === 'direct'
      ? [catalog.status.value]
      : useRules.value ? [catalog.status.value, path.status.value] : [server.status.value]
    if (involved.includes('error')) return 'error'
    if (involved.includes('pending')) return 'pending'
    return 'success'
  })

  const errorMessage = useApiErrorMessage(() => {
    if (resolvedTarget.value.kind === 'direct') return catalog.error.value
    return useRules.value ? (catalog.error.value ?? path.error.value) : server.error.value
  })

  // What the picker should say when it has nothing to offer.
  const emptyText = computed(() => {
    switch (status.value) {
      case 'idle': return 'Choose an entity to see the roles you can grant there.'
      case 'denied': return 'You need permission to read roles to grant them.'
      case 'pending': return 'Loading roles...'
      case 'error': return errorMessage.value || 'Could not load roles.'
      default: return resolvedTarget.value.kind === 'entity'
        ? 'No roles can be granted at this entity.'
        : 'No roles can be granted directly.'
    }
  })

  // Resolve any role id the dialog holds (pool first, then the catalog), e.g. a member's current
  // roles that are no longer grantable here.
  const roleById = computed(() => {
    const map = new Map<string, Role>(catalog.roleById.value)
    for (const role of baseRoles.value) map.set(role.id, role)
    return map
  })

  const truncated = computed(() => (useRules.value || resolvedTarget.value.kind === 'direct')
    ? catalog.truncated.value
    : Boolean(server.data.value?.truncated))

  return {
    roles,
    roleById,
    status,
    errorMessage,
    emptyText,
    // True until an entity is chosen for an entity target: keep the picker disabled.
    awaitingEntity,
    truncated
  }
}
