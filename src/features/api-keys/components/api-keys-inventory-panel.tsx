import type { UseQueryResult } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'

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
import type { ApiKey } from '@/features/api-keys/types/api-keys.types'
import type {
  ApiKeyStatusFilter,
  InventoryKeyKindFilter,
} from '@/features/api-keys/utils/api-keys-display'
import {
  formatDateTime,
  formatOwnerType,
  formatToken,
  getApiKeyStatusTone,
  getEffectivenessTone,
} from '@/features/api-keys/utils/api-keys-display'
import { formatApiKeyRateLimitPerMinute } from '@/features/api-keys/utils/rate-limit'
import type { EntityOption } from '@/features/entities/utils/build-entity-options'
import { getApiErrorMessage } from '@/lib/api/errors'
import type { PaginatedResponse } from '@/lib/api/paginated-response.types'

type ApiKeysInventoryPanelProps = {
  effectiveSelectedEntityId: string
  entityOptions: EntityOption[]
  selectedEntity: EntityOption | null
  setSelectedEntityId: (id: string) => void
  setSelectedInventoryKeyId: (id: string | null) => void
  entitiesQueryIsLoading: boolean
  inventoryStatusFilter: ApiKeyStatusFilter
  setInventoryStatusFilter: (value: ApiKeyStatusFilter) => void
  inventoryKeyKindFilter: InventoryKeyKindFilter
  setInventoryKeyKindFilter: (value: InventoryKeyKindFilter) => void
  inventorySearchText: string
  setInventorySearchText: (value: string) => void
  inventoryQuery: UseQueryResult<PaginatedResponse<ApiKey>>
  inventoryKeys: ApiKey[]
  activeInventoryKey: ApiKey | null
  canDeleteApiKeys: boolean
  formatInventoryOwnerLabel: (apiKey: ApiKey) => string
  formatInventoryOwnerSubtitle: (apiKey: ApiKey) => string
  setDeleteTarget: (apiKey: ApiKey | null) => void
}

export function ApiKeysInventoryPanel({
  effectiveSelectedEntityId,
  entityOptions,
  selectedEntity,
  setSelectedEntityId,
  setSelectedInventoryKeyId,
  entitiesQueryIsLoading,
  inventoryStatusFilter,
  setInventoryStatusFilter,
  inventoryKeyKindFilter,
  setInventoryKeyKindFilter,
  inventorySearchText,
  setInventorySearchText,
  inventoryQuery,
  inventoryKeys,
  activeInventoryKey,
  canDeleteApiKeys,
  formatInventoryOwnerLabel,
  formatInventoryOwnerSubtitle,
  setDeleteTarget,
}: ApiKeysInventoryPanelProps) {
  const entitiesQuery = { isLoading: entitiesQueryIsLoading }

  return (
    <>
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
    </>
  )
}
