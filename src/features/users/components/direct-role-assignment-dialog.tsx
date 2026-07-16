import { useEffect, useMemo } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'

import { AppDateTimePicker } from '@/components/app/app-date-time-picker'
import { AppEmptyState } from '@/components/app/app-empty-state'
import { AppErrorState } from '@/components/app/app-error-state'
import { AppFormField } from '@/components/app/app-form-field'
import { AppInfoPopover } from '@/components/app/app-info-popover'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field'
import { getRolesQueryOptions } from '@/features/roles/api/roles.query-options'
import { AssignableRolesTable } from '@/features/roles/components/assignable-roles-table'
import { useAssignRoleToUserMutation } from '@/features/users/hooks/use-assign-role-to-user-mutation'
import {
  type DirectRoleAssignmentFormValues,
  directRoleAssignmentSchema,
} from '@/features/users/schemas/direct-role-assignment.schema'
import type { Role } from '@/features/roles/types/roles.types'
import { getApiErrorMessage } from '@/lib/api/errors'

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
  const assignRoleMutation = useAssignRoleToUserMutation()
  const form = useForm<DirectRoleAssignmentFormValues>({
    resolver: zodResolver(directRoleAssignmentSchema),
    defaultValues: {
      roleIds: [],
      validFrom: '',
      validUntil: '',
    },
  })
  const rolesQuery = useQuery({
    ...getRolesQueryOptions({ limit: 100 }),
    enabled: open && canAssignDirectRoles,
  })

  useEffect(() => {
    if (open) {
      return
    }

    form.reset({
      roleIds: [],
      validFrom: '',
      validUntil: '',
    })
    assignRoleMutation.reset()
  }, [assignRoleMutation, form, open])

  const assignedRoleIds = useMemo(
    () => assignedRoles.map((role) => role.id),
    [assignedRoles]
  )
  const availableRoles = useMemo(
    () =>
      (rolesQuery.data?.items ?? [])
        .filter((role) => role.scope_entity_id == null)
        .sort((left, right) => left.display_name.localeCompare(right.display_name)),
    [rolesQuery.data?.items]
  )
  const selectedRoleIds = form.watch('roleIds')
  const submitError = assignRoleMutation.error
    ? getApiErrorMessage(
        assignRoleMutation.error,
        'The selected direct roles could not be assigned.'
      )
    : null

  function handleDialogOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-hidden p-0 sm:max-w-3xl">
        <div className="flex max-h-[calc(100svh-2rem)] flex-col">
          <DialogHeader className="border-b px-6 py-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-2xl">Assign direct roles</DialogTitle>
                <AppInfoPopover
                  label="Explain direct role assignment"
                  title="Direct role assignment"
                >
                  Direct roles apply to the account itself. Use entity memberships for access that
                  should stay scoped to one branch of the hierarchy.
                </AppInfoPopover>
              </div>
              <Badge variant="outline">{selectedRoleIds.length} selected</Badge>
            </div>
          </DialogHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={form.handleSubmit(async (values) => {
              if (!canAssignDirectRoles) {
                return
              }

              try {
                for (const roleId of values.roleIds) {
                  await assignRoleMutation.mutateAsync({
                    userId,
                    roleId,
                    valid_from: values.validFrom
                      ? new Date(values.validFrom).toISOString()
                      : undefined,
                    valid_until: values.validUntil
                      ? new Date(values.validUntil).toISOString()
                      : undefined,
                  })
                }

                handleDialogOpenChange(false)
              } catch {
                return
              }
            })}
          >
            <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
              {!canAssignDirectRoles ? (
                <AppEmptyState
                  title="Direct role assignment unavailable"
                  description="Your account cannot assign direct roles from this workspace."
                  compact
                />
              ) : rolesQuery.isPending ? (
                <AppEmptyState
                  title="Loading direct account roles..."
                  compact
                />
              ) : rolesQuery.error ? (
                <AppErrorState>
                  {getApiErrorMessage(
                    rolesQuery.error,
                    'The direct role catalog could not be loaded.'
                  )}
                </AppErrorState>
              ) : availableRoles.length > 0 ? (
                <div className="space-y-4">
                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span>Assignment window</span>
                      <AppInfoPopover
                        label="Explain direct role assignment window"
                        title="Assignment window"
                      >
                        This validity window is optional. If you set one, the same dates will be
                        applied to every selected direct role.
                      </AppInfoPopover>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <Controller
                        name="validFrom"
                        control={form.control}
                        render={({ field }) => (
                          <AppFormField
                            label="Valid from"
                            htmlFor="direct-role-valid-from"
                          >
                            <AppDateTimePicker
                              id="direct-role-valid-from"
                              value={field.value ?? ''}
                              onChange={field.onChange}
                              disabled={assignRoleMutation.isPending}
                              placeholder="Pick a start date"
                            />
                          </AppFormField>
                        )}
                      />
                      <Controller
                        name="validUntil"
                        control={form.control}
                        render={({ field, fieldState }) => (
                          <AppFormField
                            label="Valid until"
                            htmlFor="direct-role-valid-until"
                            errors={[fieldState.error]}
                          >
                            <AppDateTimePicker
                              id="direct-role-valid-until"
                              value={field.value ?? ''}
                              onChange={field.onChange}
                              disabled={assignRoleMutation.isPending}
                              placeholder="Pick an end date"
                            />
                          </AppFormField>
                        )}
                      />
                    </div>
                  </div>

                  <Controller
                    name="roleIds"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <div className="space-y-2">
                        <AssignableRolesTable
                          roles={availableRoles}
                          selectedRoleIds={field.value}
                          lockedRoleIds={assignedRoleIds}
                          lockedRoleLabel="Assigned"
                          onRoleToggle={(roleId, checked) => {
                            const nextRoleIds = checked
                              ? [...field.value, roleId]
                              : field.value.filter(
                                  (selectedRoleId) => selectedRoleId !== roleId
                                )

                            field.onChange(nextRoleIds)
                          }}
                          disabled={assignRoleMutation.isPending}
                          emptyMessage="No direct account roles are available for this backend."
                          searchPlaceholder="Search direct roles"
                          toolbarActions={
                            assignedRoleIds.length > 0 ? (
                              <Badge variant="secondary">
                                {assignedRoleIds.length} already assigned
                              </Badge>
                            ) : null
                          }
                        />
                        <FieldError errors={[fieldState.error]} />
                      </div>
                    )}
                  />
                </div>
              ) : (
                <AppEmptyState
                  title="No direct account roles are available for this backend."
                  compact
                />
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
                onClick={() => handleDialogOpenChange(false)}
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
