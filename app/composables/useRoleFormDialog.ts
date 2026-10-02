import type { MaybeRefOrGetter, Ref } from 'vue'
import type { FormSubmitEvent, RadioGroupItem } from '@nuxt/ui'
import { useQuery } from '@pinia/colada'
import { useCreateRole, useSaveRole } from '~/queries/roles'
import { entityTypeConfigQuery } from '~/queries/settings'
import { createRoleSchema, updateRoleSchema, type CreateRoleSchema, type UpdateRoleSchema } from '~/schemas/role'
import type { ActionError } from '~/composables/useApiAction'
import type { RoleFormTarget } from '~/composables/useRoleActions'
import type { Role, RoleType, UpdateRoleInput } from '~/types/role'
import { normalizeApiError } from '~/api/errors'
import { ROLE_TYPE_LABELS, roleTypeOf } from '~/utils/role-access'
import {
  ROLE_SCOPE_LABELS,
  ROLE_TYPE_CHOICE_DESCRIPTIONS,
  duplicateRoleDraft,
  roleDefinedAt,
  roleDelegationNote,
  rolePermissionChanges,
  roleSlugFromDisplayName,
  roleTypeChoices,
  type RoleDraft
} from '~/utils/role-definitions'
import { entityPickBlocked } from '~/utils/entity-scope'

// The role create / edit / duplicate dialog behind <AppRoleFormDialog> (F-016, F-069, F-070,
// F-115, F-116, F-177). Called by the component itself, so useDialogForm('roleDialog') resolves
// its own dialog.
// - Type first (URadioGroup cards): system-wide only for actors with global scope (the backend
//   refuses anyone else, F-054); a delegated admin starts on Organization with their own
//   organization chosen, and picks entities only inside it (AppEntityPicker anchors itself).
// - The name (slug) follows the display name until the admin edits it.
// - Permissions: AppPermissionPicker (active, delegable permissions; the selection as removable
//   chips, inactive ones flagged). A non-superuser is told they can grant only what they hold;
//   a refusal names the missing permissions (AppApiErrorAlert).
// - Entity types the role may be granted at: a multi-select of the types in use and configured,
//   with "create" for a new one (F-116), instead of comma-separated text.
// - Edit sends only changed fields, and the permission DIFF (useSaveRole), never the whole set
//   (F-070); removing permissions from a role the admin holds warns first (F-177).
// - Duplicate opens Create pre-filled from a role (system roles cannot be edited, F-053).

type RoleFormState = RoleDraft

const blankState = (roleType: RoleType, rootId: string): RoleFormState => ({
  role_type: roleType,
  root_entity_id: roleType === 'root' ? rootId : '',
  scope_entity_id: '',
  display_name: '',
  name: '',
  description: '',
  permissions: [],
  status: 'active',
  scope: 'hierarchy',
  is_auto_assigned: false,
  assignable_at_types: []
})

