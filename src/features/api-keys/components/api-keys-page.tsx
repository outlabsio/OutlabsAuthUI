import { useMemo, useState } from 'react'

import { useQuery } from '@tanstack/react-query'
import { Check, Copy, KeyRound, ShieldAlert } from 'lucide-react'

import { AppErrorState } from '@/components/app/app-error-state'
import { AppLoadingState } from '@/components/app/app-loading-state'
import { AppPage } from '@/components/app/app-page'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getAuthConfigQueryOptions } from '@/features/auth/api/auth.query-options'
import { useActorPermissions } from '@/features/auth/hooks/use-actor-permissions'
import {
  getEntityApiKeysQueryOptions,
  getIntegrationPrincipalApiKeysQueryOptions,
  getIntegrationPrincipalsQueryOptions,
} from '@/features/api-keys/api/api-keys.query-options'
import { ApiKeysIntegrationsPanel } from '@/features/api-keys/components/api-keys-integrations-panel'
import { ApiKeysInventoryPanel } from '@/features/api-keys/components/api-keys-inventory-panel'
import { IntegrationPrincipalFormDialog } from '@/features/api-keys/components/integration-principal-form-dialog'
import { SystemIntegrationApiKeyFormDialog } from '@/features/api-keys/components/system-integration-api-key-form-dialog'
import { useDeleteEntityApiKeyMutation } from '@/features/api-keys/hooks/use-delete-entity-api-key-mutation'
import { useDeleteIntegrationPrincipalMutation } from '@/features/api-keys/hooks/use-delete-integration-principal-mutation'
import { useDeleteSystemIntegrationApiKeyMutation } from '@/features/api-keys/hooks/use-delete-system-integration-api-key-mutation'
import { useRotateSystemIntegrationApiKeyMutation } from '@/features/api-keys/hooks/use-rotate-system-integration-api-key-mutation'
import type {
  ApiKey,
  CreateApiKeyResponse,
  IntegrationPrincipal,
  IntegrationPrincipalScopeKind,
} from '@/features/api-keys/types/api-keys.types'
import {
  buildOwnerOptions,
  formatToken,
  type ApiKeyStatusFilter,
  type InventoryKeyKindFilter,
} from '@/features/api-keys/utils/api-keys-display'
import {
  getEntitiesQueryOptions,
  getEntityMembersQueryOptions,
} from '@/features/entities/api/entities.query-options'
import { getRolesForEntityQueryOptions, getRolesQueryOptions } from '@/features/roles/api/roles.query-options'
import type { Role } from '@/features/roles/types/roles.types'
import { buildEntityOptions } from '@/features/entities/utils/build-entity-options'
import { getApiErrorMessage } from '@/lib/api/errors'

type TabValue = 'integrations' | 'inventory'

