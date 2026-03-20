import { useEffect, useMemo, useState } from 'react'

import { useQuery } from '@tanstack/react-query'
import { Check, Copy, KeyRound, RefreshCcw, ShieldAlert, Trash2 } from 'lucide-react'

import { AppLoadingState } from '@/components/app/app-loading-state'
import { AppPage } from '@/components/app/app-page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
import { ApiKeyFormDialog } from '@/features/api-keys/components/api-key-form-dialog'
import { useDeleteApiKeyMutation } from '@/features/api-keys/hooks/use-delete-api-key-mutation'
import { useRotateApiKeyMutation } from '@/features/api-keys/hooks/use-rotate-api-key-mutation'
import type {
  ApiKey,
  ApiKeyStatus,
  CreateApiKeyResponse,
} from '@/features/api-keys/types/api-keys.types'
import { getEntitiesQueryOptions } from '@/features/entities/api/entities.query-options'
import { buildEntityOptions } from '@/features/entities/utils/build-entity-options'
import { getUserPermissionsQueryOptions } from '@/features/users/api/users.query-options'
import { getApiErrorMessage } from '@/lib/api/errors'

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

function getStatusVariant(status: ApiKeyStatus) {
  switch (status) {
    case 'active':
      return 'outline' as const
    case 'suspended':
      return 'secondary' as const
    case 'expired':
    case 'revoked':
      return 'destructive' as const
    default:
      return 'outline' as const
  }
}

function getEntityLabel(apiKey: ApiKey, entityLabelsById: Map<string, string>) {
  const entityId = apiKey.entity_ids?.[0]

  if (!entityId) {
    return 'All entities'
  }

  return entityLabelsById.get(entityId) ?? entityId
}

function hasAnyPermission(permissionNames: Set<string>, candidates: string[]) {
  return candidates.some((candidate) => permissionNames.has(candidate))
}

