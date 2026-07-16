import { useEffect, useMemo, useState } from 'react'

import { AppConfirmDialog } from '@/components/app/app-confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useMoveEntityMutation } from '@/features/entities/hooks/use-move-entity-mutation'
import type { Entity } from '@/features/entities/types/entities.types'
import {
  formatEntityToken,
  getEntityClassLabel,
} from '@/features/entities/utils/entity-display'
import { getApiErrorMessage } from '@/lib/api/errors'

const PROMOTE_TO_ROOT_VALUE = '__promote_to_root__'

type MoveEntityDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  entity?: Entity | null
  parentOptions: Entity[]
  canPromoteToRoot?: boolean
  onMoved?: (entity: Entity) => void
}

export function MoveEntityDialog({
  open,
  onOpenChange,
  entity,
  parentOptions,
  canPromoteToRoot = true,
  onMoved,
}: MoveEntityDialogProps) {
  const moveEntityMutation = useMoveEntityMutation()
  const [newParentId, setNewParentId] = useState<string>('')
  const errorMessage = moveEntityMutation.error
    ? getApiErrorMessage(moveEntityMutation.error, 'The entity could not be moved.')
    : null

  const sortedParentOptions = useMemo(
    () =>
      [...parentOptions].sort((left, right) =>
        left.display_name.localeCompare(right.display_name)
      ),
    [parentOptions]
  )
  const hasMoveTargets = sortedParentOptions.length > 0 || canPromoteToRoot
  const isPromoteToRoot = newParentId === PROMOTE_TO_ROOT_VALUE

  useEffect(() => {
    if (!open) {
      return
    }

    const currentParentId = entity?.parent_entity_id ?? ''
    const preferredParent =
      sortedParentOptions.find((option) => option.id === currentParentId) ??
      sortedParentOptions[0]

    if (preferredParent) {
      setNewParentId(preferredParent.id)
      return
    }

    setNewParentId(canPromoteToRoot ? PROMOTE_TO_ROOT_VALUE : '')
  }, [canPromoteToRoot, entity?.parent_entity_id, open, sortedParentOptions])

  const selectedParent =
    sortedParentOptions.find((option) => option.id === newParentId) ?? null
  const isUnchanged = Boolean(
    entity &&
      ((isPromoteToRoot && entity.parent_entity_id == null) ||
        (selectedParent && entity.parent_entity_id === selectedParent.id))
  )
  const canConfirm =
    Boolean(entity) &&
    hasMoveTargets &&
    !isUnchanged &&
    (isPromoteToRoot || selectedParent != null)

  return (
    <AppConfirmDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setNewParentId('')
          moveEntityMutation.reset()
        }

        onOpenChange(nextOpen)
      }}
      title="Move entity"
      confirmVariant="default"
      confirmLabel={isPromoteToRoot ? 'Promote to root' : 'Move entity'}
      confirmLabelPending={isPromoteToRoot ? 'Promoting...' : 'Moving...'}
      confirmDisabled={!canConfirm}
      isPending={moveEntityMutation.isPending}
      errorMessage={errorMessage}
      onConfirm={async () => {
        if (!entity || !canConfirm) {
          return
        }

        try {
          const movedEntity = await moveEntityMutation.mutateAsync({
            entityId: entity.id,
            newParentId: isPromoteToRoot ? null : selectedParent!.id,
          })
          onMoved?.(movedEntity)
          onOpenChange(false)
        } catch {
          return
        }
      }}
    >
      {entity ? (
        <div className="space-y-4">
          <div className="rounded-2xl border bg-muted/20 px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-base font-semibold">{entity.display_name}</div>
              <Badge variant="outline">
                {formatEntityToken(entity.entity_type)}
              </Badge>
              <Badge variant="secondary">
                {getEntityClassLabel(entity.entity_class)}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Choose a new parent in the hierarchy, or promote this entity to an
              organization root. Descendants move with it.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="move-entity-parent">New parent</Label>
            {!hasMoveTargets ? (
              <p className="text-sm text-muted-foreground">
                No valid move targets are available for this entity.
              </p>
            ) : (
              <Select
                value={newParentId}
                onValueChange={(nextValue) => {
                  if (!nextValue) {
                    return
                  }

                  setNewParentId(nextValue)
                }}
              >
                <SelectTrigger
                  id="move-entity-parent"
                  className="w-full"
                  aria-label="New parent"
                >
                  <SelectValue placeholder="Select a parent entity" />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {canPromoteToRoot ? (
                    <SelectItem value={PROMOTE_TO_ROOT_VALUE}>
                      Organization root (no parent)
                    </SelectItem>
                  ) : null}
                  {sortedParentOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      ) : null}
    </AppConfirmDialog>
  )
}
