import { useQuery } from '@pinia/colada'
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'
import { entitiesListQuery, entityOrganisationQuery } from '~/queries/entities'
import { rolesListQuery } from '~/queries/roles'
import { usersListQuery } from '~/queries/users'
import type { EntitiesListResponse, Entity } from '~/types/entity'
import type { RolesListResponse } from '~/types/role'
import type { User, UsersListResponse } from '~/types/user'

// Records are searched on the server only from this many characters, debounced, a handful at
// a time: one small list request per readable resource while the palette is open.
const MIN_SEARCH_LENGTH = 2
const SEARCH_DEBOUNCE_MS = 300
const RESULT_LIMIT = 5

// The fields the server's entity search matches (name, display name, description, type), for the
// local search of a delegated admin's organisation.
function entityMatches(entity: Entity, term: string): boolean {
  const needle = term.toLowerCase()
  return [entity.display_name, entity.name, entity.slug, entity.entity_type, entity.description]
    .some(field => typeof field === 'string' && field.toLowerCase().includes(needle))
}

function userLabel(user: User): string {
  return [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.email
}

// Feature logic for the shell's command palette (UDashboardSearch, Cmd/Ctrl+K or the sidebar's
// Search button). "Go to" lists every section this actor may open (the same APP_SECTIONS gate as
// the sidebar and user menu); Users, Roles and Entities search the server through the list
// queries each workspace already uses, and only when that section is readable (no request to
// a surface the actor or the backend lacks). A delegated admin's entity search runs over their own
// organisation (loaded once, filtered locally), never the unscoped server search (F-020).
// Colour mode comes from UDashboardSearch itself.
export function useCommandPalette() {
  const { canAccess } = useAuth()
  const { anchoredRootId } = useEntityScope()
  const { sections } = useAppNavigation()
  const { signOut } = useSignOut()

  const open = ref(false)
  const searchTerm = ref('')
  const debouncedTerm = refDebounced(searchTerm, SEARCH_DEBOUNCE_MS)
  const term = computed(() => debouncedTerm.value.trim())
  const searching = computed(() => open.value && term.value.length >= MIN_SEARCH_LENGTH)

  const canSearchUsers = computed(() => canAccess('users'))
  const canSearchRoles = computed(() => canAccess('roles'))
  const canSearchEntities = computed(() => canAccess('entities'))

  // Previous results stay while the next term loads, so the list doesn't flash empty per key.
  const users = useQuery(() => ({
    ...usersListQuery({ page: 1, limit: RESULT_LIMIT, search: term.value }),
    enabled: searching.value && canSearchUsers.value,
    placeholderData: (previous: UsersListResponse | undefined) => previous
  }))
  const roles = useQuery(() => ({
    ...rolesListQuery({ page: 1, limit: RESULT_LIMIT, search: term.value }),
    enabled: searching.value && canSearchRoles.value,
    placeholderData: (previous: RolesListResponse | undefined) => previous
  }))
  const entities = useQuery(() => ({
    ...entitiesListQuery({ page: 1, limit: RESULT_LIMIT, search: term.value }),
    enabled: searching.value && canSearchEntities.value && !anchoredRootId.value,
    placeholderData: (previous: EntitiesListResponse | undefined) => previous
  }))
  // Its own key (not the tree's detail and descendants entries), so gating it on the palette
  // being open leaves the entities page's queries alone.
  const organisation = useQuery(() => ({
    ...entityOrganisationQuery(anchoredRootId.value ?? ''),
    enabled: searching.value && canSearchEntities.value && Boolean(anchoredRootId.value)
  }))
  const entityResults = computed<Entity[]>(() => {
    if (!anchoredRootId.value) return entities.data.value?.items ?? []
    return (organisation.data.value ?? [])
      .filter(entity => entity.status !== 'archived' && entityMatches(entity, term.value))
      .slice(0, RESULT_LIMIT)
  })

  const loading = computed(() => searching.value && [users, roles, entities, organisation].some(query => query.asyncStatus.value === 'loading'))

  const groups = computed<CommandPaletteGroup<CommandPaletteItem>[]>(() => {
    const result: CommandPaletteGroup<CommandPaletteItem>[] = [{
      id: 'go-to',
      label: 'Go to',
      items: sections.value.map(section => ({
        id: `section-${section.id}`,
        label: section.label,
        icon: section.icon,
        to: section.to
      }))
    }]

    // Server-filtered groups: shown for the current term only, never re-filtered client-side.
    if (searching.value) {
      if (canSearchUsers.value) {
        result.push({
          id: 'users',
          label: 'Users',
          ignoreFilter: true,
          items: (users.data.value?.items ?? []).map(user => ({
            id: `user-${user.id}`,
            label: userLabel(user),
            suffix: userLabel(user) === user.email ? undefined : user.email,
            icon: 'i-lucide-user',
            to: `/app/users/${user.id}`
          }))
        })
      }
      if (canSearchRoles.value) {
        result.push({
          id: 'roles',
          label: 'Roles',
          ignoreFilter: true,
          items: (roles.data.value?.items ?? []).map(role => ({
            id: `role-${role.id}`,
            label: role.display_name || role.name,
            suffix: role.display_name && role.display_name !== role.name ? role.name : undefined,
            icon: 'i-lucide-shield',
            to: `/app/roles/${role.id}`
          }))
        })
      }
      if (canSearchEntities.value) {
        result.push({
          id: 'entities',
          label: 'Entities',
          ignoreFilter: true,
          items: entityResults.value.map(entity => ({
            id: `entity-${entity.id}`,
            label: entity.display_name || entity.name,
            suffix: entity.entity_type,
            icon: 'i-lucide-building-2',
            to: { path: '/app/entities', query: { entity: entity.id } }
          }))
        })
      }
    }

    result.push({
      id: 'actions',
      label: 'Actions',
      items: [{ id: 'sign-out', label: 'Sign out', icon: 'i-lucide-log-out', onSelect: () => void signOut() }]
    })
    return result
  })

  // Name what can be searched, so the placeholder never promises records the actor can't see.
  const placeholder = computed(() => {
    const kinds = [
      canSearchUsers.value && 'users',
      canSearchRoles.value && 'roles',
      canSearchEntities.value && 'entities'
    ].filter((kind): kind is string => Boolean(kind))
    if (!kinds.length) return 'Search pages and actions…'
    return `Search pages, ${kinds.length > 1 ? `${kinds.slice(0, -1).join(', ')} and ${kinds.at(-1)}` : kinds[0]}…`
  })

  return { open, searchTerm, groups, loading, placeholder }
}
