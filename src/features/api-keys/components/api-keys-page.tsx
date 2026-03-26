import { useMemo, useState } from 'react'

import { useQuery } from '@tanstack/react-query'
import {
  Check,
  Copy,
  KeyRound,
  RefreshCcw,
  ShieldAlert,
  Trash2,
} from 'lucide-react'

import { AppErrorState } from '@/components/app/app-error-state'
import { AppLoadingState } from '@/components/app/app-loading-state'
import { AppPage } from '@/components/app/app-page'
import { AppStatusBadge } from '@/components/app/app-status-badge'
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
import { getAuthConfigQueryOptions } from '@/features/auth/api/auth.query-options'
import { useSessionQuery } from '@/features/auth/hooks/use-session-query'
import {
  getApiKeysQueryOptions,
} from '@/features/api-keys/api/api-keys.query-options'
import {
  ApiKeyFormDialog,
  type ApiKeyOwnerOption,
} from '@/features/api-keys/components/api-key-form-dialog'
import { useDeleteApiKeyMutation } from '@/features/api-keys/hooks/use-delete-api-key-mutation'
import { useRotateApiKeyMutation } from '@/features/api-keys/hooks/use-rotate-api-key-mutation'
import type {
  ApiKey,
  ApiKeyStatus,
  CreateApiKeyResponse,
} from '@/features/api-keys/types/api-keys.types'
import {
  getEntitiesQueryOptions,
  getEntityMembersQueryOptions,
} from '@/features/entities/api/entities.query-options'
import { buildEntityOptions } from '@/features/entities/utils/build-entity-options'
import { getUserPermissionsQueryOptions } from '@/features/users/api/users.query-options'
import { getApiErrorMessage } from '@/lib/api/errors'
import type { AppStatusTone } from '@/components/app/app-status'

type ApiKeyStatusFilter = 'all' | ApiKeyStatus

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

