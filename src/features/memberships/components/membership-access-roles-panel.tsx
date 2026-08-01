import { AppInfoPopover } from '@/components/app/app-info-popover'
import { AssignableRolesTable } from '@/features/roles/components/assignable-roles-table'
import type { Role } from '@/features/roles/types/roles.types'
import { getApiErrorMessage } from '@/lib/api/errors'

type MembershipAccessRolesPanelProps = {
  roles: Role[]
  selectedRoleIds: string[]
  disabled?: boolean
  isLoading?: boolean
  error?: unknown
  emptyMessage?: string
  infoContent?: string
  onRoleToggle: (roleId: string, checked: boolean) => void
}

export function MembershipAccessRolesPanel({
  roles,
  selectedRoleIds,
  disabled = false,
  isLoading = false,
  error,
  emptyMessage = 'No roles are currently available for this entity.',
  infoContent = 'These roles are available for the selected entity. They affect this membership only, not the user account globally.',
  onRoleToggle,
}: MembershipAccessRolesPanelProps) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border">
      <div className="border-b px-4 py-4">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">Roles</h3>
          <AppInfoPopover label="Explain membership roles" title="Membership roles">
            {infoContent}
          </AppInfoPopover>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex min-h-full items-center justify-center px-6 py-10 text-sm text-muted-foreground">
            Loading roles…
          </div>
        ) : error ? (
          <div className="px-6 py-6 text-sm text-destructive">
            {getApiErrorMessage(
              error,
              'The role catalog for this entity could not be loaded.'
            )}
          </div>
        ) : roles.length > 0 ? (
          <AssignableRolesTable
            roles={roles}
            selectedRoleIds={selectedRoleIds}
            onRoleToggle={onRoleToggle}
            disabled={disabled}
            emptyMessage={emptyMessage}
            searchPlaceholder="Search roles for this membership"
          />
        ) : (
          <div className="flex min-h-full items-center justify-center px-6 py-10 text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        )}
      </div>
    </section>
  )
}
