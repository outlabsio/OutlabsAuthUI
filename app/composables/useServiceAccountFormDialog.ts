import type { MaybeRefOrGetter, Ref } from 'vue'
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import { useQuery } from '@pinia/colada'
import { principalGrantableScopesQuery, useCreatePrincipal, useUpdatePrincipal } from '~/queries/api-keys'
import { serviceAccountSchema, type ServiceAccountFormState, type ServiceAccountSchema } from '~/schemas/api-key'
import type { ActionError } from '~/composables/useApiAction'
import type { ServiceAccountFormTarget } from '~/composables/useServiceAccountActions'
import type { CreatePrincipalInput, IntegrationPrincipal, UpdatePrincipalInput } from '~/types/api-key'
import type { RoleReference } from '~/types/role'
import { directScopesHelp, principalScope, scopesBeyondGrant, scopesBeyondGrantErrors, type ServiceAccountScope } from '~/utils/service-accounts'

// The service-account create / edit dialog behind <AppServiceAccountFormDialog> (F-026, F-079,
// F-084, F-115, F-182). Called by the component itself, so useDialogForm('serviceAccountDialog')
// resolves its own dialog.
// - The description says where the account lives (platform-wide, or the anchor entity's path).
// - Roles first (F-079): AppRoleAccessEditor over useAssignableRoles — system-wide roles for a
//   platform-wide account (the API accepts only those), the roles available at the anchor for an
//   entity account (not other organizations' roles, F-084); roles the admin cannot delegate are
//   disabled. The preview shows what they grant.
// - Direct scopes are Advanced and restricted: AppPermissionPicker limited to what the server says
//   this admin may grant at the account's scope (GET …/integration-principals/grantable-scopes:
//   the host's system-key allowlist within what the admin holds there). Loading, a failed read
//   (Retry; the picker stays disabled, nothing is guessed) and a refused read are said in place.
// - The whole envelope is checked as the server checks it, on create and on every edit (a rename
//   included): roles whose permissions, or direct scopes, the admin cannot grant are refused on
//   their field (an AppFormDialog `validate` rule), so the server's 400, which does not name the
//   scope, is not the first the admin hears of it. Save waits for the grantable read; the server
//   stays the final word.
// - "Includes child entities" only for entity accounts (the API refuses it platform-wide, F-182).
// - Edit sends only what changed (useDirtyPatch); Save stays disabled until something did.

const blank = (): ServiceAccountFormState => ({ name: '', description: '', role_ids: [], allowed_scopes: [], inherit_from_tree: false })

