import { useState } from 'react'

import { AppConfirmDialog } from '@/components/app/app-confirm-dialog'
import { AppStatusCallout } from '@/components/app/app-status-callout'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useDeleteEntityMutation } from '@/features/entities/hooks/use-delete-entity-mutation'
import type { Entity } from '@/features/entities/types/entities.types'
import {
  formatEntityToken,
  getEntityClassLabel,
} from '@/features/entities/utils/entity-display'
import { getApiErrorMessage } from '@/lib/api/errors'

type DeleteEntityDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  entity?: Entity | null
  childCount: number
  onDeleted?: (entity: Entity) => void
}

export function DeleteEntityDialog({
  open,
  onOpenChange,
  entity,
  childCount,
  onDeleted,
}: DeleteEntityDialogProps) {
  const deleteEntityMutation = useDeleteEntityMutation()
  const [cascade, setCascade] = useState(false)
  const hasChildren = childCount > 0
  const errorMessage = deleteEntityMutation.error
    ? getApiErrorMessage(
        deleteEntityMutation.error,
        'The entity could not be archived.'
      )
    : null

  return (
    <AppConfirmDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setCascade(false)
          deleteEntityMutation.reset()
        }

        onOpenChange(nextOpen)
      }}
      title="Archive entity"
      description="Backend delete soft-archives the entity and retires related access."
      errorMessage={errorMessage}
      confirmLabel="Archive entity"
      confirmLabelPending="Archiving..."
      confirmDisabled={!entity || (hasChildren && !cascade)}
      isPending={deleteEntityMutation.isPending}
      onConfirm={async () => {
        if (!entity) {
          return
        }

        try {
          await deleteEntityMutation.mutateAsync({
            entityId: entity.id,
            cascade: hasChildren ? cascade : false,
          })
          onDeleted?.(entity)
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
              {entity.description ||
                'This marks the entity as archived and revokes related memberships, roles, and keys.'}
            </p>
          </div>

          <AppStatusCallout
            color="warning"
            appearance="soft"
            title="Destructive action"
          >
            <div className="space-y-2">
              <p>
                Archiving sets status to archived, removes closure links, and
                retires memberships, role links, and entity API credentials for
                this node.
              </p>
              {hasChildren ? (
                <p>
                  This entity has {childCount} direct child
                  {childCount === 1 ? '' : 'ren'}. Cascade archive is required to
                  continue.
                </p>
              ) : null}
            </div>
          </AppStatusCallout>

          {hasChildren ? (
            <div className="flex items-start gap-3 rounded-2xl border px-4 py-3">
              <Checkbox
                id="delete-entity-cascade"
                checked={cascade}
                onCheckedChange={(checked) => setCascade(Boolean(checked))}
              />
              <div className="space-y-1">
                <Label htmlFor="delete-entity-cascade">
                  Cascade archive all active descendants
                </Label>
                <p className="text-sm text-muted-foreground">
                  Required when the entity still has active children.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </AppConfirmDialog>
  )
}
