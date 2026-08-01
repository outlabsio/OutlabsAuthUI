import { useMemo, useState } from 'react'

import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'

import { AppErrorState } from '@/components/app/app-error-state'
import { AppStatusBadge } from '@/components/app/app-status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Label } from '@/components/ui/label'
import { buildEntityOptions } from '@/features/entities/utils/build-entity-options'
import type { Entity } from '@/features/entities/types/entities.types'
import { getPermissionsQueryOptions } from '@/features/permissions/api/permissions.query-options'
import { useCheckPermissionsMutation } from '@/features/permissions/hooks/use-check-permissions-mutation'
import type { CheckPermissionsResponse } from '@/features/permissions/types/permissions.types'
import { getApiErrorMessage } from '@/lib/api/errors'

type PermissionOption = {
  id: string
  name: string
  displayName: string
  subtitle: string
}

type PermissionCheckDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  userLabel: string
  entities: Entity[]
  entityHierarchyEnabled: boolean
}

export function PermissionCheckDialog({
  open,
  onOpenChange,
  userId,
  userLabel,
  entities,
  entityHierarchyEnabled,
}: PermissionCheckDialogProps) {
  const [selectedPermissionNames, setSelectedPermissionNames] = useState<string[]>(
    []
  )
  const [pendingPermission, setPendingPermission] =
    useState<PermissionOption | null>(null)
  const [selectedEntityId, setSelectedEntityId] = useState<string | undefined>()
  const [result, setResult] = useState<CheckPermissionsResponse | null>(null)
  const checkPermissionsMutation = useCheckPermissionsMutation()

  const permissionsQuery = useQuery({
    ...getPermissionsQueryOptions({
      page: 1,
      limit: 1000,
    }),
    enabled: open,
  })

  const permissionOptions = useMemo<PermissionOption[]>(
    () =>
      (permissionsQuery.data?.items ?? [])
        .filter((permission) => permission.is_active)
        .map((permission) => ({
          id: permission.id,
          name: permission.name,
          displayName: permission.display_name,
          subtitle: permission.name,
        }))
        .sort((left, right) => left.displayName.localeCompare(right.displayName)),
    [permissionsQuery.data?.items]
  )

  const availablePermissionOptions = useMemo(
    () =>
      permissionOptions.filter(
        (option) => !selectedPermissionNames.includes(option.name)
      ),
    [permissionOptions, selectedPermissionNames]
  )

  const entityOptions = useMemo(
    () => buildEntityOptions(entities),
    [entities]
  )
  const selectedEntity =
    entityOptions.find((option) => option.id === selectedEntityId) ?? null

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setSelectedPermissionNames([])
      setPendingPermission(null)
      setSelectedEntityId(undefined)
      setResult(null)
      checkPermissionsMutation.reset()
    }

    onOpenChange(nextOpen)
  }

  async function handleCheck() {
    if (selectedPermissionNames.length === 0) {
      return
    }

    const response = await checkPermissionsMutation.mutateAsync({
      userId,
      permissions: selectedPermissionNames,
      entityId: selectedEntityId,
    })
    setResult(response)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Check permissions</DialogTitle>
          <DialogDescription>
            Evaluate whether {userLabel} currently has selected permissions
            {entityHierarchyEnabled
              ? ', optionally inside a specific entity context.'
              : '.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="permission-check-permission">Permissions</Label>
            <Combobox
              items={availablePermissionOptions}
              itemToStringValue={(item) =>
                item ? `${item.displayName} ${item.name}` : ''
              }
              value={pendingPermission}
              onValueChange={(value) => {
                if (!value || selectedPermissionNames.includes(value.name)) {
                  setPendingPermission(null)
                  return
                }

                setSelectedPermissionNames((current) => [...current, value.name])
                setPendingPermission(null)
                setResult(null)
              }}
            >
              <ComboboxInput
                id="permission-check-permission"
                placeholder="Add a permission to check"
                aria-label="Add a permission to check"
                className="w-full min-w-0"
              />
              <ComboboxContent align="start">
                <ComboboxEmpty>No matching permissions.</ComboboxEmpty>
                <ComboboxList>
                  {(option) => (
                    <ComboboxItem
                      key={option.id}
                      value={option}
                      className="items-start py-2.5"
                    >
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="font-medium">{option.displayName}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {option.subtitle}
                        </span>
                      </div>
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            {selectedPermissionNames.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {selectedPermissionNames.map((permissionName) => (
                  <Badge key={permissionName} variant="outline" className="gap-1 pr-1">
                    {permissionName}
                    <button
                      type="button"
                      className="rounded-sm p-0.5 hover:bg-muted"
                      aria-label={`Remove ${permissionName}`}
                      onClick={() => {
                        setSelectedPermissionNames((current) =>
                          current.filter((name) => name !== permissionName)
                        )
                        setResult(null)
                      }}
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Add one or more permissions to evaluate.
              </p>
            )}
          </div>

          {entityHierarchyEnabled ? (
            <div className="space-y-2">
              <Label htmlFor="permission-check-entity">Entity context</Label>
              <Combobox
                items={entityOptions}
                itemToStringValue={(item) =>
                  item ? `${item.title} ${item.pathLabel} ${item.entityTypeLabel}` : ''
                }
                value={selectedEntity}
                onValueChange={(value) => {
                  setSelectedEntityId(value?.id)
                  setResult(null)
                }}
              >
                <ComboboxInput
                  id="permission-check-entity"
                  placeholder="Global aggregate (no entity)"
                  aria-label="Entity context for permission check"
                  className="w-full min-w-0"
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
                          <span className="font-medium">{option.title}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {option.pathLabel}
                          </span>
                        </div>
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              <p className="text-xs text-muted-foreground">
                With an entity selected, checks include direct membership grants and
                tree permissions inherited from ancestors.
              </p>
            </div>
          ) : null}

          {checkPermissionsMutation.error ? (
            <AppErrorState compact>
              {getApiErrorMessage(
                checkPermissionsMutation.error,
                'The permission check could not be completed.'
              )}
            </AppErrorState>
          ) : null}

          {result ? (
            <div className="space-y-3 rounded-lg border bg-muted/30 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">Check result</div>
                <AppStatusBadge
                  tone={result.has_all_permissions ? 'success' : 'warning'}
                >
                  {result.has_all_permissions ? 'All granted' : 'Partial or denied'}
                </AppStatusBadge>
              </div>
              <div className="space-y-2">
                {selectedPermissionNames.map((permissionName) => {
                  const granted = result.results[permissionName] === true

                  return (
                    <div
                      key={permissionName}
                      className="flex items-center justify-between gap-3 rounded-md border bg-background/80 px-3 py-2"
                    >
                      <span className="truncate text-sm font-medium">
                        {permissionName}
                      </span>
                      <AppStatusBadge tone={granted ? 'success' : 'error'}>
                        {granted ? 'Granted' : 'Denied'}
                      </AppStatusBadge>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              handleOpenChange(false)
            }}
          >
            Close
          </Button>
          <Button
            type="button"
            onClick={() => {
              void handleCheck()
            }}
            disabled={
              selectedPermissionNames.length === 0 ||
              checkPermissionsMutation.isPending
            }
          >
            {checkPermissionsMutation.isPending ? 'Checking...' : 'Run check'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
