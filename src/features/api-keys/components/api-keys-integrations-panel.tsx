import type { UseQueryResult } from '@tanstack/react-query'
import { KeyRound, RefreshCcw, Trash2 } from 'lucide-react'

import { AppEmptyState } from '@/components/app/app-empty-state'
import { AppErrorState } from '@/components/app/app-error-state'
import { AppLoadingState } from '@/components/app/app-loading-state'
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
import type {
  ApiKey,
  IntegrationPrincipal,
  IntegrationPrincipalScopeKind,
} from '@/features/api-keys/types/api-keys.types'
import {
  describeKeyPermissions,
  formatDateTime,
  formatOwnerType,
  formatToken,
  getApiKeyStatusTone,
  getEffectivenessTone,
  getPrincipalStatusTone,
} from '@/features/api-keys/utils/api-keys-display'
import { formatApiKeyRateLimitPerMinute } from '@/features/api-keys/utils/rate-limit'
import type { EntityOption } from '@/features/entities/utils/build-entity-options'
import type { Role } from '@/features/roles/types/roles.types'
import { getApiErrorMessage } from '@/lib/api/errors'
import type { PaginatedResponse } from '@/lib/api/paginated-response.types'

type ApiKeysIntegrationsPanelProps = {
  enterpriseEnabled: boolean
  scopeKind: IntegrationPrincipalScopeKind
  setScopeKind: (value: IntegrationPrincipalScopeKind) => void
  effectiveScopeKind: IntegrationPrincipalScopeKind
  canManagePlatformPrincipals: boolean
  canCreateApiKeys: boolean
  canUpdateApiKeys: boolean
  canDeleteApiKeys: boolean
  entityOptions: EntityOption[]
  selectedEntity: EntityOption | null
  setSelectedEntityId: (id: string) => void
  setSelectedPrincipalId: (id: string | null) => void
  setSelectedPrincipalKeyId: (id: string | null) => void
  setSelectedInventoryKeyId: (id: string | null) => void
  entitiesQueryIsLoading: boolean
  platformGlobalSummary: string
  platformGlobalUnavailableMessage: string
  effectiveSelectedEntityId: string
  principalSearchText: string
  setPrincipalSearchText: (value: string) => void
  integrationPrincipalsQuery: UseQueryResult<PaginatedResponse<IntegrationPrincipal>>
  integrationPrincipals: IntegrationPrincipal[]
  activePrincipal: IntegrationPrincipal | null
  activePrincipalRoles: Role[]
  principalKeysQuery: UseQueryResult<PaginatedResponse<ApiKey>>
  principalKeys: ApiKey[]
  activePrincipalKey: ApiKey | null
  setPrincipalFormState: (state: {
    open: boolean
    mode: 'create' | 'edit'
    principal: IntegrationPrincipal | null
  }) => void
  setSystemKeyFormState: (state: {
    open: boolean
    mode: 'create' | 'edit'
    apiKey: ApiKey | null
  }) => void
  setArchivePrincipalTarget: (principal: IntegrationPrincipal | null) => void
  setRotateTarget: (apiKey: ApiKey | null) => void
  setDeleteTarget: (apiKey: ApiKey | null) => void
}

export function ApiKeysIntegrationsPanel({
  enterpriseEnabled,
  scopeKind,
  setScopeKind,
  effectiveScopeKind,
  canManagePlatformPrincipals,
  canCreateApiKeys,
  canUpdateApiKeys,
  canDeleteApiKeys,
  entityOptions,
  selectedEntity,
  setSelectedEntityId,
  setSelectedPrincipalId,
  setSelectedPrincipalKeyId,
  setSelectedInventoryKeyId,
  entitiesQueryIsLoading,
  platformGlobalSummary,
  platformGlobalUnavailableMessage,
  effectiveSelectedEntityId,
  principalSearchText,
  setPrincipalSearchText,
  integrationPrincipalsQuery,
  integrationPrincipals,
  activePrincipal,
  activePrincipalRoles,
  principalKeysQuery,
  principalKeys,
  activePrincipalKey,
  setPrincipalFormState,
  setSystemKeyFormState,
  setArchivePrincipalTarget,
  setRotateTarget,
  setDeleteTarget,
}: ApiKeysIntegrationsPanelProps) {
  const entitiesQuery = { isLoading: entitiesQueryIsLoading }

  return (
    <>
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
                    <AppEmptyState
                      title="Platform accounts unavailable"
                      description={platformGlobalUnavailableMessage}
                      compact
                    />
                  ) : effectiveScopeKind === 'entity' && !effectiveSelectedEntityId ? (
                    <AppEmptyState
                      title="Select an entity"
                      description="Select an entity to load service accounts."
                      compact
                    />
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
                            <AppEmptyState
                              title="No service accounts"
                              description="No service accounts match the current scope and search."
                              compact
                            />
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
                              <AppEmptyState
                                title="No account selected"
                                description="Select a service account from the table to inspect its details."
                                compact
                              />
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
                              <AppEmptyState
                                title="No account selected"
                                description="Select a service account to load its keys."
                                compact
                              />
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
                              <AppEmptyState
                                title="No machine keys"
                                description="No keys exist for this service account yet."
                                compact
                              />
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
    </>
  )
}
