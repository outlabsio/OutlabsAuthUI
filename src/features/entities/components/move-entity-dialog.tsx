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

type MoveEntityDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  entity?: Entity | null
  parentOptions: Entity[]
  onMoved?: (entity: Entity) => void
}

export function MoveEntityDialog({
  open,
  onOpenChange,
  entity,
  parentOptions,
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

  useEffect(() => {
    if (!open) {
      return
    }

    const currentParentId = entity?.parent_entity_id ?? ''
    const preferredParent =
      sortedParentOptions.find((option) => option.id === currentParentId) ??
      sortedParentOptions[0]

    setNewParentId(preferredParent?.id ?? '')
  }, [entity?.parent_entity_id, open, sortedParentOptions])

  const selectedParent =
    sortedParentOptions.find((option) => option.id === newParentId) ?? null
  const isUnchanged = Boolean(
    entity && selectedParent && entity.parent_entity_id === selectedParent.id
  )

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
      confirmLabel="Move entity"
      confirmLabelPending="Moving..."
      confirmDisabled={
        !entity || !selectedParent || isUnchanged || sortedParentOptions.length === 0
      }
      isPending={moveEntityMutation.isPending}
      errorMessage={errorMessage}
      onConfirm={async () => {
        if (!entity || !selectedParent) {
          return
        }

        try {
          const movedEntity = await moveEntityMutation.mutateAsync({
            entityId: entity.id,
            newParentId: selectedParent.id,
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
              Choose a new parent in the current hierarchy. Descendants move with
              this entity.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="move-entity-parent">New parent</Label>
            {sortedParentOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No valid parent targets are available in this scope.
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
