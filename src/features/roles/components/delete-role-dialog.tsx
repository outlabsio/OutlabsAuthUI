import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useDeleteRoleMutation } from '@/features/roles/hooks/use-delete-role-mutation'
import type { Role } from '@/features/roles/types/roles.types'
import {
  getRoleBlastRadiusLabel,
  getRoleScopeSummary,
  getRoleTypeLabel,
} from '@/features/roles/utils/role-display'
import { getApiErrorMessage } from '@/lib/api/errors'

type DeleteRoleDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  role?: Role | null
  onDeleted?: () => void
}

export function DeleteRoleDialog({
  open,
  onOpenChange,
  role,
  onDeleted,
}: DeleteRoleDialogProps) {
  const deleteRoleMutation = useDeleteRoleMutation()
  const errorMessage = deleteRoleMutation.error
    ? getApiErrorMessage(deleteRoleMutation.error, 'The role could not be deleted.')
    : null

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          deleteRoleMutation.reset()
        }

        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Delete role</DialogTitle>
        </DialogHeader>

        {role ? (
          <div className="space-y-4">
            <div className="rounded-2xl border bg-muted/20 px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-base font-semibold">{role.display_name}</div>
                <Badge variant="outline">{getRoleTypeLabel(role)}</Badge>
                {role.is_system_role ? <Badge variant="secondary">System</Badge> : null}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {role.description || getRoleScopeSummary(role)}
              </p>
            </div>

            <div className="space-y-2 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-4 text-sm">
              <div className="font-medium text-destructive">Blast radius</div>
              <p className="text-destructive/90">
                {getRoleBlastRadiusLabel(role)}
              </p>
              <p className="text-destructive/90">
                Deleting this role removes it from future assignment and can revoke existing role links across direct users and entity memberships.
              </p>
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
            disabled={deleteRoleMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleteRoleMutation.isPending || !role || role.is_system_role}
            onClick={async () => {
              if (!role) {
                return
              }

              try {
                await deleteRoleMutation.mutateAsync({
                  roleId: role.id,
                })
                onDeleted?.()
                onOpenChange(false)
              } catch {
                return
              }
            }}
          >
            {deleteRoleMutation.isPending ? 'Deleting…' : 'Delete role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