function getStatusTone(status: ApiKeyStatus): AppStatusTone {
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

function getEffectivenessTone(apiKey: ApiKey): AppStatusTone {
  if (apiKey.status === 'revoked') {
    return 'error'
  }

  return apiKey.is_currently_effective ? 'success' : 'warning'
}

function formatIneffectiveReason(reason: string) {
  return formatToken(reason)
}

function formatOwnerLabel(owner: ApiKeyOwnerOption | null, fallback?: string | null) {
  if (owner) {
    return owner.label
  }

  return fallback ?? 'Unknown owner'
}

function getOwnerSubtitle(owner: ApiKeyOwnerOption | null) {
  return owner?.subtitle ?? 'Owner details unavailable in the current entity member list.'
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
  const deduped = new Map<string, ApiKeyOwnerOption>()

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

function buildSessionOwnerOption(sessionUser: {
  id: string
  email: string
  first_name?: string | null
  last_name?: string | null
} | null): ApiKeyOwnerOption | null {
  if (!sessionUser) {
    return null
  }

  const fullName = [sessionUser.first_name, sessionUser.last_name]
    .filter(Boolean)
    .join(' ')
    .trim()

  return {
    id: sessionUser.id,
    label: fullName || sessionUser.email,
    subtitle: fullName ? sessionUser.email : 'Current session user',
  }
}

export function ApiKeysPage() {
  const sessionQuery = useSessionQuery()
  const sessionUser = sessionQuery.data ?? null
  const authConfigQuery = useQuery(getAuthConfigQueryOptions())
  const actorPermissionsQuery = useQuery({
    ...getUserPermissionsQueryOptions(sessionUser?.id ?? ''),
    enabled: Boolean(sessionUser?.id),
  })

  const actorPermissionNames = useMemo(
    () => new Set((actorPermissionsQuery.data ?? []).map((item) => item.permission.name)),
    [actorPermissionsQuery.data]
  )
  const canReadApiKeys =
    Boolean(sessionUser?.is_superuser) ||
    hasAnyPermission(actorPermissionNames, ['api_key:read'])
  const canCreateApiKeys =
    Boolean(sessionUser?.is_superuser) ||
    hasAnyPermission(actorPermissionNames, ['api_key:create'])
  const canReadEntities =
    Boolean(sessionUser?.is_superuser) ||
    hasAnyPermission(actorPermissionNames, ['entity:read'])

  const entitiesQuery = useQuery({
    ...getEntitiesQueryOptions({
      page: 1,
      limit: 1000,
    }),
    enabled: canReadApiKeys && canReadEntities,
  })

  const entityOptions = useMemo(
    () => buildEntityOptions(entitiesQuery.data?.items ?? []),
    [entitiesQuery.data?.items]
  )

  const [selectedEntityId, setSelectedEntityId] = useState<string>('')
  const [selectedOwnerFilterId, setSelectedOwnerFilterId] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<ApiKeyStatusFilter>('all')
  const [searchText, setSearchText] = useState('')
  const [page, setPage] = useState(1)
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<string | null>(null)
  const [formState, setFormState] = useState<{
    open: boolean
    mode: 'create' | 'edit'
    apiKey: ApiKey | null
  }>({
    open: false,
    mode: 'create',
    apiKey: null,
  })
  const [rotateTarget, setRotateTarget] = useState<ApiKey | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null)
  const [revealedSecret, setRevealedSecret] = useState<CreateApiKeyResponse | null>(null)
  const [secretCopied, setSecretCopied] = useState(false)

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

  const membersQuery = useQuery({
    ...getEntityMembersQueryOptions(effectiveSelectedEntityId, {
      page: 1,
      limit: 200,
      includeInactive: true,
    }),
    enabled: canReadApiKeys && Boolean(effectiveSelectedEntityId),
  })

  const memberOwnerOptions = useMemo(
    () => buildOwnerOptions(membersQuery.data ?? []),
    [membersQuery.data]
  )
  const sessionOwnerOption = useMemo(
    () => buildSessionOwnerOption(sessionUser),
    [sessionUser]
  )
  const ownerOptions = useMemo(() => {
    const deduped = new Map<string, ApiKeyOwnerOption>()

    for (const option of memberOwnerOptions) {
      deduped.set(option.id, option)
    }

    if (sessionOwnerOption) {
      deduped.set(sessionOwnerOption.id, sessionOwnerOption)
    }

    return [...deduped.values()].sort((left, right) => left.label.localeCompare(right.label))
  }, [memberOwnerOptions, sessionOwnerOption])
  const createOwnerOptions = useMemo(
    () => (sessionOwnerOption ? [sessionOwnerOption] : ownerOptions),
    [ownerOptions, sessionOwnerOption]
  )
  const ownerById = useMemo(
    () => new Map(ownerOptions.map((owner) => [owner.id, owner])),
    [ownerOptions]
  )

  const effectiveSelectedOwnerFilterId =
    selectedOwnerFilterId && ownerOptions.some((owner) => owner.id === selectedOwnerFilterId)
      ? selectedOwnerFilterId
      : ''

  const apiKeysEnabled = authConfigQuery.data?.features.api_keys ?? true
  const apiKeysQuery = useQuery({
    ...getApiKeysQueryOptions({
      entityId: effectiveSelectedEntityId,
      page,
      limit: 20,
      ownerId: effectiveSelectedOwnerFilterId || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
      keyKind: 'personal',
      search: searchText.trim() || undefined,
    }),
    enabled: apiKeysEnabled && canReadApiKeys && Boolean(effectiveSelectedEntityId),
  })

  const pageError =
    sessionQuery.error ??
    actorPermissionsQuery.error ??
    authConfigQuery.error

  const apiKeys = useMemo(
    () => apiKeysQuery.data?.items ?? [],
    [apiKeysQuery.data?.items]
  )
  const effectiveSelectedApiKeyId =
    selectedApiKeyId && apiKeys.some((apiKey) => apiKey.id === selectedApiKeyId)
      ? selectedApiKeyId
      : apiKeys[0]?.id ?? null
  const activeApiKey =
    apiKeys.find((apiKey) => apiKey.id === effectiveSelectedApiKeyId) ??
    null

  const deleteMutation = useDeleteApiKeyMutation()
  const rotateMutation = useRotateApiKeyMutation()

  function openSecretDialog(apiKey: CreateApiKeyResponse) {
    setSecretCopied(false)
    setRevealedSecret(apiKey)
  }

  function closeSecretDialog() {
    setSecretCopied(false)
    setRevealedSecret(null)
  }

  if (sessionQuery.isPending || actorPermissionsQuery.isPending || authConfigQuery.isPending) {
    return <AppLoadingState title="Loading API keys workspace" />
  }

  if (pageError) {
    return (
      <AppPage title="API Keys" hideTitle padded>
        <AppErrorState>
          {getApiErrorMessage(
            pageError,
            'The API keys workspace could not load data from the auth API.'
          )}
        </AppErrorState>
      </AppPage>
    )
  }

  if (!apiKeysEnabled) {
    return (
      <AppPage title="API Keys" hideTitle padded>
        <div className="rounded-2xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
          The current backend preset does not advertise API key support.
        </div>
      </AppPage>
    )
  }

  if (!canReadApiKeys) {
    return (
      <AppPage title="API Keys" hideTitle padded>
        <div className="rounded-2xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
          Insufficient permissions. You need API key read access to use this workspace.
        </div>
      </AppPage>
    )
  }

  return (
    <>
      <AppPage
        title="API Keys"
        hideTitle
        padded
        shellAction={
          canCreateApiKeys ? (
            <Button
              type="button"
              disabled={!effectiveSelectedEntityId || createOwnerOptions.length === 0}
              onClick={() =>
                setFormState({
                  open: true,
                  mode: 'create',
                  apiKey: null,
                })
              }
            >
              <KeyRound className="size-4" />
              Create API key
            </Button>
          ) : undefined
        }
      >
        <div className="grid gap-4">
          <Card>
            <CardHeader className="gap-3">
              <div className="space-y-1">
                <CardTitle className="text-xl">Entity API key workspace</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Manage entity-anchored personal keys through the admin API surface. Scope and
                  effectiveness are computed from the selected entity and owner context.
                </p>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div className="space-y-2">
                <Label htmlFor="api-keys-entity">Entity scope</Label>
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
                    setSelectedOwnerFilterId('')
                    setSelectedApiKeyId(null)
                    setPage(1)
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

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="api-keys-owner-filter">Owner filter</Label>
                  <Combobox
                    items={ownerOptions}
                    itemToStringValue={(item) =>
                      item ? `${item.label} ${item.subtitle}` : ''
                    }
                    value={ownerOptions.find((owner) => owner.id === selectedOwnerFilterId) ?? null}
                    onValueChange={(value) => {
                      setSelectedOwnerFilterId(value?.id ?? '')
                      setPage(1)
                    }}
                    disabled={!effectiveSelectedEntityId || membersQuery.isLoading}
                  >
                    <ComboboxInput
                      id="api-keys-owner-filter"
                      placeholder="All owners"
                      className="w-full"
                      showClear
                    />
                    <ComboboxContent align="start">
                      <ComboboxEmpty>No matching owners found.</ComboboxEmpty>
                      <ComboboxList>
                        {(option) => (
                          <ComboboxItem
                            key={option.id}
                            value={option}
                            className="items-start py-2.5"
                          >
                            <div className="flex min-w-0 flex-col gap-1">
                              <span className="font-medium">{option.label}</span>
                              <span className="truncate text-xs text-muted-foreground">
                                {option.subtitle}
                              </span>
                            </div>
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                </div>

                <div className="space-y-2">
                  <Label>Status filter</Label>
                  <Select
                    value={statusFilter}
                    onValueChange={(value) => {
                      setStatusFilter(value as ApiKeyStatusFilter)
                      setPage(1)
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
                  <Label htmlFor="api-keys-search">Search</Label>
                  <Input
                    id="api-keys-search"
                    placeholder="Search key names"
                    value={searchText}
                    onChange={(event) => {
                      setSearchText(event.target.value)
                      setPage(1)
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {!effectiveSelectedEntityId ? (
            <div className="rounded-2xl border border-dashed px-4 py-8 text-sm text-muted-foreground">
              Select an entity to load API keys.
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <Card>
                <CardHeader className="gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle className="text-xl">Keys in {selectedEntity?.title ?? 'entity'}</CardTitle>
                      <div className="text-sm text-muted-foreground">
                        {selectedEntity?.pathLabel ?? 'Selected entity scope'}
                      </div>
                    </div>
                    <Badge variant="outline">
                      {apiKeysQuery.data?.total ?? 0} total
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {apiKeysQuery.isLoading ? (
                    <AppLoadingState title="Loading entity API keys" />
                  ) : apiKeysQuery.isError ? (
                    <AppErrorState>
                      {getApiErrorMessage(
                        apiKeysQuery.error,
                        'The entity API key list could not be loaded.'
                      )}
                    </AppErrorState>
                  ) : apiKeys.length === 0 ? (
                    <div className="rounded-xl border border-dashed px-4 py-8 text-sm text-muted-foreground">
                      No API keys match the current entity and filter set.
                    </div>
                  ) : (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Owner</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Effective</TableHead>
                            <TableHead>Last used</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {apiKeys.map((apiKey) => {
                            const isSelected = activeApiKey?.id === apiKey.id
                            const owner = ownerById.get(apiKey.owner_id ?? '') ?? null

                            return (
                              <TableRow
                                key={apiKey.id}
                                data-state={isSelected ? 'selected' : undefined}
                                className="cursor-pointer"
                                onClick={() => setSelectedApiKeyId(apiKey.id)}
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
                                      {formatOwnerLabel(owner, apiKey.owner_id)}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {getOwnerSubtitle(owner)}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <AppStatusBadge tone={getStatusTone(apiKey.status)}>
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

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm text-muted-foreground">
                          Page {apiKeysQuery.data?.page ?? page} of{' '}
                          {Math.max(apiKeysQuery.data?.pages ?? 0, 1)}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={page <= 1 || apiKeysQuery.isFetching}
                            onClick={() => setPage((current) => Math.max(1, current - 1))}
                          >
                            Previous
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={
                              !apiKeysQuery.data ||
                              page >= apiKeysQuery.data.pages ||
                              apiKeysQuery.isFetching
                            }
                            onClick={() => setPage((current) => current + 1)}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <CardTitle className="text-xl">
                        {activeApiKey ? activeApiKey.name : 'Key details'}
                      </CardTitle>
                      <div className="text-sm text-muted-foreground">
                        {activeApiKey
                          ? 'Inspect lifecycle, owner, scope, and current effectiveness for the selected key.'
                          : 'Select a key to inspect its current state.'}
                      </div>
                    </div>
                    {activeApiKey ? (
                      <div className="flex flex-wrap gap-2">
                        <AppStatusBadge tone={getStatusTone(activeApiKey.status)}>
                          {formatToken(activeApiKey.status)}
                        </AppStatusBadge>
                        <AppStatusBadge tone={getEffectivenessTone(activeApiKey)}>
                          {activeApiKey.is_currently_effective ? 'Effective' : 'Ineffective'}
                        </AppStatusBadge>
                      </div>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!activeApiKey ? (
                    <div className="rounded-xl border border-dashed px-4 py-8 text-sm text-muted-foreground">
                      Select a key from the table to inspect its details.
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border bg-muted/20 px-4 py-3">
                          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            Owner
                          </div>
                          <div className="mt-1 text-sm font-medium">
                            {formatOwnerLabel(
                              ownerById.get(activeApiKey.owner_id ?? '') ?? null,
                              activeApiKey.owner_id
                            )}
                          </div>
                        </div>
                        <div className="rounded-2xl border bg-muted/20 px-4 py-3">
                          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            Prefix
                          </div>
                          <div className="mt-1 font-mono text-sm">{activeApiKey.prefix}</div>
                        </div>
                        <div className="rounded-2xl border bg-muted/20 px-4 py-3">
                          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            Key kind
                          </div>
                          <div className="mt-1 text-sm">{formatToken(activeApiKey.key_kind)}</div>
                        </div>
                        <div className="rounded-2xl border bg-muted/20 px-4 py-3">
                          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            Hierarchy
                          </div>
                          <div className="mt-1 text-sm">
                            {activeApiKey.inherit_from_tree ? 'Includes descendants' : 'Anchor only'}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3 rounded-2xl border px-4 py-4">
                        <div>
                          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            Description
                          </div>
                          <div className="mt-1 text-sm">
                            {activeApiKey.description || 'No description provided.'}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            Scopes
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {activeApiKey.scopes.length > 0 ? (
                              activeApiKey.scopes.map((scope) => (
                                <Badge key={scope} variant="secondary">
                                  {scope}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                No explicit scopes stored on this key.
                              </span>
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            Current effectiveness
                          </div>
                          {activeApiKey.is_currently_effective ? (
                            <div className="mt-1 text-sm text-muted-foreground">
                              The key is currently effective for its stored scope set.
                            </div>
                          ) : (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {(activeApiKey.ineffective_reasons ?? []).map((reason) => (
                                <Badge key={reason} variant="outline">
                                  {formatIneffectiveReason(reason)}
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
                            {activeApiKey.ip_whitelist && activeApiKey.ip_whitelist.length > 0 ? (
                              activeApiKey.ip_whitelist.map((ipAddress) => (
                                <Badge key={ipAddress} variant="outline" className="font-mono">
                                  {ipAddress}
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
                            Created: {formatDateTime(activeApiKey.created_at)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Expires: {formatDateTime(activeApiKey.expires_at, 'Does not expire')}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Last used: {formatDateTime(activeApiKey.last_used_at)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Rate limit: {activeApiKey.rate_limit_per_minute} requests/minute
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setFormState({
                              open: true,
                              mode: 'edit',
                              apiKey: activeApiKey,
                            })
                          }
                        >
                          Edit key
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={rotateMutation.isPending || activeApiKey.status === 'revoked'}
                          onClick={() => {
                            setRotateTarget(activeApiKey)
                          }}
                        >
                          <RefreshCcw className="size-4" />
                          {rotateMutation.isPending ? 'Rotating...' : 'Rotate key'}
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          disabled={activeApiKey.status === 'revoked'}
                          onClick={() => setDeleteTarget(activeApiKey)}
                        >
                          <Trash2 className="size-4" />
                          Revoke key
                        </Button>
                      </div>

                      {membersQuery.isError ? (
                        <div className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
                          Owner labels could not be fully resolved for this entity. Stored owner IDs
                          are still shown.
                        </div>
                      ) : null}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </AppPage>

      <ApiKeyFormDialog
        open={formState.open}
        mode={formState.mode}
        entityId={effectiveSelectedEntityId}
        entityLabel={selectedEntity?.pathLabel ?? 'Selected entity'}
        apiKey={formState.apiKey}
        ownerOptions={formState.mode === 'create' ? createOwnerOptions : ownerOptions}
        defaultOwnerId={effectiveSelectedOwnerFilterId || sessionUser?.id || null}
        onOpenChange={(open) =>
          setFormState((current) => ({
            ...current,
            open,
          }))
        }
        onCreated={(apiKey) => {
          setSelectedApiKeyId(apiKey.id)
          openSecretDialog(apiKey)
          setFormState({
            open: false,
            mode: 'create',
            apiKey: null,
          })
        }}
        onUpdated={(apiKey) => {
          setSelectedApiKeyId(apiKey.id)
          setFormState({
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

      <Dialog open={Boolean(rotateTarget)} onOpenChange={(open) => !open && setRotateTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rotate API key</DialogTitle>
            <DialogDescription>
              Rotating this key creates a replacement secret and revokes the current secret
              immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl border px-4 py-4 text-sm">
              <div className="font-medium text-foreground">{rotateTarget?.name}</div>
              <div className="mt-1 text-muted-foreground">
                Prefix: <span className="font-mono">{rotateTarget?.prefix}</span>
              </div>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-4 text-sm text-amber-700 dark:text-amber-300">
              Integrations using the current secret will stop working until they are updated with
              the replacement value shown after rotation.
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={rotateMutation.isPending}
              onClick={() => setRotateTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!rotateTarget || rotateMutation.isPending}
              onClick={async () => {
                if (!rotateTarget || !effectiveSelectedEntityId) {
                  return
                }

                try {
                  const rotatedKey = await rotateMutation.mutateAsync({
                    entityId: effectiveSelectedEntityId,
                    keyId: rotateTarget.id,
                  })
                  setRotateTarget(null)
                  setSelectedApiKeyId(rotatedKey.id)
                  openSecretDialog(rotatedKey)
                } catch {
                  return
                }
              }}
            >
              {rotateMutation.isPending ? 'Rotating...' : 'Rotate key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke API key</DialogTitle>
            <DialogDescription>
              Revoking this key permanently stops it from authenticating. Existing integrations
              must switch to a replacement secret.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-4 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                This action targets <strong>{deleteTarget?.name}</strong> and cannot be undone.
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleteMutation.isPending}
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending || !deleteTarget || !effectiveSelectedEntityId}
              onClick={async () => {
                if (!deleteTarget || !effectiveSelectedEntityId) {
                  return
                }

                try {
                  await deleteMutation.mutateAsync({
                    entityId: effectiveSelectedEntityId,
                    keyId: deleteTarget.id,
                  })
                  setDeleteTarget(null)

                  if (effectiveSelectedApiKeyId === deleteTarget.id) {
                    setSelectedApiKeyId(null)
                  }
                } catch {
                  return
                }
              }}
            >
              {deleteMutation.isPending ? 'Revoking...' : 'Revoke key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
