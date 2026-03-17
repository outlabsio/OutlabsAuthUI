import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useDeletePermissionMutation } from '@/features/permissions/hooks/use-delete-permission-mutation'
import type { Permission } from '@/features/permissions/types/permissions.types'
import {
  getPermissionBehaviorSummary,
  getPermissionOperationalSummary,
} from '@/features/permissions/utils/permissions-display'
import { getApiErrorMessage } from '@/lib/api/errors'

type DeletePermissionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  permission?: Permission | null
  linkedRolesCount?: number
  onDeleted?: () => void
}

export function DeletePermissionDialog({
  open,
  onOpenChange,
  permission,
  linkedRolesCount = 0,
  onDeleted,
}: DeletePermissionDialogProps) {
  const deletePermissionMutation = useDeletePermissionMutation()
  const errorMessage = deletePermissionMutation.error
    ? getApiErrorMessage(
        deletePermissionMutation.error,
        'The permission could not be deleted.'
      )
    : null

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          deletePermissionMutation.reset()
        }

        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Delete permission</DialogTitle>
        </DialogHeader>

        {permission ? (
          <div className="space-y-4">
            <div className="rounded-2xl border bg-muted/20 px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-base font-semibold">{permission.display_name}</div>
                <Badge variant="outline" className="font-mono">
                  {permission.name}
                </Badge>
                {permission.is_system ? <Badge variant="secondary">System</Badge> : null}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {permission.description || getPermissionBehaviorSummary(permission)}
              </p>
            </div>

            <div className="space-y-2 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-4 text-sm">
              <div className="font-medium text-destructive">Blast radius</div>
              <p className="text-destructive/90">{getPermissionOperationalSummary(permission)}</p>
              <p className="text-destructive/90">
                Deleting this permission removes it from the catalog and strips it from any linked roles.
              </p>
              {linkedRolesCount > 0 ? (
                <p className="text-destructive/90">
                  The current workspace can see {linkedRolesCount} role
                  {linkedRolesCount === 1 ? '' : 's'} using this permission.
                </p>
              ) : null}
            </div>

            {errorMessage ? (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {errorMessage}
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deletePermissionMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deletePermissionMutation.isPending || !permission || permission.is_system}
            onClick={async () => {
              if (!permission) {
                return
              }

              try {
                await deletePermissionMutation.mutateAsync({
                  permissionId: permission.id,
                })
                onDeleted?.()
                onOpenChange(false)
              } catch {
                return
              }
            }}
          >
            {deletePermissionMutation.isPending ? 'Deleting…' : 'Delete permission'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
