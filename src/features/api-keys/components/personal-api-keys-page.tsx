import { useMemo, useState } from 'react'

import { useQuery } from '@tanstack/react-query'
import { Check, Copy, KeyRound, RefreshCcw, Trash2 } from 'lucide-react'

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { getMyApiKeysQueryOptions } from '@/features/api-keys/api/api-keys.query-options'
import { ApiKeyFormDialog } from '@/features/api-keys/components/api-key-form-dialog'
import { useDeleteApiKeyMutation } from '@/features/api-keys/hooks/use-delete-api-key-mutation'
import { useRotateApiKeyMutation } from '@/features/api-keys/hooks/use-rotate-api-key-mutation'
import type {
  ApiKey,
  ApiKeyStatus,
  CreateApiKeyResponse,
} from '@/features/api-keys/types/api-keys.types'
import { getEntities } from '@/features/entities/api/get-entities'
import { getEntity } from '@/features/entities/api/get-entity'
import type { Entity } from '@/features/entities/types/entities.types'
import { buildEntityOptions } from '@/features/entities/utils/build-entity-options'
import { getMyMemberships } from '@/features/memberships/api/get-my-memberships'
import type { UserMembership } from '@/features/memberships/types/memberships.types'
import { ApiError, getApiErrorMessage } from '@/lib/api/errors'

