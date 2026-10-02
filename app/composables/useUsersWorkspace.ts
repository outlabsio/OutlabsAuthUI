import { useQuery } from '@pinia/colada'
import type { ButtonProps, DropdownMenuItem, FormSubmitEvent } from '@nuxt/ui'
import { entitiesListQuery } from '~/queries/entities'
import { usersListQuery, usersOrphanedQuery, useCreateUser, useDeleteUser, useInviteUser, useRestoreUser } from '~/queries/users'
import { createUserSchemaFor, inviteUserSchemaFor, type CreateUserSchema, type InviteUserSchema } from '~/schemas/user'
import type { CreateUserInput, OrphanedUser, OrphanedUsersListResponse, User, UsersListResponse, UserStatusValue } from '~/types/user'
import type { ActionError } from '~/composables/useApiAction'
import { inviteEntityRule, newUserRootChoice, NO_ROOT_ORG, userDeleteCopy, userRowPolicy } from '~/utils/users'

// Feature logic for the users workspace; pages/app/users/index.vue is display only.
//
// List (the shared list conventions, see usePermissionsWorkspace): search, status, account
// type, organization, "orphaned only" and the page live in the route query, so reload, Back
// from a user and shared links keep the view; the search is debounced; the previous page stays
// on screen while the next loads; the total is always shown. Every filter goes to the server.
//
// Scope (F-012, F-161): outlabs-auth shows a delegated (non-global) admin only the accounts in
// their organisation, and answers them an empty orphaned list. So for them the orphaned filter
// is hidden, a new account is placed in their organisation (required, preselected) and an
// invite must attach an entity membership (and is not offered without membership:create_tree).
//
// Row menus (F-053, F-063) are built from the actor's permissions and the account's state
// (utils/users.ts userRowPolicy): nothing the backend would refuse, no Delete on one's own row.

export type UserStatusFilter = UserStatusValue | 'all'
export type UserTypeFilter = 'all' | 'superuser' | 'standard'
export type UserListRow = { id: string, user: User, orphan: OrphanedUser | null }