export function ApiKeysPage() {
  const actorPermissions = useActorPermissions()
  const sessionUser = actorPermissions.sessionUser
  const authConfigQuery = useQuery(getAuthConfigQueryOptions())
  const authConfig = authConfigQuery.data
  const apiKeysEnabled = authConfig?.features.api_keys ?? false
  const enterpriseEnabled = authConfig?.features.entity_hierarchy ?? false
  const simpleGlobalKeysEnabled =
    authConfig?.preset === 'SimpleRBAC' &&
    apiKeysEnabled &&
    (authConfig.features.system_api_keys ?? false)
  const supportsSystemKeysWorkspace = enterpriseEnabled || simpleGlobalKeysEnabled

  const canReadApiKeys = actorPermissions.hasAny([
    'api_key:read',
    'api_key:read_tree',
    'api_key:read_all',
  ])
  const canCreateApiKeys = actorPermissions.hasAny([
    'api_key:create',
    'api_key:create_tree',
    'api_key:create_all',
  ])
  const canUpdateApiKeys = actorPermissions.hasAny([
    'api_key:update',
    'api_key:update_tree',
    'api_key:update_all',
  ])
  const canDeleteApiKeys = actorPermissions.hasAny([
    'api_key:delete',
    'api_key:delete_tree',
    'api_key:delete_all',
    'api_key:revoke',
  ])
  const canReadEntities = actorPermissions.hasAny([
    'entity:read',
    'entity:read_tree',
    'entity:read_all',
  ])
  const canManagePlatformPrincipals =
    actorPermissions.isSuperuser || (simpleGlobalKeysEnabled && canReadApiKeys)

  const entitiesQuery = useQuery({
    ...getEntitiesQueryOptions({
      page: 1,
      limit: 1000,
    }),
    enabled: enterpriseEnabled && canReadApiKeys && canReadEntities,
  })

  const entityOptions = useMemo(
    () => buildEntityOptions(entitiesQuery.data?.items ?? []),
    [entitiesQuery.data?.items]
  )

  const [activeTab, setActiveTab] = useState<TabValue>('integrations')
  const [scopeKind, setScopeKind] = useState<IntegrationPrincipalScopeKind>('entity')
  const [selectedEntityId, setSelectedEntityId] = useState<string>('')
  const [principalSearchText, setPrincipalSearchText] = useState('')
  const [selectedPrincipalId, setSelectedPrincipalId] = useState<string | null>(null)
  const [selectedPrincipalKeyId, setSelectedPrincipalKeyId] = useState<string | null>(null)
  const [inventorySearchText, setInventorySearchText] = useState('')
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState<ApiKeyStatusFilter>('all')
  const [inventoryKeyKindFilter, setInventoryKeyKindFilter] = useState<InventoryKeyKindFilter>('all')
  const [selectedInventoryKeyId, setSelectedInventoryKeyId] = useState<string | null>(null)
  const [principalFormState, setPrincipalFormState] = useState<{
    open: boolean
    mode: 'create' | 'edit'
    principal: IntegrationPrincipal | null
  }>({
    open: false,
    mode: 'create',
    principal: null,
  })
  const [systemKeyFormState, setSystemKeyFormState] = useState<{
    open: boolean
    mode: 'create' | 'edit'
    apiKey: ApiKey | null
  }>({
    open: false,
    mode: 'create',
    apiKey: null,
  })
  const [archivePrincipalTarget, setArchivePrincipalTarget] = useState<IntegrationPrincipal | null>(null)
  const [rotateTarget, setRotateTarget] = useState<ApiKey | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null)
  const [revealedSecret, setRevealedSecret] = useState<CreateApiKeyResponse | null>(null)
  const [secretCopied, setSecretCopied] = useState(false)

  const effectiveScopeKind: IntegrationPrincipalScopeKind = simpleGlobalKeysEnabled
    ? 'platform_global'
    : scopeKind
  const pageTitle = simpleGlobalKeysEnabled ? 'API Keys' : 'System API Keys'
  const loadingTitle = simpleGlobalKeysEnabled
    ? 'Loading API keys workspace'
    : 'Loading system API keys workspace'
  const platformGlobalSummary = simpleGlobalKeysEnabled
    ? 'SimpleRBAC platform-global service accounts use API-key permissions for DB-backed key lifecycle management.'
    : 'Platform-global integrations are superuser-only and are meant for global external integrations that need DB-backed key lifecycle management.'
  const platformGlobalUnavailableMessage = simpleGlobalKeysEnabled
    ? 'Platform-global service accounts require API key read permission.'
    : 'Platform-global integrations are only available to superusers.'

  const preferredEntityId =
    sessionUser?.root_entity_id &&
    entityOptions.some((entity) => entity.id === sessionUser.root_entity_id)
      ? sessionUser.root_entity_id
      : entityOptions[0]?.id ?? ''
  const effectiveSelectedEntityId =
    selectedEntityId && entityOptions.some((entity) => entity.id === selectedEntityId)
      ? selectedEntityId
      : preferredEntityId
  const selectedEntity =
    entityOptions.find((entity) => entity.id === effectiveSelectedEntityId) ?? null

  const platformRolesQuery = useQuery({
    ...getRolesQueryOptions({
      page: 1,
      limit: 100,
      isGlobal: true,
    }),
    enabled:
      supportsSystemKeysWorkspace &&
      canReadApiKeys &&
      canManagePlatformPrincipals &&
      effectiveScopeKind === 'platform_global',
  })
  const entityRolesQuery = useQuery({
    ...getRolesForEntityQueryOptions(effectiveSelectedEntityId, {
      page: 1,
      limit: 100,
    }),
    enabled:
      supportsSystemKeysWorkspace &&
      canReadApiKeys &&
      Boolean(effectiveSelectedEntityId) &&
      effectiveScopeKind === 'entity',
  })
  const availableRolesQuery =
    effectiveScopeKind === 'platform_global' ? platformRolesQuery : entityRolesQuery
  const availableRoles = useMemo(
    () => availableRolesQuery.data?.items ?? [],
    [availableRolesQuery.data?.items]
  )
  const roleById = useMemo(
    () => new Map(availableRoles.map((role) => [role.id, role])),
    [availableRoles]
  )

  const membersQuery = useQuery({
    ...getEntityMembersQueryOptions(effectiveSelectedEntityId, {
      page: 1,
      limit: 200,
      includeInactive: true,
    }),
    enabled:
      enterpriseEnabled && canReadApiKeys && Boolean(effectiveSelectedEntityId),
  })
  const ownerOptions = useMemo(
    () => buildOwnerOptions(membersQuery.data ?? []),
    [membersQuery.data]
  )
  const ownerById = useMemo(
    () => new Map(ownerOptions.map((owner) => [owner.id, owner])),
    [ownerOptions]
  )

  const integrationPrincipalsQuery = useQuery({
    ...getIntegrationPrincipalsQueryOptions({
      scopeKind: effectiveScopeKind,
      entityId: effectiveScopeKind === 'entity' ? effectiveSelectedEntityId : undefined,
      page: 1,
      limit: 100,
      search: principalSearchText.trim() || undefined,
    }),
    enabled:
      supportsSystemKeysWorkspace &&
      activeTab === 'integrations' &&
      canReadApiKeys &&
      (effectiveScopeKind === 'platform_global'
        ? canManagePlatformPrincipals
        : Boolean(effectiveSelectedEntityId)),
  })

  const integrationPrincipals = useMemo(
    () => integrationPrincipalsQuery.data?.items ?? [],
    [integrationPrincipalsQuery.data?.items]
  )
  const effectiveSelectedPrincipalId =
    selectedPrincipalId && integrationPrincipals.some((principal) => principal.id === selectedPrincipalId)
      ? selectedPrincipalId
      : integrationPrincipals[0]?.id ?? null
  const activePrincipal =
    integrationPrincipals.find((principal) => principal.id === effectiveSelectedPrincipalId) ?? null
  const activePrincipalRoles = useMemo(
    () =>
      (activePrincipal?.role_ids ?? [])
        .map((roleId) => roleById.get(roleId))
        .filter((role): role is Role => Boolean(role)),
    [activePrincipal?.role_ids, roleById]
  )

  const principalKeysQuery = useQuery({
    ...getIntegrationPrincipalApiKeysQueryOptions({
      scopeKind: effectiveScopeKind,
      entityId: effectiveScopeKind === 'entity' ? effectiveSelectedEntityId : undefined,
      principalId: effectiveSelectedPrincipalId ?? '',
      page: 1,
      limit: 100,
    }),
    enabled:
      supportsSystemKeysWorkspace &&
      activeTab === 'integrations' &&
      canReadApiKeys &&
      Boolean(effectiveSelectedPrincipalId) &&
      (effectiveScopeKind === 'platform_global'
        ? canManagePlatformPrincipals
        : Boolean(effectiveSelectedEntityId)),
  })

  const principalKeys = useMemo(
    () => principalKeysQuery.data?.items ?? [],
    [principalKeysQuery.data?.items]
  )
  const effectiveSelectedPrincipalKeyId =
    selectedPrincipalKeyId && principalKeys.some((key) => key.id === selectedPrincipalKeyId)
      ? selectedPrincipalKeyId
      : principalKeys[0]?.id ?? null
  const activePrincipalKey =
    principalKeys.find((key) => key.id === effectiveSelectedPrincipalKeyId) ?? null

  const inventoryQuery = useQuery({
    ...getEntityApiKeysQueryOptions({
      entityId: effectiveSelectedEntityId,
      page: 1,
      limit: 100,
      status: inventoryStatusFilter === 'all' ? undefined : inventoryStatusFilter,
      keyKind: inventoryKeyKindFilter === 'all' ? undefined : inventoryKeyKindFilter,
      search: inventorySearchText.trim() || undefined,
    }),
    enabled:
      enterpriseEnabled &&
      activeTab === 'inventory' &&
      canReadApiKeys &&
      Boolean(effectiveSelectedEntityId),
  })
  const inventoryKeys = useMemo(
    () => inventoryQuery.data?.items ?? [],
    [inventoryQuery.data?.items]
  )
  const effectiveSelectedInventoryKeyId =
    selectedInventoryKeyId && inventoryKeys.some((apiKey) => apiKey.id === selectedInventoryKeyId)
      ? selectedInventoryKeyId
      : inventoryKeys[0]?.id ?? null
  const activeInventoryKey =
    inventoryKeys.find((apiKey) => apiKey.id === effectiveSelectedInventoryKeyId) ?? null

  const inventoryPrincipalsQuery = useQuery({
    ...getIntegrationPrincipalsQueryOptions({
      scopeKind: 'entity',
      entityId: effectiveSelectedEntityId,
      page: 1,
      limit: 100,
    }),
    enabled:
      enterpriseEnabled &&
      activeTab === 'inventory' &&
      canReadApiKeys &&
      Boolean(effectiveSelectedEntityId),
  })
  const inventoryPrincipalById = useMemo(
    () =>
      new Map(
        (inventoryPrincipalsQuery.data?.items ?? []).map((principal) => [principal.id, principal])
      ),
    [inventoryPrincipalsQuery.data?.items]
  )

  const archivePrincipalMutation = useDeleteIntegrationPrincipalMutation()
  const rotateSystemKeyMutation = useRotateSystemIntegrationApiKeyMutation()
  const revokeSystemKeyMutation = useDeleteSystemIntegrationApiKeyMutation()
  const revokeInventoryKeyMutation = useDeleteEntityApiKeyMutation()

  function openSecretDialog(apiKey: CreateApiKeyResponse) {
    setSecretCopied(false)
    setRevealedSecret(apiKey)
  }

  function closeSecretDialog() {
    setSecretCopied(false)
    setRevealedSecret(null)
  }

  function formatInventoryOwnerLabel(apiKey: ApiKey) {
    if (apiKey.owner_type === 'user') {
      return ownerById.get(apiKey.owner_id ?? '')?.label ?? apiKey.owner_id ?? 'Unknown user'
    }

    if (apiKey.owner_type === 'integration_principal') {
      return (
        inventoryPrincipalById.get(apiKey.owner_id ?? '')?.name ??
        apiKey.owner_id ??
        'Unknown integration principal'
      )
    }

    return apiKey.owner_id ?? 'Unknown owner'
  }

  function formatInventoryOwnerSubtitle(apiKey: ApiKey) {
    if (apiKey.owner_type === 'user') {
      return ownerById.get(apiKey.owner_id ?? '')?.subtitle ?? 'User owner'
    }

    if (apiKey.owner_type === 'integration_principal') {
      const principal = inventoryPrincipalById.get(apiKey.owner_id ?? '')
      if (principal) {
        return principal.description || formatToken(principal.scope_kind)
      }

      return 'Integration principal owner'
    }

    return 'Owner details unavailable'
  }

  const pageError = actorPermissions.error ?? authConfigQuery.error

  if (actorPermissions.isPending || authConfigQuery.isPending) {
    return <AppLoadingState title={loadingTitle} />
  }

  if (pageError) {
    return (
      <AppPage title={pageTitle} hideTitle padded>
        <AppErrorState>
          {getApiErrorMessage(pageError, `The ${pageTitle.toLowerCase()} workspace could not load data from the auth API.`)}
        </AppErrorState>
      </AppPage>
    )
  }

  if (!apiKeysEnabled) {
    return (
      <AppPage title={pageTitle} hideTitle padded>
        <div className="rounded-2xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
          The current backend preset does not advertise API key support.
        </div>
      </AppPage>
    )
  }

  if (!supportsSystemKeysWorkspace) {
    return (
      <AppPage title={pageTitle} hideTitle padded>
        <div className="rounded-2xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
          System integration keys are not available for the current backend preset.
        </div>
      </AppPage>
    )
  }

  if (!canReadApiKeys) {
    return (
      <AppPage title={pageTitle} hideTitle padded>
        <div className="rounded-2xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
          Insufficient permissions. You need API key read access to use this workspace.
        </div>
      </AppPage>
    )
  }

  const shellAction =
    activeTab === 'integrations' ? (
      <div className="flex flex-wrap gap-2">
        {canCreateApiKeys && activePrincipal ? (
          <Button
            type="button"
            variant="outline"
            disabled={
              activePrincipal.status !== 'active' ||
              (activePrincipal.scope_kind === 'entity' && !effectiveSelectedEntityId)
            }
            onClick={() =>
              setSystemKeyFormState({
                open: true,
                mode: 'create',
                apiKey: null,
              })
            }
          >
            <KeyRound className="size-4" />
            Create machine key
          </Button>
        ) : null}
        {canCreateApiKeys ? (
          <Button
            type="button"
            disabled={
              effectiveScopeKind === 'entity'
                ? !effectiveSelectedEntityId
                : !canManagePlatformPrincipals
            }
            onClick={() =>
              setPrincipalFormState({
                open: true,
                mode: 'create',
                principal: null,
              })
            }
          >
            <ShieldAlert className="size-4" />
            Create service account
          </Button>
        ) : null}
      </div>
    ) : undefined

  return (
    <>
      <AppPage title={pageTitle} hideTitle padded shellAction={shellAction}>
        <div className="space-y-4">
              <Tabs
                value={activeTab}
                onValueChange={(value) => setActiveTab(value as TabValue)}
                className="space-y-4"
              >
                {enterpriseEnabled ? (
                  <TabsList>
                    <TabsTrigger value="integrations">Integrations</TabsTrigger>
                    <TabsTrigger value="inventory">Entity inventory</TabsTrigger>
                  </TabsList>
                ) : null}
                <TabsContent value="integrations" className="space-y-4 pt-1">
                  <ApiKeysIntegrationsPanel
                    enterpriseEnabled={enterpriseEnabled}
                    scopeKind={scopeKind}
                    setScopeKind={setScopeKind}
                    effectiveScopeKind={effectiveScopeKind}
                    canManagePlatformPrincipals={canManagePlatformPrincipals}
                    canCreateApiKeys={canCreateApiKeys}
                    canUpdateApiKeys={canUpdateApiKeys}
                    canDeleteApiKeys={canDeleteApiKeys}
                    entityOptions={entityOptions}
                    selectedEntity={selectedEntity}
                    setSelectedEntityId={setSelectedEntityId}
                    setSelectedPrincipalId={setSelectedPrincipalId}
                    setSelectedPrincipalKeyId={setSelectedPrincipalKeyId}
                    setSelectedInventoryKeyId={setSelectedInventoryKeyId}
                    entitiesQueryIsLoading={entitiesQuery.isLoading}
                    platformGlobalSummary={platformGlobalSummary}
                    platformGlobalUnavailableMessage={platformGlobalUnavailableMessage}
                    effectiveSelectedEntityId={effectiveSelectedEntityId}
                    principalSearchText={principalSearchText}
                    setPrincipalSearchText={setPrincipalSearchText}
                    integrationPrincipalsQuery={integrationPrincipalsQuery}
                    integrationPrincipals={integrationPrincipals}
                    activePrincipal={activePrincipal}
                    activePrincipalRoles={activePrincipalRoles}
                    principalKeysQuery={principalKeysQuery}
                    principalKeys={principalKeys}
                    activePrincipalKey={activePrincipalKey}
                    setPrincipalFormState={setPrincipalFormState}
                    setSystemKeyFormState={setSystemKeyFormState}
                    setArchivePrincipalTarget={setArchivePrincipalTarget}
                    setRotateTarget={setRotateTarget}
                    setDeleteTarget={setDeleteTarget}
                  />
                </TabsContent>

                {enterpriseEnabled ? (
                  <TabsContent value="inventory" className="space-y-4 pt-1">
                    <ApiKeysInventoryPanel
                      effectiveSelectedEntityId={effectiveSelectedEntityId}
                      entityOptions={entityOptions}
                      selectedEntity={selectedEntity}
                      setSelectedEntityId={setSelectedEntityId}
                      setSelectedInventoryKeyId={setSelectedInventoryKeyId}
                      entitiesQueryIsLoading={entitiesQuery.isLoading}
                      inventoryStatusFilter={inventoryStatusFilter}
                      setInventoryStatusFilter={setInventoryStatusFilter}
                      inventoryKeyKindFilter={inventoryKeyKindFilter}
                      setInventoryKeyKindFilter={setInventoryKeyKindFilter}
                      inventorySearchText={inventorySearchText}
                      setInventorySearchText={setInventorySearchText}
                      inventoryQuery={inventoryQuery}
                      inventoryKeys={inventoryKeys}
                      activeInventoryKey={activeInventoryKey}
                      canDeleteApiKeys={canDeleteApiKeys}
                      formatInventoryOwnerLabel={formatInventoryOwnerLabel}
                      formatInventoryOwnerSubtitle={formatInventoryOwnerSubtitle}
                      setDeleteTarget={setDeleteTarget}
                    />
                  </TabsContent>
                ) : null}
              </Tabs>
        </div>
      </AppPage>

      <IntegrationPrincipalFormDialog
        open={principalFormState.open}
        mode={principalFormState.mode}
        scopeKind={effectiveScopeKind}
        entityId={effectiveScopeKind === 'entity' ? effectiveSelectedEntityId : undefined}
        entityLabel={selectedEntity?.pathLabel ?? selectedEntity?.title ?? null}
        principal={principalFormState.principal}
        onOpenChange={(open) =>
          setPrincipalFormState((current) => ({
            ...current,
            open,
          }))
        }
        onCreated={(principal) => {
          setSelectedPrincipalId(principal.id)
          setPrincipalFormState({
            open: false,
            mode: 'create',
            principal: null,
          })
        }}
        onUpdated={(principal) => {
          setSelectedPrincipalId(principal.id)
          setPrincipalFormState({
            open: false,
            mode: 'edit',
            principal: null,
          })
        }}
      />

      <SystemIntegrationApiKeyFormDialog
        open={systemKeyFormState.open}
        mode={systemKeyFormState.mode}
        scopeKind={effectiveScopeKind}
        entityId={effectiveScopeKind === 'entity' ? effectiveSelectedEntityId : undefined}
        entityLabel={selectedEntity?.pathLabel ?? selectedEntity?.title ?? null}
        principal={activePrincipal}
        apiKey={systemKeyFormState.apiKey}
        onOpenChange={(open) =>
          setSystemKeyFormState((current) => ({
            ...current,
            open,
          }))
        }
        onCreated={(apiKey) => {
          setSelectedPrincipalKeyId(apiKey.id)
          openSecretDialog(apiKey)
          setSystemKeyFormState({
            open: false,
            mode: 'create',
            apiKey: null,
          })
        }}
        onUpdated={(apiKey) => {
          setSelectedPrincipalKeyId(apiKey.id)
          setSystemKeyFormState({
            open: false,
            mode: 'edit',
            apiKey: null,
          })
        }}
      />

      <Dialog open={Boolean(revealedSecret)} onOpenChange={(open) => !open && closeSecretDialog()}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Store the new API key now</DialogTitle>
            <DialogDescription>
              The backend will not show this secret again. Copy it to your password manager or
              deployment system before closing this dialog.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-2xl border bg-muted/20 px-4 py-4">
              <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Full secret
              </div>
              <div className="mt-2 break-all rounded-xl bg-background px-3 py-3 font-mono text-sm">
                {revealedSecret?.api_key}
              </div>
            </div>
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
              Rotation creates a replacement key and revokes the old secret immediately.
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className={
                secretCopied
                  ? 'border-emerald-600/30 bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/15 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/20'
                  : undefined
              }
              disabled={!revealedSecret?.api_key}
              onClick={async () => {
                if (!revealedSecret?.api_key) {
                  return
                }

                try {
                  await navigator.clipboard.writeText(revealedSecret.api_key)
                  setSecretCopied(true)
                } catch {
                  return
                }
              }}
            >
              {secretCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {secretCopied ? 'Copied' : 'Copy secret'}
            </Button>
            <Button type="button" onClick={closeSecretDialog}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(archivePrincipalTarget)} onOpenChange={(open) => !open && setArchivePrincipalTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive service account</DialogTitle>
            <DialogDescription>
              Archiving this service account revokes its active keys and removes it from normal
              create/update flows.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setArchivePrincipalTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={archivePrincipalMutation.isPending || !archivePrincipalTarget}
              onClick={async () => {
                if (!archivePrincipalTarget) {
                  return
                }

                try {
                  await archivePrincipalMutation.mutateAsync({
                    scopeKind: archivePrincipalTarget.scope_kind,
                    entityId:
                      archivePrincipalTarget.scope_kind === 'entity'
                        ? archivePrincipalTarget.anchor_entity_id ?? undefined
                        : undefined,
                    principalId: archivePrincipalTarget.id,
                  })
                  setArchivePrincipalTarget(null)
                } catch {
                  return
                }
              }}
            >
              {archivePrincipalMutation.isPending ? 'Archiving...' : 'Archive service account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rotateTarget)} onOpenChange={(open) => !open && setRotateTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rotate API key</DialogTitle>
            <DialogDescription>
              Rotating this key creates a replacement secret and revokes the current secret
              immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRotateTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={rotateSystemKeyMutation.isPending || !rotateTarget}
              onClick={async () => {
                if (!rotateTarget || !activePrincipal) {
                  return
                }

                try {
                  const createdKey = await rotateSystemKeyMutation.mutateAsync({
                    scopeKind: effectiveScopeKind,
                    entityId:
                      effectiveScopeKind === 'entity'
                        ? effectiveSelectedEntityId
                        : undefined,
                    principalId: activePrincipal.id,
                    keyId: rotateTarget.id,
                  })
                  setSelectedPrincipalKeyId(createdKey.id)
                  openSecretDialog(createdKey)
                  setRotateTarget(null)
                } catch {
                  return
                }
              }}
            >
              {rotateSystemKeyMutation.isPending ? 'Rotating...' : 'Rotate key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke API key</DialogTitle>
            <DialogDescription>
              Revoking this key immediately disables the current secret. This action is intended for
              incident response and explicit lifecycle control.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                revokeSystemKeyMutation.isPending || revokeInventoryKeyMutation.isPending || !deleteTarget
              }
              onClick={async () => {
                if (!deleteTarget) {
                  return
                }

                try {
                  if (
                    activeTab === 'integrations' &&
                    deleteTarget.owner_type === 'integration_principal'
                  ) {
                    if (!activePrincipal) {
                      return
                    }

                    await revokeSystemKeyMutation.mutateAsync({
                      scopeKind: effectiveScopeKind,
                      entityId:
                        effectiveScopeKind === 'entity'
                          ? effectiveSelectedEntityId
                          : undefined,
                      principalId: activePrincipal.id,
                      keyId: deleteTarget.id,
                    })
                  } else {
                    await revokeInventoryKeyMutation.mutateAsync({
                      entityId: effectiveSelectedEntityId,
                      keyId: deleteTarget.id,
                    })
                  }

                  setDeleteTarget(null)
                } catch {
                  return
                }
              }}
            >
              {revokeSystemKeyMutation.isPending || revokeInventoryKeyMutation.isPending
                ? 'Revoking...'
                : 'Revoke key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
