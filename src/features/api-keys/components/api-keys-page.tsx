import { useMemo, useState } from 'react'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, KeyRound, RefreshCcw, ShieldAlert, Trash2 } from 'lucide-react'

import { AppErrorState } from '@/components/app/app-error-state'
import { AppLoadingState } from '@/components/app/app-loading-state'
import { AppPage } from '@/components/app/app-page'
import { AppStatusBadge } from '@/components/app/app-status-badge'
import type { AppStatusTone } from '@/components/app/app-status'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  getAuthConfigQueryOptions,
  getMyPermissionsQueryOptions,
} from '@/features/auth/api/auth.query-options'
import { useSessionQuery } from '@/features/auth/hooks/use-session-query'
import { apiKeysKeys } from '@/features/api-keys/api/api-keys.keys'
import {
  getEntityApiKeysQueryOptions,
  getIntegrationPrincipalApiKeysQueryOptions,
  getIntegrationPrincipalsQueryOptions,
} from '@/features/api-keys/api/api-keys.query-options'
import { deleteEntityApiKey } from '@/features/api-keys/api/delete-entity-api-key'
import {
  deleteIntegrationPrincipal,
  deleteSystemIntegrationApiKey,
  rotateSystemIntegrationApiKey,
} from '@/features/api-keys/api/integration-principals'
import { IntegrationPrincipalFormDialog } from '@/features/api-keys/components/integration-principal-form-dialog'
import { SystemIntegrationApiKeyFormDialog } from '@/features/api-keys/components/system-integration-api-key-form-dialog'
import type {
  ApiKey,
  ApiKeyKind,
  ApiKeyStatus,
  CreateApiKeyResponse,
  IntegrationPrincipal,
  IntegrationPrincipalScopeKind,
} from '@/features/api-keys/types/api-keys.types'
import { formatApiKeyRateLimitPerMinute } from '@/features/api-keys/utils/rate-limit'
import {
  getEntitiesQueryOptions,
  getEntityMembersQueryOptions,
} from '@/features/entities/api/entities.query-options'
import { getRolesForEntityQueryOptions, getRolesQueryOptions } from '@/features/roles/api/roles.query-options'
import type { Role } from '@/features/roles/types/roles.types'
import { buildEntityOptions } from '@/features/entities/utils/build-entity-options'
import { getApiErrorMessage } from '@/lib/api/errors'
import { withMutationToast } from '@/lib/query/mutation-toast'

type TabValue = 'integrations' | 'inventory'
type InventoryKeyKindFilter = 'all' | ApiKeyKind
type ApiKeyStatusFilter = 'all' | ApiKeyStatus
type EntityOwnerOption = {
  id: string
  label: string
  subtitle: string
}

function formatDateTime(value?: string | null, fallback = 'Never') {
  if (!value) {
    return fallback
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return fallback
  }
}