export function useServiceAccountFormDialog(
  target: MaybeRefOrGetter<ServiceAccountFormTarget | null>,
  open: Ref<boolean>,
  emit: { created: (account: IntegrationPrincipal) => void }
) {
  const { run } = useApiAction()
  const form = useDialogForm('serviceAccountDialog')
  const error = ref<ActionError | null>(null)

  const mode = computed(() => toValue(target)?.mode ?? 'create')
  const editing = computed<IntegrationPrincipal | null>(() => {
    const t = toValue(target)
    return t?.mode === 'edit' ? t.account : null
  })
  const scope = computed<ServiceAccountScope>(() => {
    const t = toValue(target)
    if (!t) return { kind: 'platform_global' }
    return t.mode === 'edit' ? principalScope(t.account) : t.scope
  })
  const anchorId = computed(() => (scope.value.kind === 'entity' ? scope.value.entityId : null))
  const anchor = useEntityPathLabel(anchorId)
  const isEntity = computed(() => scope.value.kind === 'entity')

  const title = computed(() => (mode.value === 'edit' ? 'Edit service account' : 'New service account'))
  const submitLabel = computed(() => (mode.value === 'edit' ? 'Save changes' : 'Create service account'))
  const description = computed(() => {
    const where = isEntity.value
      ? `Anchored at ${anchor.label.value ?? 'the chosen entity'}: its keys act there${mode.value === 'edit' ? '' : ' (and, if you allow it, in its child entities)'}.`
      : 'Platform-wide: its keys are not limited to an entity.'
    return editing.value ? `${editing.value.name}. ${where}` : where
  })

  // --- Roles (F-079, F-084) ---
  const state = reactive<ServiceAccountFormState>(blank())
  const pool = useAssignableRoles(() => (scope.value.kind === 'entity'
    ? { kind: 'entity', entityId: scope.value.entityId }
    : { kind: 'direct', rootEntityId: null }))
  // Names for roles the account already carries that the pool does not offer (another
  // organization's role, an inactive one): the chips stay readable.
  const knownRoles = computed<RoleReference[]>(() => (editing.value?.role_ids ?? []).flatMap((id) => {
    const role = pool.roleById.value.get(id)
    return role ? [{ id, display_name: role.display_name, name: role.name, permissions: role.permissions }] : []
  }))

  // --- What this admin may grant at the account's scope (F-079) ---
  // Read while the dialog is open: the key dialog of the same account gates the same key on its
  // own open, and neither is on screen otherwise (nothing else observes it).
  const grantable = useQuery(() => ({ ...principalGrantableScopesQuery(scope.value), enabled: open.value }))
  const grantableApiError = useApiError(grantable.error)
  // Known only once read for this scope; a refetch keeps the last answer.
  const grantableSet = computed(() => (grantable.data.value ? new Set(grantable.data.value.grantable_scopes) : null))
  // A refusal (the entity route needs api_key:create at the entity, the platform route a
  // superuser on EnterpriseRBAC) is not a failure to retry: direct scopes are simply not theirs to give.
  const scopesState = computed<'pending' | 'error' | 'denied' | 'success'>(() => {
    if (grantable.status.value === 'error' && !grantable.data.value) return grantableApiError.value?.kind === 'forbidden' ? 'denied' : 'error'
    if (!grantableSet.value) return 'pending'
    return 'success'
  })

  // --- Direct scopes (restricted) ---
  const scopesOpen = ref(false)
  const allowScope = (name: string) => Boolean(grantableSet.value?.has(name))
  const scopesHelp = computed(() => directScopesHelp(grantable.data.value?.system_allowed_action_prefixes ?? []))

  // The envelope rule. Role permissions come from the pool (and the catalog behind it); a role
  // still loading, or one this admin cannot read, is not judged here.
  const roleLabel = (id: string) => {
    const role = pool.roleById.value.get(id)
    return role?.display_name || role?.name || 'A role you can\'t read'
  }
  function validate(): FormError[] {
    const beyond = scopesBeyondGrant({
      roleIds: state.role_ids,
      directScopes: state.allowed_scopes,
      rolePermissions: id => pool.roleById.value.get(id)?.permissions,
      grantable: grantableSet.value
    })
    return scopesBeyondGrantErrors(beyond, roleLabel)
  }
  // Save waits for the answer, so a quick submit cannot pass the rule before it can judge (a read
  // that fails or is refused does not hold it: the server decides then).
  const submitDisabled = computed(() => scopesState.value === 'pending')
  // A refused direct scope sits inside the collapsed Advanced section: open it, so its field and
  // message are on screen.
  function onInvalid() {
    if (validate().some(issue => issue.name === 'allowed_scopes')) scopesOpen.value = true
  }

  // --- Edit: what changed ---
  const changes = useDirtyPatch(state, s => ({
    name: s.name.trim(),
    description: s.description.trim(),
    role_ids: [...s.role_ids].sort(),
    allowed_scopes: [...s.allowed_scopes].sort(),
    ...(isEntity.value ? { inherit_from_tree: s.inherit_from_tree } : {})
  }))

  watch(open, (isOpen) => {
    if (!isOpen) return
    error.value = null
    const account = editing.value
    Object.assign(state, account
      ? {
          name: account.name,
          description: account.description ?? '',
          role_ids: [...account.role_ids],
          allowed_scopes: [...account.allowed_scopes],
          inherit_from_tree: account.inherit_from_tree
        }
      : blank())
    scopesOpen.value = state.allowed_scopes.length > 0
    changes.snapshot()
  }, { immediate: true })

  const create = useCreatePrincipal()
  const update = useUpdatePrincipal()

  async function onSubmit(event: FormSubmitEvent<ServiceAccountSchema>) {
    const data = event.data
    const account = editing.value
    if (!account) {
      const input: CreatePrincipalInput = {
        name: data.name,
        allowed_scopes: [...data.allowed_scopes],
        role_ids: [...data.role_ids],
        ...(data.description ? { description: data.description } : {}),
        ...(isEntity.value ? { inherit_from_tree: data.inherit_from_tree } : {})
      }
      const res = await run(() => create.mutateAsync({ scope: scope.value, input }), {
        success: 'Service account created',
        error: 'Could not create service account',
        form,
        inline: error
      })
      if (res.ok) {
        open.value = false
        emit.created(res.data)
      }
      return
    }
    const input = changes.patch.value as UpdatePrincipalInput
    const res = await run(() => update.mutateAsync({ scope: scope.value, principalId: account.id, input }), {
      success: 'Service account saved',
      error: 'Could not save service account',
      form,
      inline: error,
      // The PATCH names no other record (unknown roles are a 400), so a 404 means the account.
      onNotFound: () => {
        open.value = false
      }
    })
    if (res.ok) open.value = false
  }

  return {
    mode,
    schema: serviceAccountSchema,
    state,
    error,
    title,
    description,
    submitLabel,
    dirty: changes.dirty,
    isEntity,
    anchorName: anchor.name,
    rolesPool: pool.roles,
    rolesPoolStatus: pool.status,
    rolesPoolEmptyText: pool.emptyText,
    rolesPoolTruncated: pool.truncated,
    knownRoles,
    scopesOpen,
    allowScope,
    scopesHelp,
    scopesState,
    scopesLoading: computed(() => grantable.asyncStatus.value === 'loading'),
    scopesError: grantable.error,
    retryScopes: () => void grantable.refetch(),
    validate,
    onInvalid,
    submitDisabled,
    onSubmit
  }
}