export function ApiKeysPage() {
  const sessionQuery = useSessionQuery()
  const sessionUser = sessionQuery.data ?? null
  const authConfigQuery = useQuery(getAuthConfigQueryOptions())
  const actorPermissionsQuery = useQuery({
    ...getUserPermissionsQueryOptions(sessionUser?.id ?? ''),
    enabled: Boolean(sessionUser?.id),
  })
  const apiKeysQuery = useQuery(getApiKeysQueryOptions())

  const actorPermissionNames = useMemo(
    () => new Set((actorPermissionsQuery.data ?? []).map((item) => item.permission.name)),
    [actorPermissionsQuery.data]
  )
  const canReadEntities =
    Boolean(sessionUser?.is_superuser) ||
    hasAnyPermission(actorPermissionNames, ['entity:read'])
  const entitiesQuery = useQuery({
    ...getEntitiesQueryOptions({
      page: 1,
      limit: 1000,
    }),
    enabled: canReadEntities,
  })

  const apiKeysEnabled = authConfigQuery.data?.features.api_keys ?? true
  const pageError =
    sessionQuery.error ??
    actorPermissionsQuery.error ??
    authConfigQuery.error ??
    apiKeysQuery.error

  const entityOptions = useMemo(
    () => buildEntityOptions(entitiesQuery.data?.items ?? []),
    [entitiesQuery.data?.items]
  )
  const entityLabelsById = useMemo(
    () => new Map(entityOptions.map((entity) => [entity.id, entity.pathLabel])),
    [entityOptions]
  )
  const apiKeys = useMemo(
    () =>
      [...(apiKeysQuery.data ?? [])].sort((left, right) =>
        right.created_at.localeCompare(left.created_at)
      ),
    [apiKeysQuery.data]
  )
  const availableScopes = authConfigQuery.data?.available_permissions ?? []

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
  const [showRevokedKeys, setShowRevokedKeys] = useState(false)
  const [rotateTarget, setRotateTarget] = useState<ApiKey | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null)
  const [revealedSecret, setRevealedSecret] = useState<CreateApiKeyResponse | null>(null)
  const [secretCopied, setSecretCopied] = useState(false)

  const visibleApiKeys = useMemo(
    () =>
      showRevokedKeys
        ? apiKeys
        : apiKeys.filter((apiKey) => apiKey.status !== 'revoked'),
    [apiKeys, showRevokedKeys]
  )

  const activeApiKey =
    visibleApiKeys.find((apiKey) => apiKey.id === selectedApiKeyId) ??
    visibleApiKeys[0] ??
    null

  const deleteMutation = useDeleteApiKeyMutation()
  const rotateMutation = useRotateApiKeyMutation()

  useEffect(() => {
    setSecretCopied(false)
  }, [revealedSecret])

  useEffect(() => {
    if (apiKeys.length === 0) {
      return
    }

    const hasVisibleNonRevokedKey = apiKeys.some((apiKey) => apiKey.status !== 'revoked')

    if (!hasVisibleNonRevokedKey) {
      setShowRevokedKeys(true)
    }
  }, [apiKeys])

  if (sessionQuery.isPending || actorPermissionsQuery.isPending || authConfigQuery.isPending) {
    return <AppLoadingState title="Loading API keys workspace" />
  }

  if (pageError) {
    return (
      <AppPage title="API Keys">
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-4 text-sm text-destructive">
          {getApiErrorMessage(
            pageError,
            'The API keys workspace could not load data from the auth API.'
          )}
        </div>
      </AppPage>
    )
  }

  return (
    <>
      <AppPage
        title="API Keys"
        description="Manage the current account's machine credentials, lifecycle, rotation, and scope restrictions."
        action={
          apiKeysEnabled ? (
            <Button
              type="button"
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
        {!apiKeysEnabled ? (
          <div className="rounded-2xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
            The current backend preset does not advertise API key support.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <Card className="border border-border/70">
              <CardHeader className="gap-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="text-xl">Current user's keys</CardTitle>
                  {apiKeys.length > 0 ? (
                    <div className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm font-medium">
                      <Switch
                        id="api-keys-show-revoked"
                        checked={showRevokedKeys}
                        onCheckedChange={(checked) => {
                          setShowRevokedKeys(Boolean(checked))
                        }}
                        aria-label="Show revoked keys"
                      />
                      <Label
                        htmlFor="api-keys-show-revoked"
                        className="cursor-pointer whitespace-nowrap text-sm font-medium"
                      >
                        Show revoked keys
                      </Label>
                    </div>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  Secrets are only returned on create and rotate. Subsequent reads only expose the
                  prefix and metadata.
                </p>
              </CardHeader>
              <CardContent>
                {visibleApiKeys.length === 0 ? (
                  <div className="rounded-xl border border-dashed px-4 py-8 text-sm text-muted-foreground">
                    {apiKeys.length === 0
                      ? 'No API keys exist for this account yet.'
                      : 'No non-revoked API keys are currently visible. Enable revoked keys to inspect archived credentials.'}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Prefix</TableHead>
                        <TableHead>Usage</TableHead>
                        <TableHead>Last used</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleApiKeys.map((apiKey) => {
                        const isSelected = activeApiKey?.id === apiKey.id

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
                              <Badge variant={getStatusVariant(apiKey.status)}>
                                {formatToken(apiKey.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono">{apiKey.prefix}</TableCell>
                            <TableCell>{apiKey.usage_count}</TableCell>
                            <TableCell>{formatDateTime(apiKey.last_used_at)}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card className="border border-border/70">
              <CardHeader className="gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <CardTitle className="text-xl">
                      {activeApiKey ? activeApiKey.name : 'Key details'}
                    </CardTitle>
                    <div className="text-sm text-muted-foreground">
                      {activeApiKey
                        ? 'Inspect lifecycle, scope, and operational metadata for the selected key.'
                        : 'Select a key to inspect its configuration.'}
                    </div>
                  </div>
                  {activeApiKey ? (
                    <Badge variant={getStatusVariant(activeApiKey.status)}>
                      {formatToken(activeApiKey.status)}
                    </Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!activeApiKey ? (
                  <div className="rounded-xl border border-dashed px-4 py-8 text-sm text-muted-foreground">
                    Create a key or select an existing one from the table.
                  </div>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border bg-muted/20 px-4 py-3">
                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Prefix
                        </div>
                        <div className="mt-1 font-mono text-sm">{activeApiKey.prefix}</div>
                      </div>
                      <div className="rounded-2xl border bg-muted/20 px-4 py-3">
                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Lifecycle
                        </div>
                        <div className="mt-1 text-sm">{formatToken(activeApiKey.status)}</div>
                      </div>
                      <div className="rounded-2xl border bg-muted/20 px-4 py-3">
                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Usage count
                        </div>
                        <div className="mt-1 text-sm">{activeApiKey.usage_count}</div>
                      </div>
                      <div className="rounded-2xl border bg-muted/20 px-4 py-3">
                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Entity scope
                        </div>
                        <div className="mt-1 text-sm">
                          {getEntityLabel(activeApiKey, entityLabelsById)}
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
                              No explicit scopes. The backend will treat this as unrestricted for the
                              key's owner context.
                            </span>
                          )}
                        </div>
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
                        disabled={
                          rotateMutation.isPending ||
                          activeApiKey.status === 'revoked'
                        }
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

                    {entitiesQuery.isError ? (
                      <div className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
                        Entity names could not be loaded for scope labels. Existing restrictions are
                        still shown using stored IDs.
                      </div>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </AppPage>

      <ApiKeyFormDialog
        open={formState.open}
        mode={formState.mode}
        apiKey={formState.apiKey}
        availableScopes={availableScopes}
        entityOptions={entityOptions}
        onOpenChange={(open) =>
          setFormState((current) => ({
            ...current,
            open,
          }))
        }
        onCreated={(apiKey) => {
          setSelectedApiKeyId(apiKey.id)
          setRevealedSecret(apiKey)
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

      <Dialog open={Boolean(revealedSecret)} onOpenChange={(open) => !open && setRevealedSecret(null)}>
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
            <Button type="button" onClick={() => setRevealedSecret(null)}>
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
                if (!rotateTarget) {
                  return
                }

                try {
                  const rotatedKey = await rotateMutation.mutateAsync({
                    keyId: rotateTarget.id,
                  })
                  setRotateTarget(null)
                  setSelectedApiKeyId(rotatedKey.id)
                  setRevealedSecret(rotatedKey)
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
              disabled={deleteMutation.isPending || !deleteTarget}
              onClick={async () => {
                if (!deleteTarget) {
                  return
                }

                try {
                  await deleteMutation.mutateAsync(deleteTarget.id)
                  setDeleteTarget(null)

                  if (selectedApiKeyId === deleteTarget.id) {
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