function formatToken(value: string) {
  return value
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getApiKeyStatusTone(status: ApiKeyStatus): AppStatusTone {
  switch (status) {
    case 'active':
      return 'success'
    case 'suspended':
      return 'warning'
    case 'expired':
      return 'warning'
    case 'revoked':
      return 'error'
    default:
      return 'neutral'
  }
}

function getPrincipalStatusTone(status: IntegrationPrincipal['status']): AppStatusTone {
  switch (status) {
    case 'active':
      return 'success'
    case 'inactive':
      return 'warning'
    case 'archived':
      return 'neutral'
    default:
      return 'neutral'
  }
}

function getEffectivenessTone(apiKey: ApiKey): AppStatusTone {
  if (apiKey.status === 'revoked') {
    return 'error'
  }

  return apiKey.is_currently_effective ? 'success' : 'warning'
}

function formatOwnerType(ownerType?: ApiKey['owner_type'] | null) {
  if (!ownerType) {
    return 'Unknown owner'
  }

  return formatToken(ownerType)
}

function describeKeyPermissions(apiKey: ApiKey, principal?: IntegrationPrincipal | null) {
  if (apiKey.scopes.length > 0) {
    return apiKey.scopes
  }

  return principal?.effective_allowed_scopes ?? principal?.allowed_scopes ?? []
}

function hasAnyPermission(permissionNames: Set<string>, candidates: string[]) {
  return candidates.some((candidate) => permissionNames.has(candidate))
}

function buildOwnerOptions(
  members: Array<{
    user_id: string
    user_email: string
    user_first_name?: string | null
    user_last_name?: string | null
  }>
) {
  const deduped = new Map<string, EntityOwnerOption>()

  for (const member of members) {
    const fullName = [member.user_first_name, member.user_last_name]
      .filter(Boolean)
      .join(' ')
      .trim()

    deduped.set(member.user_id, {
      id: member.user_id,
      label: fullName || member.user_email,
      subtitle: fullName ? member.user_email : 'Entity member',
    })
  }

  return [...deduped.values()].sort((left, right) => left.label.localeCompare(right.label))
}

export function ApiKeysPage() {
  const queryClient = useQueryClient()
  const sessionQuery = useSessionQuery()
  const sessionUser = sessionQuery.data ?? null
  const authConfigQuery = useQuery(getAuthConfigQueryOptions())
  const authConfig = authConfigQuery.data
  const apiKeysEnabled = authConfig?.features.api_keys ?? false
  const enterpriseEnabled = authConfig?.features.entity_hierarchy ?? false
  const simpleGlobalKeysEnabled =
    authConfig?.preset === 'SimpleRBAC' &&
    apiKeysEnabled &&
    (authConfig.features.system_api_keys ?? false)
  const supportsSystemKeysWorkspace = enterpriseEnabled || simpleGlobalKeysEnabled
  const actorPermissionsQuery = useQuery({
    ...getMyPermissionsQueryOptions(),
    enabled: Boolean(sessionUser?.id),
  })

  const actorPermissionNames = useMemo(
    () => new Set(actorPermissionsQuery.data ?? []),
    [actorPermissionsQuery.data]
  )

  const canReadApiKeys =
    Boolean(sessionUser?.is_superuser) ||
    hasAnyPermission(actorPermissionNames, ['api_key:read', 'api_key:read_tree', 'api_key:read_all'])
  const canCreateApiKeys =
    Boolean(sessionUser?.is_superuser) ||
    hasAnyPermission(actorPermissionNames, ['api_key:create', 'api_key:create_tree', 'api_key:create_all'])
  const canUpdateApiKeys =
    Boolean(sessionUser?.is_superuser) ||
    hasAnyPermission(actorPermissionNames, ['api_key:update', 'api_key:update_tree', 'api_key:update_all'])
  const canDeleteApiKeys =
    Boolean(sessionUser?.is_superuser) ||
    hasAnyPermission(actorPermissionNames, [
      'api_key:delete',
      'api_key:delete_tree',
      'api_key:delete_all',
      'api_key:revoke',
    ])
  const canReadEntities =
    Boolean(sessionUser?.is_superuser) ||
    hasAnyPermission(actorPermissionNames, ['entity:read', 'entity:read_tree', 'entity:read_all'])
  const canManagePlatformPrincipals =
    Boolean(sessionUser?.is_superuser) ||
    (simpleGlobalKeysEnabled && canReadApiKeys)

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
  const pageSummary = simpleGlobalKeysEnabled
    ? 'Manage platform-global service accounts and machine API keys for SimpleRBAC backends.'
    : 'Manage EnterpriseRBAC service accounts, machine API keys, and entity key inventory from one place.'
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

  const archivePrincipalMutation = useMutation({
    mutationKey: apiKeysKeys.all,
    mutationFn: (principal: IntegrationPrincipal) =>
      deleteIntegrationPrincipal({
        scopeKind: principal.scope_kind,
        entityId: principal.scope_kind === 'entity' ? principal.anchor_entity_id ?? undefined : undefined,
        principalId: principal.id,
      }),
    meta: withMutationToast({
      error: 'The integration principal could not be archived.',
      success: 'Integration principal archived.',
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: apiKeysKeys.all,
      })
    },
  })

  const rotateSystemKeyMutation = useMutation({
    mutationKey: apiKeysKeys.all,
    mutationFn: (apiKey: ApiKey) => {
      if (!activePrincipal) {
        throw new Error('integration principal missing')
      }

      return rotateSystemIntegrationApiKey({
        scopeKind: effectiveScopeKind,
        entityId: effectiveScopeKind === 'entity' ? effectiveSelectedEntityId : undefined,
        principalId: activePrincipal.id,
        keyId: apiKey.id,
      })
    },
    meta: withMutationToast({
      error: 'The system integration key could not be rotated.',
      success: 'System integration key rotated.',
    }),
    onSuccess: (createdKey) => {
      setSelectedPrincipalKeyId(createdKey.id)
      openSecretDialog(createdKey)
      void queryClient.invalidateQueries({
        queryKey: apiKeysKeys.all,
      })
    },
  })

  const revokeSystemKeyMutation = useMutation({
    mutationKey: apiKeysKeys.all,
    mutationFn: (apiKey: ApiKey) => {
      if (!activePrincipal) {
        throw new Error('integration principal missing')
      }

      return deleteSystemIntegrationApiKey({
        scopeKind: effectiveScopeKind,
        entityId: effectiveScopeKind === 'entity' ? effectiveSelectedEntityId : undefined,
        principalId: activePrincipal.id,
        keyId: apiKey.id,
      })
    },
    meta: withMutationToast({
      error: 'The system integration key could not be revoked.',
      success: 'System integration key revoked.',
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: apiKeysKeys.all,
      })
    },
  })

  const revokeInventoryKeyMutation = useMutation({
    mutationKey: apiKeysKeys.all,
    mutationFn: (apiKey: ApiKey) =>
      deleteEntityApiKey({
        entityId: effectiveSelectedEntityId,
        keyId: apiKey.id,
      }),
    meta: withMutationToast({
      error: 'The API key could not be revoked.',
      success: 'API key revoked.',
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: apiKeysKeys.all,
      })
    },
  })

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

  const pageError = sessionQuery.error ?? actorPermissionsQuery.error ?? authConfigQuery.error

  if (sessionQuery.isPending || actorPermissionsQuery.isPending || authConfigQuery.isPending) {
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
        <div className="grid gap-4">
          <Card>
            <CardHeader className="gap-3">
              <div className="space-y-1">
                <CardTitle className="text-xl">{pageTitle}</CardTitle>
                <p className="text-sm text-muted-foreground">{pageSummary}</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
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
                  <Card>
                    <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                      {enterpriseEnabled ? (
                        <div className="space-y-2">
                          <Label>Scope model</Label>
                          <Select
                            value={scopeKind}
                            onValueChange={(value) => {
                              setScopeKind(value as IntegrationPrincipalScopeKind)
                              setSelectedPrincipalId(null)
                              setSelectedPrincipalKeyId(null)
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select integration scope" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="entity">Entity scoped</SelectItem>
                              <SelectItem
                                value="platform_global"
                                disabled={!canManagePlatformPrincipals}
                              >
                                Platform global
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div className="rounded-2xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                          SimpleRBAC exposes one admin-managed machine-credential model:
                          platform-global service accounts with owned API keys.
                        </div>
                      )}

                      {effectiveScopeKind === 'entity' ? (
                        <div className="space-y-2">
                          <Label htmlFor="api-keys-entity">Anchor entity</Label>
                          <Combobox
                            items={entityOptions}
                            itemToStringValue={(item) =>
                              item
                                ? `${item.title} ${item.pathLabel} ${item.entityTypeLabel} ${item.entityClassLabel}`
                                : ''
                            }
                            value={selectedEntity}
                            onValueChange={(value) => {
                              setSelectedEntityId(value?.id ?? '')
                              setSelectedPrincipalId(null)
                              setSelectedPrincipalKeyId(null)
                              setSelectedInventoryKeyId(null)
                            }}
                            disabled={entitiesQuery.isLoading || entityOptions.length === 0}
                          >
                            <ComboboxInput
                              id="api-keys-entity"
                              placeholder="Search organization, region, office, or team"
                              className="w-full"
                              showClear
                            />
                            <ComboboxContent align="start">
                              <ComboboxEmpty>No entities found.</ComboboxEmpty>
                              <ComboboxList>
                                {(option) => (
                                  <ComboboxItem
                                    key={option.id}
                                    value={option}
                                    className="items-start py-2.5"
                                  >
                                    <div className="flex min-w-0 flex-col gap-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-medium">{option.title}</span>
                                        <Badge variant="outline">{option.entityTypeLabel}</Badge>
                                      </div>
                                      <span className="truncate text-xs text-muted-foreground">
                                        {option.pathLabel}
                                      </span>
                                    </div>
                                  </ComboboxItem>
                                )}
                              </ComboboxList>
                            </ComboboxContent>
                          </Combobox>
                        </div>
                      ) : (
                        <div className="rounded-2xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                          {platformGlobalSummary}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {effectiveScopeKind === 'platform_global' && !canManagePlatformPrincipals ? (
                    <div className="rounded-2xl border border-dashed px-4 py-8 text-sm text-muted-foreground">
                      {platformGlobalUnavailableMessage}
                    </div>
                  ) : effectiveScopeKind === 'entity' && !effectiveSelectedEntityId ? (
                    <div className="rounded-2xl border border-dashed px-4 py-8 text-sm text-muted-foreground">
                      Select an entity to load service accounts.
                    </div>
                  ) : (
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                      <Card>
                        <CardHeader className="gap-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <CardTitle className="text-xl">Service accounts</CardTitle>
                              <div className="text-sm text-muted-foreground">
                                {effectiveScopeKind === 'entity'
                                  ? selectedEntity?.pathLabel ?? 'Selected entity scope'
                                  : 'Platform-global machine principals'}
                              </div>
                            </div>
                            <Badge variant="outline">
                              {integrationPrincipalsQuery.data?.total ?? 0} total
                            </Badge>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="integration-principal-search">Search</Label>
                              <Input
                                id="integration-principal-search"
                                placeholder="Search service-account names"
                                value={principalSearchText}
                                onChange={(event) => {
                                  setPrincipalSearchText(event.target.value)
                                setSelectedPrincipalId(null)
                                setSelectedPrincipalKeyId(null)
                              }}
                            />
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {integrationPrincipalsQuery.isLoading ? (
                            <AppLoadingState title="Loading service accounts" />
                          ) : integrationPrincipalsQuery.isError ? (
                            <AppErrorState>
                              {getApiErrorMessage(
                                integrationPrincipalsQuery.error,
                                'The service-account list could not be loaded.'
                              )}
                            </AppErrorState>
                          ) : integrationPrincipals.length === 0 ? (
                            <div className="rounded-xl border border-dashed px-4 py-8 text-sm text-muted-foreground">
                              No service accounts match the current scope and search.
                            </div>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Name</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead>Roles</TableHead>
                                  <TableHead>Permissions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {integrationPrincipals.map((principal) => {
                                  const isSelected = principal.id === activePrincipal?.id

                                  return (
                                    <TableRow
                                      key={principal.id}
                                      data-state={isSelected ? 'selected' : undefined}
                                      className="cursor-pointer"
                                      onClick={() => {
                                        setSelectedPrincipalId(principal.id)
                                        setSelectedPrincipalKeyId(null)
                                      }}
                                    >
                                      <TableCell>
                                        <div className="space-y-1">
                                          <div className="font-medium">{principal.name}</div>
                                          <div className="text-xs text-muted-foreground">
                                            {principal.description || 'No description provided.'}
                                          </div>
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <AppStatusBadge tone={getPrincipalStatusTone(principal.status)}>
                                          {formatToken(principal.status)}
                                        </AppStatusBadge>
                                      </TableCell>
                                      <TableCell>{principal.role_ids.length}</TableCell>
                                      <TableCell>{principal.effective_allowed_scopes.length}</TableCell>
                                    </TableRow>
                                  )
                                })}
                              </TableBody>
                            </Table>
                          )}
                        </CardContent>
                      </Card>

                      <div className="grid gap-4">
                        <Card>
                          <CardHeader className="gap-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <CardTitle className="text-xl">
                                  {activePrincipal ? activePrincipal.name : 'Service-account details'}
                              </CardTitle>
                              <div className="text-sm text-muted-foreground">
                                  {activePrincipal
                                    ? 'Inspect roles, derived permissions, lifecycle, and owned keys.'
                                    : 'Select a service account to inspect its details.'}
                              </div>
                            </div>
                              {activePrincipal ? (
                                <div className="flex flex-wrap gap-2">
                                  <AppStatusBadge tone={getPrincipalStatusTone(activePrincipal.status)}>
                                    {formatToken(activePrincipal.status)}
                                  </AppStatusBadge>
                                  <Badge variant="outline">
                                    {formatToken(activePrincipal.scope_kind)}
                                  </Badge>
                                </div>
                              ) : null}
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            {!activePrincipal ? (
                              <div className="rounded-xl border border-dashed px-4 py-8 text-sm text-muted-foreground">
                                Select a service account from the table to inspect its details.
                              </div>
                            ) : (
                              <>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div className="rounded-2xl border bg-muted/20 px-4 py-3">
                                    <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                      Scope
                                    </div>
                                    <div className="mt-1 text-sm">
                                      {activePrincipal.scope_kind === 'entity'
                                        ? selectedEntity?.pathLabel ?? 'Entity scoped'
                                        : 'Platform global'}
                                    </div>
                                  </div>
                                  <div className="rounded-2xl border bg-muted/20 px-4 py-3">
                                    <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                      Hierarchy
                                    </div>
                                    <div className="mt-1 text-sm">
                                      {activePrincipal.scope_kind === 'entity'
                                        ? activePrincipal.inherit_from_tree
                                          ? 'Includes descendants'
                                          : 'Anchor only'
                                        : 'Not applicable'}
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-3 rounded-2xl border px-4 py-4">
                                  <div>
                                    <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                      Description
                                    </div>
                                    <div className="mt-1 text-sm">
                                      {activePrincipal.description || 'No description provided.'}
                                    </div>
                                  </div>

                                  <div>
                                    <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                      Assigned roles
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {activePrincipalRoles.length > 0 ? (
                                        activePrincipalRoles.map((role) => (
                                          <Badge key={role.id} variant="outline">
                                            {role.display_name}
                                          </Badge>
                                        ))
                                      ) : (
                                        <span className="text-sm text-muted-foreground">
                                          No roles assigned.
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div>
                                    <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                      Derived permissions
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {activePrincipal.effective_allowed_scopes.map((scope) => (
                                        <Badge key={scope} variant="secondary">
                                          {scope}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>

                                  {activePrincipal.allowed_scopes.length > 0 ? (
                                    <div>
                                      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                        Legacy direct permissions
                                      </div>
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        {activePrincipal.allowed_scopes.map((scope) => (
                                          <Badge key={scope} variant="outline">
                                            {scope}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}

                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <div className="text-sm text-muted-foreground">
                                      Created: {formatDateTime(activePrincipal.created_at)}
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      Updated: {formatDateTime(activePrincipal.updated_at)}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  {canUpdateApiKeys ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() =>
                                        setPrincipalFormState({
                                          open: true,
                                          mode: 'edit',
                                          principal: activePrincipal,
                                        })
                                      }
                                    >
                                      Edit service account
                                    </Button>
                                  ) : null}
                                  {canCreateApiKeys ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      disabled={activePrincipal.status !== 'active'}
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
                                  {canDeleteApiKeys ? (
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      disabled={activePrincipal.status === 'archived'}
                                      onClick={() => setArchivePrincipalTarget(activePrincipal)}
                                    >
                                      <Trash2 className="size-4" />
                                      Archive service account
                                    </Button>
                                  ) : null}
                                </div>
                              </>
                            )}
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader className="gap-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                                <CardTitle className="text-xl">Machine keys</CardTitle>
                                <div className="text-sm text-muted-foreground">
                                  {activePrincipal
                                    ? 'Manage keys owned by the selected service account.'
                                    : 'Select a service account to load its keys.'}
                                </div>
                              </div>
                              <Badge variant="outline">
                                {principalKeysQuery.data?.total ?? 0} total
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            {!activePrincipal ? (
                              <div className="rounded-xl border border-dashed px-4 py-8 text-sm text-muted-foreground">
                                Select a service account to load its keys.
                              </div>
                            ) : principalKeysQuery.isLoading ? (
                              <AppLoadingState title="Loading machine keys" />
                            ) : principalKeysQuery.isError ? (
                              <AppErrorState>
                                {getApiErrorMessage(
                                  principalKeysQuery.error,
                                  'The service-account key list could not be loaded.'
                                )}
                              </AppErrorState>
                            ) : principalKeys.length === 0 ? (
                              <div className="rounded-xl border border-dashed px-4 py-8 text-sm text-muted-foreground">
                                No keys exist for this service account yet.
                              </div>
                            ) : (
                              <>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Name</TableHead>
                                      <TableHead>Status</TableHead>
                                      <TableHead>Effective</TableHead>
                                      <TableHead>Last used</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {principalKeys.map((apiKey) => {
                                      const isSelected = apiKey.id === activePrincipalKey?.id

                                      return (
                                        <TableRow
                                          key={apiKey.id}
                                          data-state={isSelected ? 'selected' : undefined}
                                          className="cursor-pointer"
                                          onClick={() => setSelectedPrincipalKeyId(apiKey.id)}
                                        >
                                          <TableCell>
                                            <div className="space-y-1">
                                              <div className="font-medium">{apiKey.name}</div>
                                              <div className="text-xs text-muted-foreground">
                                                {apiKey.description || 'No description provided.'}
                                              </div>
                                            </div>
                                          </TableCell>
                                          <TableCell>
                                            <AppStatusBadge tone={getApiKeyStatusTone(apiKey.status)}>
                                              {formatToken(apiKey.status)}
                                            </AppStatusBadge>
                                          </TableCell>
                                          <TableCell>
                                            <AppStatusBadge tone={getEffectivenessTone(apiKey)}>
                                              {apiKey.is_currently_effective ? 'Effective' : 'Ineffective'}
                                            </AppStatusBadge>
                                          </TableCell>
                                          <TableCell>{formatDateTime(apiKey.last_used_at)}</TableCell>
                                        </TableRow>
                                      )
                                    })}
                                  </TableBody>
                                </Table>

                                {activePrincipalKey ? (
                                  <div className="space-y-4 rounded-2xl border px-4 py-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div className="space-y-1">
                                        <div className="text-sm font-medium">{activePrincipalKey.name}</div>
                                        <div className="text-xs text-muted-foreground">
                                          {activePrincipalKey.description || 'No description provided.'}
                                        </div>
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        <AppStatusBadge tone={getApiKeyStatusTone(activePrincipalKey.status)}>
                                          {formatToken(activePrincipalKey.status)}
                                        </AppStatusBadge>
                                        <AppStatusBadge tone={getEffectivenessTone(activePrincipalKey)}>
                                          {activePrincipalKey.is_currently_effective ? 'Effective' : 'Ineffective'}
                                        </AppStatusBadge>
                                      </div>
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2">
                                      <div className="rounded-2xl border bg-muted/20 px-4 py-3">
                                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                          Prefix
                                        </div>
                                        <div className="mt-1 font-mono text-sm">{activePrincipalKey.prefix}</div>
                                      </div>
                                      <div className="rounded-2xl border bg-muted/20 px-4 py-3">
                                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                          Rate limit
                                        </div>
                                        <div className="mt-1 text-sm">
                                          {formatApiKeyRateLimitPerMinute(
                                            activePrincipalKey.rate_limit_per_minute
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    <div>
                                      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                        Effective permissions
                                      </div>
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        {describeKeyPermissions(activePrincipalKey, activePrincipal).length > 0 ? (
                                          describeKeyPermissions(activePrincipalKey, activePrincipal).map((scope) => (
                                            <Badge key={scope} variant="secondary">
                                              {scope}
                                            </Badge>
                                          ))
                                        ) : (
                                          <span className="text-sm text-muted-foreground">
                                            No effective permissions.
                                          </span>
                                        )}
                                      </div>
                                      {activePrincipalKey.scopes.length === 0 ? (
                                        <div className="mt-2 text-xs text-muted-foreground">
                                          This key inherits all permissions from its service account.
                                        </div>
                                      ) : null}
                                    </div>

                                    <div>
                                      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                        Current effectiveness
                                      </div>
                                      {activePrincipalKey.is_currently_effective ? (
                                        <div className="mt-1 text-sm text-muted-foreground">
                                          The key is currently effective for its stored scope set.
                                        </div>
                                      ) : (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                          {(activePrincipalKey.ineffective_reasons ?? []).map((reason) => (
                                            <Badge key={reason} variant="outline">
                                              {formatToken(reason)}
                                            </Badge>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    <div>
                                      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                        IP whitelist
                                      </div>
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        {activePrincipalKey.ip_whitelist && activePrincipalKey.ip_whitelist.length > 0 ? (
                                          activePrincipalKey.ip_whitelist.map((item) => (
                                            <Badge key={item} variant="outline" className="font-mono">
                                              {item}
                                            </Badge>
                                          ))
                                        ) : (
                                          <span className="text-sm text-muted-foreground">
                                            No IP restriction configured.
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    <div className="grid gap-2 sm:grid-cols-2">
                                      <div className="text-sm text-muted-foreground">
                                        Created: {formatDateTime(activePrincipalKey.created_at)}
                                      </div>
                                      <div className="text-sm text-muted-foreground">
                                        Expires: {formatDateTime(activePrincipalKey.expires_at, 'Does not expire')}
                                      </div>
                                      <div className="text-sm text-muted-foreground">
                                        Last used: {formatDateTime(activePrincipalKey.last_used_at)}
                                      </div>
                                      <div className="text-sm text-muted-foreground">
                                        Owner type: {formatOwnerType(activePrincipalKey.owner_type)}
                                      </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                      {canUpdateApiKeys ? (
                                        <Button
                                          type="button"
                                          variant="outline"
                                          onClick={() =>
                                            setSystemKeyFormState({
                                              open: true,
                                              mode: 'edit',
                                              apiKey: activePrincipalKey,
                                            })
                                          }
                                        >
                                          Edit key
                                        </Button>
                                      ) : null}
                                      {canUpdateApiKeys ? (
                                        <Button
                                          type="button"
                                          variant="outline"
                                          disabled={activePrincipalKey.status === 'revoked'}
                                          onClick={() => setRotateTarget(activePrincipalKey)}
                                        >
                                          <RefreshCcw className="size-4" />
                                          Rotate key
                                        </Button>
                                      ) : null}
                                      {canDeleteApiKeys ? (
                                        <Button
                                          type="button"
                                          variant="destructive"
                                          disabled={activePrincipalKey.status === 'revoked'}
                                          onClick={() => setDeleteTarget(activePrincipalKey)}
                                        >
                                          <Trash2 className="size-4" />
                                          Revoke key
                                        </Button>
                                      ) : null}
                                    </div>
                                  </div>
                                ) : null}
                              </>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {enterpriseEnabled ? (
                  <TabsContent value="inventory" className="space-y-4 pt-1">
                  {!effectiveSelectedEntityId ? (
                    <div className="rounded-2xl border border-dashed px-4 py-8 text-sm text-muted-foreground">
                      Select an entity to load key inventory.
                    </div>
                  ) : (
                    <>
                      <Card>
                        <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                          <div className="space-y-2">
                            <Label htmlFor="api-keys-inventory-entity">Anchor entity</Label>
                            <Combobox
                              items={entityOptions}
                              itemToStringValue={(item) =>
                                item
                                  ? `${item.title} ${item.pathLabel} ${item.entityTypeLabel} ${item.entityClassLabel}`
                                  : ''
                              }
                              value={selectedEntity}
                              onValueChange={(value) => {
                                setSelectedEntityId(value?.id ?? '')
                                setSelectedInventoryKeyId(null)
                              }}
                              disabled={entitiesQuery.isLoading || entityOptions.length === 0}
                            >
                              <ComboboxInput
                                id="api-keys-inventory-entity"
                                placeholder="Search organization, region, office, or team"
                                className="w-full"
                                showClear
                              />
                              <ComboboxContent align="start">
                                <ComboboxEmpty>No entities found.</ComboboxEmpty>
                                <ComboboxList>
                                  {(option) => (
                                    <ComboboxItem
                                      key={option.id}
                                      value={option}
                                      className="items-start py-2.5"
                                    >
                                      <div className="flex min-w-0 flex-col gap-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="font-medium">{option.title}</span>
                                          <Badge variant="outline">{option.entityTypeLabel}</Badge>
                                        </div>
                                        <span className="truncate text-xs text-muted-foreground">
                                          {option.pathLabel}
                                        </span>
                                      </div>
                                    </ComboboxItem>
                                  )}
                                </ComboboxList>
                              </ComboboxContent>
                            </Combobox>
                          </div>

                          <div className="grid gap-4 sm:grid-cols-3">
                            <div className="space-y-2">
                              <Label>Status filter</Label>
                              <Select
                                value={inventoryStatusFilter}
                                onValueChange={(value) => {
                                  setInventoryStatusFilter(value as ApiKeyStatusFilter)
                                  setSelectedInventoryKeyId(null)
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="All statuses" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All statuses</SelectItem>
                                  <SelectItem value="active">Active</SelectItem>
                                  <SelectItem value="suspended">Suspended</SelectItem>
                                  <SelectItem value="expired">Expired</SelectItem>
                                  <SelectItem value="revoked">Revoked</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label>Key kind</Label>
                              <Select
                                value={inventoryKeyKindFilter}
                                onValueChange={(value) => {
                                  setInventoryKeyKindFilter(value as InventoryKeyKindFilter)
                                  setSelectedInventoryKeyId(null)
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="All key kinds" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All key kinds</SelectItem>
                                  <SelectItem value="personal">Personal</SelectItem>
                                  <SelectItem value="system_integration">System integration</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="api-keys-inventory-search">Search</Label>
                              <Input
                                id="api-keys-inventory-search"
                                placeholder="Search key names"
                                value={inventorySearchText}
                                onChange={(event) => {
                                  setInventorySearchText(event.target.value)
                                  setSelectedInventoryKeyId(null)
                                }}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <Card>
                          <CardHeader className="gap-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-1">
                                <CardTitle className="text-xl">Anchored keys</CardTitle>
                                <div className="text-sm text-muted-foreground">
                                  Inventory and incident-response view for {selectedEntity?.title ?? 'entity'}.
                                </div>
                              </div>
                              <Badge variant="outline">
                                {inventoryQuery.data?.total ?? 0} total
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent>
                            {inventoryQuery.isLoading ? (
                              <AppLoadingState title="Loading entity key inventory" />
                            ) : inventoryQuery.isError ? (
                              <AppErrorState>
                                {getApiErrorMessage(
                                  inventoryQuery.error,
                                  'The entity key inventory could not be loaded.'
                                )}
                              </AppErrorState>
                            ) : inventoryKeys.length === 0 ? (
                              <div className="rounded-xl border border-dashed px-4 py-8 text-sm text-muted-foreground">
                                No keys match the current entity inventory filters.
                              </div>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Owner</TableHead>
                                    <TableHead>Kind</TableHead>
                                    <TableHead>Status</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {inventoryKeys.map((apiKey) => {
                                    const isSelected = apiKey.id === activeInventoryKey?.id

                                    return (
                                      <TableRow
                                        key={apiKey.id}
                                        data-state={isSelected ? 'selected' : undefined}
                                        className="cursor-pointer"
                                        onClick={() => setSelectedInventoryKeyId(apiKey.id)}
                                      >
                                        <TableCell>
                                          <div className="space-y-1">
                                            <div className="font-medium">{apiKey.name}</div>
                                            <div className="text-xs text-muted-foreground">
                                              {apiKey.description || 'No description provided.'}
                                            </div>
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          <div className="space-y-1">
                                            <div className="text-sm font-medium">
                                              {formatInventoryOwnerLabel(apiKey)}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                              {formatInventoryOwnerSubtitle(apiKey)}
                                            </div>
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          <Badge variant="outline">{formatToken(apiKey.key_kind)}</Badge>
                                        </TableCell>
                                        <TableCell>
                                          <div className="flex flex-wrap gap-2">
                                            <AppStatusBadge tone={getApiKeyStatusTone(apiKey.status)}>
                                              {formatToken(apiKey.status)}
                                            </AppStatusBadge>
                                            <AppStatusBadge tone={getEffectivenessTone(apiKey)}>
                                              {apiKey.is_currently_effective ? 'Effective' : 'Ineffective'}
                                            </AppStatusBadge>
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    )
                                  })}
                                </TableBody>
                              </Table>
                            )}
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader className="gap-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-1">
                                <CardTitle className="text-xl">
                                  {activeInventoryKey ? activeInventoryKey.name : 'Inventory details'}
                                </CardTitle>
                                <div className="text-sm text-muted-foreground">
                                  {activeInventoryKey
                                    ? 'Inspect owner type, scope, and runtime effectiveness for the selected key.'
                                    : 'Select a key from the inventory table to inspect its details.'}
                                </div>
                              </div>
                              {activeInventoryKey ? (
                                <div className="flex flex-wrap gap-2">
                                  <AppStatusBadge tone={getApiKeyStatusTone(activeInventoryKey.status)}>
                                    {formatToken(activeInventoryKey.status)}
                                  </AppStatusBadge>
                                  <AppStatusBadge tone={getEffectivenessTone(activeInventoryKey)}>
                                    {activeInventoryKey.is_currently_effective ? 'Effective' : 'Ineffective'}
                                  </AppStatusBadge>
                                </div>
                              ) : null}
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            {!activeInventoryKey ? (
                              <div className="rounded-xl border border-dashed px-4 py-8 text-sm text-muted-foreground">
                                Select a key to inspect its current inventory state.
                              </div>
                            ) : (
                              <>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div className="rounded-2xl border bg-muted/20 px-4 py-3">
                                    <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                      Owner
                                    </div>
                                    <div className="mt-1 text-sm font-medium">
                                      {formatInventoryOwnerLabel(activeInventoryKey)}
                                    </div>
                                  </div>
                                  <div className="rounded-2xl border bg-muted/20 px-4 py-3">
                                    <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                      Owner type
                                    </div>
                                    <div className="mt-1 text-sm">{formatOwnerType(activeInventoryKey.owner_type)}</div>
                                  </div>
                                  <div className="rounded-2xl border bg-muted/20 px-4 py-3">
                                    <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                      Key kind
                                    </div>
                                    <div className="mt-1 text-sm">{formatToken(activeInventoryKey.key_kind)}</div>
                                  </div>
                                  <div className="rounded-2xl border bg-muted/20 px-4 py-3">
                                    <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                      Prefix
                                    </div>
                                    <div className="mt-1 font-mono text-sm">{activeInventoryKey.prefix}</div>
                                  </div>
                                </div>

                                <div className="space-y-3 rounded-2xl border px-4 py-4">
                                  <div>
                                    <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                      Description
                                    </div>
                                    <div className="mt-1 text-sm">
                                      {activeInventoryKey.description || 'No description provided.'}
                                    </div>
                                  </div>

                                  <div>
                                    <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                      Stored permissions
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {activeInventoryKey.scopes.length > 0 ? (
                                        activeInventoryKey.scopes.map((scope) => (
                                          <Badge key={scope} variant="secondary">
                                            {scope}
                                          </Badge>
                                        ))
                                      ) : (
                                        <span className="text-sm text-muted-foreground">
                                          This key inherits all permissions from its owner.
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div>
                                    <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                      Current effectiveness
                                    </div>
                                    {activeInventoryKey.is_currently_effective ? (
                                      <div className="mt-1 text-sm text-muted-foreground">
                                        The key is currently effective for its stored permission set.
                                      </div>
                                    ) : (
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        {(activeInventoryKey.ineffective_reasons ?? []).map((reason) => (
                                          <Badge key={reason} variant="outline">
                                            {formatToken(reason)}
                                          </Badge>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <div className="text-sm text-muted-foreground">
                                      Created: {formatDateTime(activeInventoryKey.created_at)}
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      Expires: {formatDateTime(activeInventoryKey.expires_at, 'Does not expire')}
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      Last used: {formatDateTime(activeInventoryKey.last_used_at)}
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      Rate limit:{' '}
                                      {formatApiKeyRateLimitPerMinute(
                                        activeInventoryKey.rate_limit_per_minute
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {canDeleteApiKeys ? (
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      disabled={activeInventoryKey.status === 'revoked'}
                                      onClick={() => setDeleteTarget(activeInventoryKey)}
                                    >
                                      <Trash2 className="size-4" />
                                      Revoke key
                                    </Button>
                                  </div>
                                ) : null}
                              </>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    </>
                  )}
                  </TabsContent>
                ) : null}
              </Tabs>
            </CardContent>
          </Card>
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
                  await archivePrincipalMutation.mutateAsync(archivePrincipalTarget)
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
                if (!rotateTarget) {
                  return
                }

                try {
                  await rotateSystemKeyMutation.mutateAsync(rotateTarget)
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
                  if (activeTab === 'integrations' && deleteTarget.owner_type === 'integration_principal') {
                    await revokeSystemKeyMutation.mutateAsync(deleteTarget)
                  } else {
                    await revokeInventoryKeyMutation.mutateAsync(deleteTarget)
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