export function useRoleFormDialog(target: MaybeRefOrGetter<RoleFormTarget>, open: Ref<boolean>, emit: { created: (role: Role) => void, saved: (role: Role) => void }) {
  const { isEnterprise, isSuperuser, canAccess, hasSurface, hasPermission, user } = useAuth()
  const { anchoredRootId } = useEntityScope()
  const { isGlobal } = useActorReach()
  const { atRisk } = useHeldRoles()
  const { run } = useApiAction()
  const form = useDialogForm('roleDialog')
  const error = ref<ActionError | null>(null)

  const mode = computed(() => toValue(target).mode)
  const editing = computed<Role | null>(() => {
    const t = toValue(target)
    return t.mode === 'edit' ? t.role : null
  })
  const source = computed<Role | null>(() => {
    const t = toValue(target)
    return t.mode === 'create' ? t.source ?? null : null
  })

  // --- Where a role may live ---
  // Organizations and entities the actor may pick: their own organization for a delegated admin
  // (useScopedEntities), every one for superusers, system-wide admins and rootless admins. Gated
  // on inputs only (an actor who can neither create nor edit roles never opens this dialog, so
  // loads nothing).
  const authoring = computed(() => isEnterprise.value && canAccess('roles') && (hasPermission('role:create') || hasPermission('role:update')))
  const entitiesReadable = computed(() => authoring.value && canAccess('entities'))
  const { entities } = useScopedEntities(entitiesReadable)
  const rootItems = computed(() => entities.value
    .filter(entity => !entity.parent_entity_id)
    .map(entity => ({ label: entity.display_name || entity.name, value: entity.id })))
  // A delegated admin's organization is fixed; a system-wide admin inside one starts there.
  const ownRootId = computed(() => (isSuperuser.value ? null : user.value?.root_entity_id ?? null))
  const defaultRootId = computed(() => anchoredRootId.value
    ?? (ownRootId.value && rootItems.value.some(item => item.value === ownRootId.value) ? ownRootId.value : null)
    ?? (rootItems.value.length === 1 ? rootItems.value[0]!.value : ''))
  // AppEntityPicker anchors a delegated admin on their organization and searches every one for
  // superusers and system-wide admins (F-016); a rootless admin without global reach has nothing
  // to pick, so the Entity type (and Organization, with no organization to choose) is not offered.
  const entityPickerBlocked = computed(() => entityPickBlocked({ enterprise: isEnterprise.value, superuser: isSuperuser.value, actorIsGlobal: isGlobal.value, anchoredRootId: anchoredRootId.value }))
  const typeChoices = computed(() => roleTypeChoices({
    enterprise: isEnterprise.value,
    actorIsGlobal: isGlobal.value,
    canPickEntity: !entityPickerBlocked.value,
    canPickRoot: !entityPickerBlocked.value || rootItems.value.length > 0
  }))
  const typeItems = computed<RadioGroupItem[]>(() => typeChoices.value.map(type => ({
    value: type,
    label: ROLE_TYPE_LABELS[type],
    description: ROLE_TYPE_CHOICE_DESCRIPTIONS[type]
  })))
  const showType = computed(() => isEnterprise.value && mode.value === 'create')
  // Nothing this admin may create (no organization, no entity, no global reach).
  const noRoleType = computed(() => showType.value && typeChoices.value.length === 0)

  // Entity types (assignable at): the types in use in the actor's organizations, the configured
  // root and child types, and anything the role already lists; "create" adds a new one.
  const configReadable = computed(() => authoring.value && hasSurface('config'))
  const { data: typeConfig } = useQuery(() => ({ ...entityTypeConfigQuery, enabled: configReadable.value }))
  const createdTypes = ref<string[]>([])

  const state = reactive<RoleFormState>(blankState('global', ''))
  const nameEdited = ref(false)

  const entityTypeItems = computed(() => {
    const types = new Set<string>()
    for (const entity of entities.value) if (entity.entity_type) types.add(entity.entity_type.toLowerCase())
    const config = typeConfig.value
    if (config) {
      for (const group of [config.allowed_root_types, config.default_child_types]) {
        for (const type of [...(group?.structural ?? []), ...(group?.access_group ?? [])]) types.add(type.toLowerCase())
      }
    }
    for (const type of [...createdTypes.value, ...state.assignable_at_types]) types.add(type)
    return [...types].sort()
  })
  function addEntityType(text: string) {
    const type = text.trim().toLowerCase()
    if (!type) return
    if (!createdTypes.value.includes(type)) createdTypes.value.push(type)
    if (!state.assignable_at_types.includes(type)) state.assignable_at_types = [...state.assignable_at_types, type]
  }

  // --- Edit: what changed ---
  const changes = useDirtyPatch(state, s => ({
    display_name: s.display_name.trim(),
    description: s.description.trim(),
    permissions: [...s.permissions].sort(),
    status: s.status,
    scope: s.scope,
    is_auto_assigned: s.is_auto_assigned,
    assignable_at_types: [...s.assignable_at_types].sort()
  }))
  const editType = computed<RoleType | null>(() => (editing.value ? roleTypeOf(editing.value) : null))

  function formFrom(role: Role): RoleFormState {
    return {
      role_type: roleTypeOf(role),
      root_entity_id: role.root_entity_id ?? '',
      scope_entity_id: role.scope_entity_id ?? '',
      display_name: role.display_name,
      name: role.name,
      description: role.description ?? '',
      permissions: [...role.permissions],
      // An archived role never opens here (read-only); anything but inactive edits as active.
      status: role.status === 'inactive' ? 'inactive' : 'active',
      scope: role.scope,
      is_auto_assigned: role.is_auto_assigned,
      assignable_at_types: [...(role.assignable_at_types ?? [])]
    }
  }

  watch(open, (isOpen) => {
    if (!isOpen) return
    error.value = null
    createdTypes.value = []
    const role = editing.value
    if (role) {
      Object.assign(state, formFrom(role))
      changes.snapshot()
      nameEdited.value = true
      return
    }
    const from = source.value
    Object.assign(state, from
      ? duplicateRoleDraft(from, { allowedTypes: typeChoices.value, defaultRootId: defaultRootId.value })
      : blankState(typeChoices.value[0] ?? 'global', defaultRootId.value))
    // The name follows the display name (a duplicate's "(copy)" one too) until edited.
    nameEdited.value = false
  }, { immediate: true })

  // A delegated admin's organization arrives after the dialog may have opened.
  watch(defaultRootId, (rootId) => {
    if (open.value && mode.value === 'create' && state.role_type === 'root' && !state.root_entity_id) state.root_entity_id = rootId
  })
  watch(typeChoices, (choices) => {
    if (open.value && mode.value === 'create' && isEnterprise.value && choices.length && !choices.includes(state.role_type)) state.role_type = choices[0]!
  })
  watch(() => state.role_type, (type) => {
    if (mode.value !== 'create') return
    if (type === 'root' && !state.root_entity_id) state.root_entity_id = defaultRootId.value
    if (type !== 'entity') state.is_auto_assigned = false
  })
  watch(() => state.display_name, (name) => {
    if (mode.value === 'create' && !nameEdited.value) state.name = roleSlugFromDisplayName(name)
  })
  function onNameInput() {
    nameEdited.value = true
  }

  const removedPermissions = computed(() => (editing.value ? rolePermissionChanges(editing.value.permissions, state.permissions).removed : []))
  // F-177: removing permissions from a role the admin holds takes them away from the admin too.
  const selfDemotion = computed(() => Boolean(editing.value) && atRisk(editing.value!.id) && removedPermissions.value.length > 0)
  // F-016: a delegated admin can only put permissions they hold into a role. The note's wording
  // follows the picker's source (the catalog with non-held permissions blocked, or only the held
  // names), so it never contradicts what the picker lists.
  const { listsCatalog } = useGrantablePermissions(() => state.permissions)
  const delegationNote = computed(() => roleDelegationNote({ superuser: isSuperuser.value, listsCatalog: listsCatalog.value }))

  const schema = computed(() => (mode.value === 'edit' ? updateRoleSchema : createRoleSchema))
  const title = computed(() => {
    if (editing.value) return `Edit role ${editing.value.display_name}`
    return source.value ? `Duplicate role ${source.value.display_name}` : 'Add role'
  })
  const submitLabel = computed(() => (mode.value === 'edit' ? 'Save changes' : 'Create role'))
  const fixedType = computed(() => {
    const role = editing.value
    if (!role || !isEnterprise.value) return null
    return { label: ROLE_TYPE_LABELS[roleTypeOf(role)], where: roleDefinedAt(role) }
  })
  const scopeItems = (Object.keys(ROLE_SCOPE_LABELS) as Role['scope'][]).map(value => ({
    value,
    label: value === 'hierarchy' ? 'The entity and everything below it' : 'Only the entity itself'
  }))

  // Server problems on the permissions field: inactive or unknown names, and the details the
  // API gives for them.
  function permissionFieldErrors(failure: unknown) {
    const details = normalizeApiError(failure).details
    const inactive = Array.isArray(details?.inactive_permissions) ? details.inactive_permissions as string[] : []
    const missing = Array.isArray(details?.missing_permissions) && normalizeApiError(failure).kind === 'validation' ? details.missing_permissions as string[] : []
    const errors: Array<{ name: string, message: string }> = []
    if (inactive.length) errors.push({ name: 'permissions', message: `Not active, so they can't be added: ${inactive.join(', ')}. Remove them, or activate them first.` })
    if (missing.length) errors.push({ name: 'permissions', message: `These permissions don't exist: ${missing.join(', ')}.` })
    return errors
  }

  const createRole = useCreateRole()
  const saveRole = useSaveRole()

  async function create(data: CreateRoleSchema) {
    const roleType = isEnterprise.value ? data.role_type : 'global'
    const res = await run(() => createRole.mutateAsync({
      name: data.name,
      display_name: data.display_name,
      description: data.description || undefined,
      permissions: data.permissions,
      is_global: roleType === 'global',
      root_entity_id: roleType === 'root' ? data.root_entity_id : null,
      scope_entity_id: roleType === 'entity' ? data.scope_entity_id : null,
      // Only an entity-local role's scope has an effect; others keep the default.
      scope: roleType === 'entity' ? data.scope : 'hierarchy',
      is_auto_assigned: roleType === 'entity' ? data.is_auto_assigned : false,
      status: data.status,
      assignable_at_types: isEnterprise.value ? data.assignable_at_types : []
    }), {
      success: 'Role created',
      error: 'Could not create role',
      form,
      inline: error,
      fieldErrors: permissionFieldErrors
    })
    if (res.ok) {
      open.value = false
      emit.created(res.data)
    }
  }

  async function save(role: Role) {
    if (!changes.dirty.value) {
      open.value = false
      return
    }
    const { permissions: _permissions, ...rest } = changes.patch.value
    const patch: Omit<UpdateRoleInput, 'permissions'> = { ...rest }
    // Fields that mean nothing for this role's type are never sent.
    if (editType.value !== 'entity') {
      delete patch.scope
      delete patch.is_auto_assigned
    }
    if (!isEnterprise.value) delete patch.assignable_at_types
    const baseline = (changes.baseline.value?.permissions as string[] | undefined) ?? role.permissions
    const { added, removed } = rolePermissionChanges(baseline, state.permissions)
    const progress: { saved: Role | null } = { saved: null }
    const res = await run(() => saveRole.mutateAsync({ roleId: role.id, patch, add: added, remove: removed, progress }), {
      success: 'Role updated',
      error: () => (progress.saved
        ? { title: 'Some changes were saved', description: 'The rest could not be saved. Save again to retry them.' }
        : 'Could not update role'),
      form,
      inline: error,
      fieldErrors: permissionFieldErrors,
      onNotFound: () => {
        open.value = false
      }
    })
    if (res.ok) {
      open.value = false
      if (res.data) emit.saved(res.data)
      return
    }
    // Saved part-way: what reached the server is the new baseline, so a retry sends the rest.
    if (progress.saved) changes.baseline.value = wireOf(progress.saved)
  }
  function wireOf(role: Role) {
    const s = formFrom(role)
    return {
      display_name: s.display_name.trim(),
      description: s.description.trim(),
      permissions: [...s.permissions].sort(),
      status: s.status,
      scope: s.scope,
      is_auto_assigned: s.is_auto_assigned,
      assignable_at_types: [...s.assignable_at_types].sort()
    }
  }

  async function onSubmit(event: FormSubmitEvent<CreateRoleSchema | UpdateRoleSchema>) {
    const role = editing.value
    if (role) await save(role)
    else await create(event.data as CreateRoleSchema)
  }

  return {
    mode,
    schema,
    state,
    error,
    title,
    submitLabel,
    dirty: computed(() => (mode.value === 'edit' ? changes.dirty.value : undefined)),
    showType,
    typeItems,
    fixedType,
    editType,
    rootItems,
    anchoredRootId,
    noRoleType,
    entityTypeItems,
    addEntityType,
    scopeItems,
    onNameInput,
    delegationNote,
    selfDemotion,
    removedPermissions,
    isEnterprise,
    onSubmit
  }
}