type PersonalApiKeyContext = {
  entities: Entity[]
  memberships: UserMembership[]
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

function getEffectivenessTone(apiKey: ApiKey): AppStatusTone {
  if (apiKey.status === 'revoked') {
    return 'error'
  }

  return apiKey.is_currently_effective ? 'success' : 'warning'
}

async function loadPersonalApiKeyContext(): Promise<PersonalApiKeyContext> {
  const [membershipsResult, entitiesResult] = await Promise.allSettled([
    getMyMemberships({ includeInactive: false }),
    getEntities({
      page: 1,
      limit: 1000,
    }),
  ])

  const memberships =
    membershipsResult.status === 'fulfilled'
      ? membershipsResult.value.filter((membership) => membership.is_currently_valid)
      : []

  let entities: Entity[] = []

  if (entitiesResult.status === 'fulfilled') {
    entities = entitiesResult.value.items
  } else if (
    !(entitiesResult.reason instanceof ApiError) ||
    ![403, 404].includes(entitiesResult.reason.status)
  ) {
    throw entitiesResult.reason
  }

  if (entities.length === 0 && memberships.length > 0) {
    const membershipEntityIds = Array.from(new Set(memberships.map((membership) => membership.entity_id)))
    const entityResults = await Promise.allSettled(
      membershipEntityIds.map(async (entityId) => {
        try {
          return await getEntity(entityId)
        } catch (error) {
          if (error instanceof ApiError && [403, 404].includes(error.status)) {
            return null
          }

          throw error
        }
      })
    )

    entities = entityResults.flatMap((result) =>
      result.status === 'fulfilled' && result.value ? [result.value] : []
    )
  }

  return {
    entities,
    memberships,
  }
}

export function PersonalApiKeysPage() {
  const sessionQuery = useSessionQuery()
  const sessionUser = sessionQuery.data ?? null
  const authConfigQuery = useQuery(getAuthConfigQueryOptions())
  const myKeysQuery = useQuery({
    ...getMyApiKeysQueryOptions(),
    enabled: Boolean(sessionUser?.id),
  })
  const entityHierarchyEnabled = authConfigQuery.data?.features.entity_hierarchy ?? false
  const personalContextQuery = useQuery({
    queryKey: ['api-keys', 'personal-context', sessionUser?.id ?? 'anonymous'],
    queryFn: loadPersonalApiKeyContext,
    enabled: Boolean(sessionUser?.id) && entityHierarchyEnabled,
  })
  const personalContextPending = entityHierarchyEnabled && personalContextQuery.isPending
  const personalContextError = entityHierarchyEnabled ? personalContextQuery.error : null

  const entityOptions = useMemo(() => {
    if (!entityHierarchyEnabled) {
      return []
    }

    const entities = personalContextQuery.data?.entities ?? []
    const memberships = personalContextQuery.data?.memberships ?? []

    if (sessionUser?.is_superuser) {
      return buildEntityOptions(entities)
    }

    const membershipEntityIds = new Set(memberships.map((membership) => membership.entity_id))
    return buildEntityOptions(
      entities.filter((entity) => membershipEntityIds.has(entity.id))
    )
  }, [
    entityHierarchyEnabled,
    personalContextQuery.data?.entities,
    personalContextQuery.data?.memberships,
    sessionUser?.is_superuser,
  ])

  const entityById = useMemo(
    () => new Map(entityOptions.map((entity) => [entity.id, entity])),
    [entityOptions]
  )

  const [dialogState, setDialogState] = useState<{
    open: boolean
    mode: 'create' | 'edit'
    apiKey: ApiKey | null
  }>({
    open: false,
    mode: 'create',
    apiKey: null,
  })
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null)
  const [rotateTarget, setRotateTarget] = useState<ApiKey | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null)
  const [revealedSecret, setRevealedSecret] = useState<CreateApiKeyResponse | null>(null)
  const [secretCopied, setSecretCopied] = useState(false)

  const rotateMutation = useRotateApiKeyMutation()
  const deleteMutation = useDeleteApiKeyMutation()

  const pageError =
    sessionQuery.error ??
    authConfigQuery.error ??
    myKeysQuery.error ??
    personalContextError

  const personalKeys = useMemo(
    () =>
      [...(myKeysQuery.data ?? [])].sort(
        (left, right) =>
          new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
      ),
    [myKeysQuery.data]
  )
  const effectiveSelectedKeyId =
    selectedKeyId && personalKeys.some((apiKey) => apiKey.id === selectedKeyId)
      ? selectedKeyId
      : personalKeys[0]?.id ?? null
  const activeKey =
    personalKeys.find((apiKey) => apiKey.id === effectiveSelectedKeyId) ?? null

  const summary = useMemo(
    () => ({
      total: personalKeys.length,
      active: personalKeys.filter((apiKey) => apiKey.status === 'active').length,
      anchored: personalKeys.filter((apiKey) => (apiKey.entity_ids?.length ?? 0) > 0).length,
    }),
    [personalKeys]
  )

  if (sessionQuery.isPending || authConfigQuery.isPending || myKeysQuery.isPending || personalContextPending) {
    return <AppLoadingState title="Loading personal API keys" />
  }

  if (pageError) {
    return (
      <AppPage title="API Keys" hideTitle padded>
        <AppErrorState>
          {getApiErrorMessage(pageError, 'The personal API keys workspace could not load from the auth API.')}
        </AppErrorState>
      </AppPage>
    )
  }

  if (!(authConfigQuery.data?.features.api_keys ?? true)) {
    return (
      <AppPage title="API Keys" hideTitle padded>
        <div className="rounded-2xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
          The current backend preset does not advertise API key support.
        </div>
      </AppPage>
    )
  }

  function openSecretDialog(apiKey: CreateApiKeyResponse) {
    setSecretCopied(false)
    setRevealedSecret(apiKey)
  }

  function closeSecretDialog() {
    setSecretCopied(false)
    setRevealedSecret(null)
  }

  const shellAction = (
    <Button
      type="button"
      onClick={() =>
        setDialogState({
          open: true,
          mode: 'create',
          apiKey: null,
        })
      }
    >
      <KeyRound className="size-4" />
      Create API key
    </Button>
  )

  return (
    <>
      <AppPage title="API Keys" hideTitle padded shellAction={shellAction}>
        <div className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Total keys</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-semibold">{summary.total}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Active keys</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-semibold">{summary.active}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Anchored keys</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-semibold">{summary.anchored}</CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="gap-2">
              <CardTitle className="text-xl">Personal API keys</CardTitle>
              <p className="text-sm text-muted-foreground">
                Manage your own automation keys through the auth-owned self-service surface. Personal
                keys stay user-owned, while durable non-human integrations live in System API Keys.
              </p>
            </CardHeader>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <Card>
              <CardHeader className="gap-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-xl">Your keys</CardTitle>
                  <Badge variant="outline">{personalKeys.length} total</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {personalKeys.length === 0 ? (
                  <div className="rounded-xl border border-dashed px-4 py-8 text-sm text-muted-foreground">
                    No personal API keys exist yet.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Anchor</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {personalKeys.map((apiKey) => {
                        const isSelected = apiKey.id === activeKey?.id
                        const entityLabel = apiKey.entity_ids?.[0]
                          ? entityById.get(apiKey.entity_ids[0])?.title ?? apiKey.entity_ids[0]
                          : 'Unanchored'

                        return (
                          <TableRow
                            key={apiKey.id}
                            data-state={isSelected ? 'selected' : undefined}
                            className="cursor-pointer"
                            onClick={() => setSelectedKeyId(apiKey.id)}
                          >
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium">{apiKey.name}</div>
                                <div className="font-mono text-xs text-muted-foreground">
                                  {apiKey.prefix}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>{entityLabel}</TableCell>
                            <TableCell>
                              <AppStatusBadge tone={getApiKeyStatusTone(apiKey.status)}>
                                {formatToken(apiKey.status)}
                              </AppStatusBadge>
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
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="text-xl">
                      {activeKey ? activeKey.name : 'Key details'}
                    </CardTitle>
                    <div className="text-sm text-muted-foreground">
                      {activeKey ? activeKey.description || 'No description provided.' : 'Select a key to inspect its policy and lifecycle.'}
                    </div>
                  </div>
                  {activeKey ? (
                    <div className="flex items-center gap-2">
                      <AppStatusBadge tone={getApiKeyStatusTone(activeKey.status)}>
                        {formatToken(activeKey.status)}
                      </AppStatusBadge>
                      <AppStatusBadge tone={getEffectivenessTone(activeKey)}>
                        {activeKey.is_currently_effective ? 'Effective' : 'Ineffective'}
                      </AppStatusBadge>
                    </div>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!activeKey ? (
                  <div className="rounded-xl border border-dashed px-4 py-8 text-sm text-muted-foreground">
                    Select a personal key to review its scopes, entity anchor, and lifecycle details.
                  </div>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border bg-muted/20 px-4 py-3">
                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Anchor entity
                        </div>
                        <div className="mt-1 text-sm font-medium">
                          {activeKey.entity_ids?.[0]
                            ? entityById.get(activeKey.entity_ids[0])?.pathLabel ?? activeKey.entity_ids[0]
                            : 'Unanchored'}
                        </div>
                      </div>
                      <div className="rounded-2xl border bg-muted/20 px-4 py-3">
                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Hierarchy
                        </div>
                        <div className="mt-1 text-sm font-medium">
                          {activeKey.inherit_from_tree ? 'Descendants allowed' : 'Exact anchor only'}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border bg-muted/20 px-4 py-3">
                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Created
                        </div>
                        <div className="mt-1 text-sm font-medium">{formatDateTime(activeKey.created_at)}</div>
                      </div>
                      <div className="rounded-2xl border bg-muted/20 px-4 py-3">
                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Last used
                        </div>
                        <div className="mt-1 text-sm font-medium">{formatDateTime(activeKey.last_used_at)}</div>
                      </div>
                      <div className="rounded-2xl border bg-muted/20 px-4 py-3">
                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Expires
                        </div>
                        <div className="mt-1 text-sm font-medium">{formatDateTime(activeKey.expires_at)}</div>
                      </div>
                      <div className="rounded-2xl border bg-muted/20 px-4 py-3">
                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Rate limit
                        </div>
                        <div className="mt-1 text-sm font-medium">{activeKey.rate_limit_per_minute}/minute</div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        Scopes
                      </div>
                      {activeKey.scopes.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {activeKey.scopes.map((scope) => (
                            <Badge key={scope} variant="secondary">
                              {scope}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          No scopes are currently assigned to this key.
                        </div>
                      )}
                    </div>

                    {activeKey.ineffective_reasons?.length ? (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                        {activeKey.ineffective_reasons.map((reason) => formatToken(reason)).join(', ')}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setDialogState({
                            open: true,
                            mode: 'edit',
                            apiKey: activeKey,
                          })
                        }
                      >
                        Edit key
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={activeKey.status === 'revoked' || rotateMutation.isPending}
                        onClick={() => setRotateTarget(activeKey)}
                      >
                        <RefreshCcw className="size-4" />
                        Rotate key
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={activeKey.status === 'revoked' || deleteMutation.isPending}
                        onClick={() => setDeleteTarget(activeKey)}
                      >
                        <Trash2 className="size-4" />
                        Revoke key
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </AppPage>

      <ApiKeyFormDialog
        open={dialogState.open}
        mode={dialogState.mode}
        apiKey={dialogState.apiKey}
        entityOptions={entityOptions}
        entityHierarchyEnabled={entityHierarchyEnabled}
        onOpenChange={(open) =>
          setDialogState((current) => ({
            ...current,
            open,
          }))
        }
        onCreated={(apiKey) => {
          setSelectedKeyId(apiKey.id)
          openSecretDialog(apiKey)
          setDialogState({
            open: false,
            mode: 'create',
            apiKey: null,
          })
        }}
        onUpdated={(apiKey) => {
          setSelectedKeyId(apiKey.id)
          setDialogState({
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
              automation environment before closing this dialog.
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
              Rotating this key creates a replacement secret and revokes the current secret immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRotateTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={rotateMutation.isPending || !rotateTarget}
              onClick={async () => {
                if (!rotateTarget) {
                  return
                }

                try {
                  const rotatedKey = await rotateMutation.mutateAsync({
                    keyId: rotateTarget.id,
                  })
                  setSelectedKeyId(rotatedKey.id)
                  setRotateTarget(null)
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
              Revoking this personal key immediately blocks future use. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
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
                  await deleteMutation.mutateAsync({
                    keyId: deleteTarget.id,
                  })
                  setDeleteTarget(null)
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