// Default to the live roster: terminal and pending states are one filter away.
const STATUS_ITEMS: { label: string, value: UserStatusFilter }[] = [
  { label: 'Active', value: 'active' },
  { label: 'Invited', value: 'invited' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Banned', value: 'banned' },
  { label: 'Deleted', value: 'deleted' },
  { label: 'All statuses', value: 'all' }
]
const TYPE_ITEMS: { label: string, value: UserTypeFilter }[] = [
  { label: 'All account types', value: 'all' },
  { label: 'Superusers', value: 'superuser' },
  { label: 'Standard accounts', value: 'standard' }
]
const ALL_ORGS = 'all'
const PAGE_SIZE = 25
// Organisations offered by the organization filter and a global admin's create dialog.
const ROOTS_LIMIT = 100

export function useUsersWorkspace() {
  const { canAccess, isEnterprise, hasMemberships, can, hasPermission, isSuperuser, user: actor } = useAuth()
  const { canBrowseAllRoots } = useEntityScope()
  const { isGlobal } = useActorReach()
  // Same requirement as the Users nav item and the page gate (APP_SECTIONS 'users').
  const canRead = computed(() => canAccess('users'))

  // --- List state (route query) ---
  const list = useListQueryState({
    filters: { status: 'active' as UserStatusFilter, type: 'all' as UserTypeFilter, org: ALL_ORGS as string, orphaned: false as boolean },
    allowed: { status: STATUS_ITEMS.map(i => i.value), type: TYPE_ITEMS.map(i => i.value) },
    pageSize: PAGE_SIZE
  })
  const { search, searchTerm, page, pageSize, filters: { status: statusFilter, type: typeFilter, org: orgFilter, orphaned: orphanedFilter } } = list

  // Organisations: EnterpriseRBAC only (F-008). A delegated admin's list is their organisation
  // already, so only admins who browse every organisation get the filter: superusers, system-wide
  // admins (the backend lists every organisation's accounts to them) and admins without an
  // organisation, the one rule useEntityScope applies to entities too.
  const seesAllRoots = canBrowseAllRoots
  const rootsReadable = computed(() => isEnterprise.value && canRead.value && seesAllRoots.value && canAccess('entities'))
  const { data: rootsData } = useQuery(() => ({
    ...entitiesListQuery({ rootOnly: true, limit: ROOTS_LIMIT }),
    enabled: rootsReadable.value
  }))
  const roots = computed(() => (rootsData.value?.items ?? []).map(e => ({ id: e.id, name: e.display_name || e.name })))
  const showOrgFilter = rootsReadable
  // A delegated admin's accounts all belong to their organisation: the column would repeat it.
  const showOrgColumn = computed(() => isEnterprise.value && seesAllRoots.value)
  const orgItems = computed(() => [
    { label: 'All organizations', value: ALL_ORGS },
    ...roots.value.map(root => ({ label: root.name, value: root.id })),
    // An organisation from the URL stays selectable before (or beyond) the loaded roots.
    ...(orgFilter.value !== ALL_ORGS && !roots.value.some(r => r.id === orgFilter.value) ? [{ label: 'Selected organization', value: orgFilter.value }] : [])
  ])
  const rootEntityId = computed(() => (showOrgFilter.value && orgFilter.value !== ALL_ORGS ? orgFilter.value : undefined))

  // Orphaned (lost every entity membership): EnterpriseRBAC with memberships, and only for
  // global admins — outlabs-auth answers anyone else with an empty page (F-161, backend).
  const showOrphanedFilter = computed(() => isEnterprise.value && hasMemberships.value && isGlobal.value === true)
  const orphanedOnly = computed({
    get: () => showOrphanedFilter.value && orphanedFilter.value,
    set: (value: boolean) => { orphanedFilter.value = value }
  })

  const usersQuery = useQuery(() => ({
    ...usersListQuery({
      page: page.value,
      limit: pageSize.value,
      search: searchTerm.value || undefined,
      status: statusFilter.value === 'all' ? undefined : statusFilter.value,
      isSuperuser: typeFilter.value === 'all' ? undefined : typeFilter.value === 'superuser',
      rootEntityId: rootEntityId.value
    }),
    // The previous page stays while the next loads (the factory also feeds a picker, so not there).
    placeholderData: keepPreviousData<UsersListResponse>,
    enabled: canRead.value && !orphanedOnly.value
  }))
  const orphanedQuery = useQuery(() => ({
    ...usersOrphanedQuery({ page: page.value, limit: pageSize.value, search: searchTerm.value || undefined, rootEntityId: rootEntityId.value }),
    placeholderData: keepPreviousData<OrphanedUsersListResponse>,
    enabled: canRead.value && orphanedOnly.value
  }))
  const active = computed(() => (orphanedOnly.value ? orphanedQuery : usersQuery))

  // Orphaned rows wrap the user ({ user, active_membership_count, last_entity_name, … }) (F-010).
  const rows = computed<UserListRow[]>(() => (orphanedOnly.value
    ? (orphanedQuery.data.value?.items ?? []).map(item => ({ id: item.user.id, user: item.user, orphan: item }))
    : (usersQuery.data.value?.items ?? []).map(user => ({ id: user.id, user, orphan: null }))))
  const total = computed(() => active.value.data.value?.total ?? 0)
  list.syncTotal(() => active.value.data.value?.total)
  const status = computed(() => active.value.status.value)
  const error = computed(() => active.value.error.value)
  const fetching = computed(() => active.value.asyncStatus.value === 'loading')
  function retry() {
    void active.value.refetch()
  }

  // Filters that are not the search box (the mobile Filters button counts them).
  const activeFilterCount = computed(() => [
    statusFilter.value !== 'active' && !orphanedOnly.value,
    typeFilter.value !== 'all' && !orphanedOnly.value,
    Boolean(rootEntityId.value),
    orphanedOnly.value
  ].filter(Boolean).length)

  // --- Gates ---
  // DELETE /users/{id} retain-deletes: the account is kept (status deleted, restorable) and every
  // access artifact is revoked; a restore brings back the identity only.
  const crud = useResourceCrud<User>({
    noun: 'user',
    createPermission: 'user:create',
    removeMutation: useDeleteUser(),
    describeRemove: user => userDeleteCopy(user, { hasMemberships: hasMemberships.value })
  })
  // Header actions render only above a readable list, each on its own gate.
  const canCreate = computed(() => canRead.value && crud.canCreate.value)
  const canUpdate = computed(() => hasPermission('user:update'))
  const canDelete = computed(() => hasPermission('user:delete'))
  // Inviting into an entity creates a membership there, which the invite endpoint allows only
  // with membership:create_tree at that entity (plain membership:create is not enough there).
  const canInviteToEntity = computed(() => isEnterprise.value && hasPermission('membership:create_tree'))
  const inviteRule = computed(() => inviteEntityRule({ isEnterprise: isEnterprise.value, actorIsGlobal: isGlobal.value, canInviteToEntity: canInviteToEntity.value }))
  // POST /auth/invite needs user:create and the backend's invitations feature (F-171).
  const canInvite = computed(() => canCreate.value && can('invitations') && inviteRule.value.allowed)

  // --- Row menu ---
  const restoreUser = useRestoreUser()
  const restore = useConfirmAction<User>({
    describe: user => ({
      title: `Restore user ${user.email}`,
      description: 'The account becomes active again and can sign in with its password.',
      effects: [
        'Only the identity comes back: roles, memberships and API keys stay revoked and must be granted again.',
        'Any lockout or timed suspension is cleared.'
      ],
      confirmLabel: 'Restore user',
      confirmColor: 'primary'
    }),
    action: user => restoreUser.mutateAsync(user.id),
    success: 'User restored',
    error: 'Could not restore user',
    notFoundCodes: ['USER_NOT_FOUND']
  })

  function rowMenu(user: User): DropdownMenuItem[][] {
    const policy = userRowPolicy({
      actorId: actor.value?.id,
      actorIsGlobal: isGlobal.value,
      canUpdate: canUpdate.value,
      canDelete: canDelete.value,
      target: user
    })
    const open: DropdownMenuItem[] = [{ label: 'View', icon: 'i-lucide-eye', to: `/app/users/${user.id}` }]
    // One's own account is managed from Account (password, sessions), not as another user.
    if (policy.isSelf) open.push({ label: 'Your account', icon: 'i-lucide-circle-user', to: '/app/account' })
    const manage: DropdownMenuItem[] = []
    if (policy.canEdit) manage.push({ label: 'Edit profile', icon: 'i-lucide-pencil', onSelect: () => openEdit(user) })
    if (policy.canRestore) manage.push({ label: 'Restore', icon: 'i-lucide-undo-2', onSelect: () => restore.ask(user) })
    const remove: DropdownMenuItem[] = policy.canDelete
      ? [{ label: 'Delete', icon: 'i-lucide-trash', color: 'error' as const, onSelect: () => crud.remove.ask(user) }]
      : []
    return [open, manage, remove].filter(group => group.length)
  }

  // --- Create ---
  // Server problems land on the matching field or in the dialog's alert; the dialog stays open
  // until the account exists, then its page opens (F-218).
  const createOpen = ref(false)
  const createError = ref<ActionError | null>(null)
  const createForm = useDialogForm('createDialog')
  // The admin's own organisation: fixed for a delegated admin (anchored), always offered to a
  // system-wide admin inside one, also while their reach or the roots list is still loading.
  const ownRootId = computed(() => (isSuperuser.value ? null : actor.value?.root_entity_id ?? null))
  const ownRoot = computed(() => (ownRootId.value
    ? { id: ownRootId.value, name: actor.value?.root_entity_name || 'Your organization' }
    : null))
  const rootChoice = computed(() => newUserRootChoice({ actorIsGlobal: isGlobal.value, anchoredRoot: ownRoot.value, roots: roots.value }))
  const rootRequired = computed(() => isEnterprise.value && rootChoice.value.required)
  const createSchema = computed(() => createUserSchemaFor({ rootRequired: rootRequired.value }))
  const blankCreate = (): CreateUserSchema => ({
    email: '',
    password: '',
    confirm_password: '',
    first_name: '',
    last_name: '',
    root_entity_id: isEnterprise.value ? rootChoice.value.initial : '',
    is_superuser: false
  })
  const createState = reactive<CreateUserSchema>(blankCreate())
  const createUser = useCreateUser()
  function openCreate() {
    Object.assign(createState, blankCreate())
    createError.value = null
    createOpen.value = true
  }
  async function onCreate(event: FormSubmitEvent<CreateUserSchema>) {
    const d = event.data
    // confirm_password is validated but never sent; is_superuser only by superusers (F-054).
    const input: CreateUserInput = {
      email: d.email,
      password: d.password,
      first_name: d.first_name || undefined,
      last_name: d.last_name || undefined,
      is_superuser: isSuperuser.value && d.is_superuser
    }
    if (isEnterprise.value && d.root_entity_id && d.root_entity_id !== NO_ROOT_ORG) input.root_entity_id = d.root_entity_id
    const res = await crud.run(() => createUser.mutateAsync(input), {
      success: 'User created',
      error: 'Could not create user',
      form: createForm,
      inline: createError
    })
    if (res.ok) {
      createOpen.value = false
      await navigateTo(`/app/users/${res.data.id}`)
    }
  }

  // --- Invite ---
  // Invite by email (no password). Optionally attach an entity membership (entity_id) with roles,
  // or direct account roles (no entity). The role pool follows the choice (useAssignableRoles):
  // the roles the backend accepts at the chosen entity, or — with no entity — direct grants for
  // an account without an organization, i.e. system-wide roles; either way only roles the actor
  // may delegate.
  const inviteOpen = ref(false)
  const inviteError = ref<ActionError | null>(null)
  const inviteForm = useDialogForm('inviteDialog')
  const inviteSchema = computed(() => inviteUserSchemaFor({ entityRequired: inviteRule.value.required }))
  const blankInvite = (): InviteUserSchema => ({ email: '', first_name: '', last_name: '', entity_id: undefined, role_ids: [], is_superuser: false })
  const inviteState = reactive<InviteUserSchema>(blankInvite())
  const inviteUser = useInviteUser()
  const inviteGrant = computed<'direct' | 'membership'>(() => (inviteRule.value.offered && inviteState.entity_id ? 'membership' : 'direct'))
  const inviteRoles = useAssignableRoles(
    () => inviteGrant.value === 'membership'
      ? { kind: 'entity', entityId: inviteState.entity_id }
      : { kind: 'direct', rootEntityId: null },
    { enabled: inviteOpen }
  )
  // The selected roles, so a delegation denial can name the roles that carry the refused permissions.
  const inviteSelectedRoles = computed(() => inviteState.role_ids
    .map(id => inviteRoles.roleById.value.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r)))
  // The assignable pool changes with the entity — clear stale selections when it switches.
  watch(() => inviteState.entity_id, () => {
    inviteState.role_ids = []
  })
  function openInvite() {
    Object.assign(inviteState, blankInvite())
    inviteError.value = null
    inviteOpen.value = true
  }
  async function onInvite(event: FormSubmitEvent<InviteUserSchema>) {
    const d = event.data
    const entityId = (inviteRule.value.offered && d.entity_id) || undefined
    const res = await crud.run(() => inviteUser.mutateAsync({
      email: d.email,
      first_name: d.first_name || undefined,
      last_name: d.last_name || undefined,
      is_superuser: isSuperuser.value && d.is_superuser,
      entity_id: entityId,
      role_ids: d.role_ids.length ? [...d.role_ids] : undefined
    }), {
      success: 'Invitation sent',
      error: 'Could not send invitation',
      form: inviteForm,
      inline: inviteError,
      // A delegation denial names the permissions the actor may not grant, and the roles that carry them.
      grantedRoles: inviteSelectedRoles
    })
    if (res.ok) {
      inviteOpen.value = false
      // The invited account (status Invited) opens, so it never seems lost behind the Active filter.
      await navigateTo(`/app/users/${res.data.id}`)
    }
  }

  // --- Edit profile (shared dialog: <AppUserProfileDialog>) ---
  const editOpen = ref(false)
  const editTarget = shallowRef<User | null>(null)
  function openEdit(user: User) {
    editTarget.value = user
    editOpen.value = true
  }

  // --- Empty state ---
  const emptyState = computed(() => {
    if (orphanedOnly.value && !searchTerm.value) {
      return {
        title: 'No orphaned users',
        description: 'Accounts that lose every entity membership appear here.',
        actions: [{ label: 'Show all users', icon: 'i-lucide-users', color: 'neutral', variant: 'outline', onClick: () => { orphanedOnly.value = false } }] satisfies ButtonProps[]
      }
    }
    if (list.isFiltered.value) {
      return {
        title: 'No users match',
        description: 'Try a different search or clear the filters.',
        actions: [{ label: 'Clear filters', icon: 'i-lucide-x', color: 'neutral', variant: 'outline', onClick: list.reset }] satisfies ButtonProps[]
      }
    }
    const actions: ButtonProps[] = []
    if (canCreate.value) actions.push({ label: 'Add user', icon: 'i-lucide-plus', onClick: openCreate })
    if (canInvite.value) actions.push({ label: 'Invite', icon: 'i-lucide-mail', color: 'neutral', variant: 'outline', onClick: openInvite })
    return { title: 'No active users', description: 'Add or invite people to give them access.', actions }
  })

  return {
    canRead,
    canCreate,
    canInvite,
    isEnterprise,
    isSuperuser,
    // List
    search,
    statusFilter,
    statusItems: STATUS_ITEMS,
    typeFilter,
    typeItems: TYPE_ITEMS,
    showOrgFilter,
    showOrgColumn,
    orgFilter,
    orgItems,
    showOrphanedFilter,
    orphanedOnly,
    activeFilterCount,
    rows,
    total,
    page,
    pageSize,
    status,
    error,
    fetching,
    retry,
    emptyState,
    rowMenu,
    // Create
    createOpen,
    createError,
    createState,
    createSchema,
    rootChoice,
    rootRequired,
    openCreate,
    onCreate,
    // Invite
    inviteOpen,
    inviteError,
    inviteState,
    inviteSchema,
    inviteRule,
    openInvite,
    onInvite,
    inviteGrant,
    inviteRolesPool: inviteRoles.roles,
    inviteRolesStatus: inviteRoles.status,
    inviteRolesEmptyText: inviteRoles.emptyText,
    inviteRolesTruncated: inviteRoles.truncated,
    // Edit, restore, delete
    editOpen,
    editTarget,
    restoreUser: restore,
    deleteUser: crud.remove
  }
}
