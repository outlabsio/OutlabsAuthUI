import { useEffect, useMemo, useRef, useState } from 'react'

import { useQuery } from '@tanstack/react-query'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { getRolesQueryOptions } from '@/features/roles/api/roles.query-options'
import {
  formatAssignableTypes,
  getRoleScopeSummary,
} from '@/features/roles/utils/role-display'
import { useAssignRoleToUserMutation } from '@/features/users/hooks/use-assign-role-to-user-mutation'
import type { Role } from '@/features/roles/types/roles.types'
import { getApiErrorMessage } from '@/lib/api/errors'
import { cn } from '@/lib/utils/cn'

type DirectRoleAssignmentDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  assignedRoles: Role[]
  canAssignDirectRoles: boolean
}

export function DirectRoleAssignmentDialog({
  open,
  onOpenChange,
  userId,
  assignedRoles,
  canAssignDirectRoles,
}: DirectRoleAssignmentDialogProps) {
  const previousOpenRef = useRef(open)
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([])
  const assignRoleMutation = useAssignRoleToUserMutation()
  const rolesQuery = useQuery({
    ...getRolesQueryOptions({ limit: 100 }),
    enabled: open && canAssignDirectRoles,
  })

  useEffect(() => {
    const wasOpen = previousOpenRef.current

    if (wasOpen && !open) {
      setSelectedRoleIds([])
      assignRoleMutation.reset()
    }

    previousOpenRef.current = open
  }, [assignRoleMutation, open])

  const assignedRoleIds = useMemo(
    () => new Set(assignedRoles.map((role) => role.id)),
    [assignedRoles]
  )
  const availableRoles = useMemo(
    () =>
      (rolesQuery.data?.items ?? [])
        .filter((role) => role.scope_entity_id == null)
        .sort((left, right) => left.display_name.localeCompare(right.display_name)),
    [rolesQuery.data?.items]
  )
  const submitError = assignRoleMutation.error
    ? getApiErrorMessage(
        assignRoleMutation.error,
        'The selected direct roles could not be assigned.'
      )
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-hidden p-0 sm:max-w-3xl">
        <div className="flex max-h-[calc(100svh-2rem)] flex-col">
          <DialogHeader className="border-b px-6 py-5">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="text-2xl">Assign direct roles</DialogTitle>
              <Badge variant="outline">{selectedRoleIds.length} selected</Badge>
            </div>
          </DialogHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={async (event) => {
              event.preventDefault()

              if (!canAssignDirectRoles || selectedRoleIds.length === 0) {
                return
              }

              try {
                for (const roleId of selectedRoleIds) {
                  await assignRoleMutation.mutateAsync({
                    userId,
                    roleId,
                  })
                }

                onOpenChange(false)
              } catch {
                return
              }
            }}
          >
            <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
              {!canAssignDirectRoles ? (
                <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
                  Your account cannot assign direct roles from this workspace.
                </div>
              ) : rolesQuery.isPending ? (
                <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
                  Loading direct account roles…
                </div>
              ) : rolesQuery.error ? (
                <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-destructive">
                  {getApiErrorMessage(
                    rolesQuery.error,
                    'The direct role catalog could not be loaded.'
                  )}
                </div>
              ) : availableRoles.length > 0 ? (
                <div className="overflow-hidden rounded-xl border bg-background">
                  <div className="divide-y">
                    {availableRoles.map((role) => {
                      const isAssigned = assignedRoleIds.has(role.id)
                      const checked = selectedRoleIds.includes(role.id)
                      const inputId = `direct-role-${role.id}`
                      const assignableTypes = formatAssignableTypes(role)

                      return (
                        <div
                          key={role.id}
                          className={cn(
                            'px-5 py-4 transition-colors',
                            checked ? 'bg-muted/30' : 'bg-background'
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              id={inputId}
                              checked={checked}
                              disabled={isAssigned || assignRoleMutation.isPending}
                              onCheckedChange={(nextChecked) => {
                                const nextRoleIds = nextChecked
                                  ? [...selectedRoleIds, role.id]
                                  : selectedRoleIds.filter(
                                      (selectedRoleId) => selectedRoleId !== role.id
                                    )

                                setSelectedRoleIds(nextRoleIds)
                              }}
                              className="mt-1"
                            />

                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Label
                                  htmlFor={inputId}
                                  className={cn(
                                    'text-sm font-medium',
                                    isAssigned ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
                                  )}
                                >
                                  {role.display_name}
                                </Label>
                                {role.is_global ? <Badge variant="outline">Global</Badge> : null}
                                <Badge variant="outline">
                                  {role.permissions.length} permissions
                                </Badge>
                                {isAssigned ? <Badge variant="secondary">Assigned</Badge> : null}
                              </div>

                              <p className="text-sm leading-6 text-muted-foreground">
                                {role.description || role.name}
                              </p>

                              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                <span>{getRoleScopeSummary(role)}</span>
                                {assignableTypes ? <span>Assignable at: {assignableTypes}</span> : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
                  No direct account roles are available for this backend.
                </div>
              )}

              {submitError ? (
                <div className="mt-4">
                  <FieldError>{submitError}</FieldError>
                </div>
              ) : null}
            </div>

            <DialogFooter className="mt-0 shrink-0 !mx-0 !mb-0 rounded-b-[inherit] px-6 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  !canAssignDirectRoles ||
                  assignRoleMutation.isPending ||
                  selectedRoleIds.length === 0
                }
              >
                {assignRoleMutation.isPending ? 'Assigning roles...' : 'Assign roles'}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
