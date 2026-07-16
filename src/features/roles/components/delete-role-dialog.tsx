import { AppConfirmDialog } from '@/components/app/app-confirm-dialog'
import { AppStatusCallout } from '@/components/app/app-status-callout'
import { Badge } from '@/components/ui/badge'
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
    <AppConfirmDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          deleteRoleMutation.reset()
        }

        onOpenChange(nextOpen)
      }}
      title="Delete role"
      errorMessage={errorMessage}
      confirmLabel="Delete role"
      confirmLabelPending="Deleting..."
      confirmDisabled={!role || role.is_system_role}
      isPending={deleteRoleMutation.isPending}
      onConfirm={async () => {
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

          <AppStatusCallout color="warning" appearance="soft" title="Blast radius">
            <div className="space-y-2">
              <p>{getRoleBlastRadiusLabel(role)}</p>
              <p>
                Deleting this role removes it from future assignment and can
                revoke existing role links across direct users and entity
                memberships.
              </p>
            </div>
          </AppStatusCallout>
        </div>
      ) : null}
    </AppConfirmDialog>
  )
}
