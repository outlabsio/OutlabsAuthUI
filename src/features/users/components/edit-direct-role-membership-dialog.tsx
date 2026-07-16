import { useEffect, useRef } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'

import { AppDateTimePicker } from '@/components/app/app-date-time-picker'
import { AppFormField } from '@/components/app/app-form-field'
import { AppInfoPopover } from '@/components/app/app-info-popover'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field'
import { useUpdateUserRoleMembershipMutation } from '@/features/users/hooks/use-update-user-role-membership-mutation'
import {
  type EditDirectRoleMembershipFormValues,
  editDirectRoleMembershipSchema,
} from '@/features/users/schemas/direct-role-assignment.schema'
import type { UserRoleMembership } from '@/features/users/types/users.types'
import { getApiErrorMessage } from '@/lib/api/errors'

type EditDirectRoleMembershipDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  membership: UserRoleMembership | null
  canEdit: boolean
}

function toPickerValue(value?: string | null) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toISOString()
}

export function EditDirectRoleMembershipDialog({
  open,
  onOpenChange,
  userId,
  membership,
  canEdit,
}: EditDirectRoleMembershipDialogProps) {
  const updateMembershipMutation = useUpdateUserRoleMembershipMutation()
  const syncedMembershipKeyRef = useRef<string | null>(null)
  const form = useForm<EditDirectRoleMembershipFormValues>({
    resolver: zodResolver(editDirectRoleMembershipSchema),
    defaultValues: {
      validFrom: '',
      validUntil: '',
    },
  })

  useEffect(() => {
    if (!open || !membership) {
      if (!open) {
        syncedMembershipKeyRef.current = null
      }
      return
    }

    const membershipKey = `${membership.id}:${membership.valid_from ?? ''}:${membership.valid_until ?? ''}`
    if (syncedMembershipKeyRef.current === membershipKey) {
      return
    }

    syncedMembershipKeyRef.current = membershipKey
    form.reset({
      validFrom: toPickerValue(membership.valid_from),
      validUntil: toPickerValue(membership.valid_until),
    })
    updateMembershipMutation.reset()
  }, [form, membership, open, updateMembershipMutation])

  const submitError = updateMembershipMutation.error
    ? getApiErrorMessage(
        updateMembershipMutation.error,
        'The direct role window could not be updated.'
      )
    : null

  function handleDialogOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      syncedMembershipKeyRef.current = null
      form.reset({
        validFrom: '',
        validUntil: '',
      })
      updateMembershipMutation.reset()
    }

    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>
              Edit role window
              {membership ? ` · ${membership.role.display_name}` : ''}
            </DialogTitle>
            <AppInfoPopover
              label="Explain direct role window"
              title="Direct role window"
            >
              Optional validity dates control when this direct role grants
              permissions. Clear both fields for an always-on assignment.
            </AppInfoPopover>
          </div>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(async (values) => {
            if (!canEdit || !membership) {
              return
            }

            try {
              await updateMembershipMutation.mutateAsync({
                userId,
                membershipId: membership.id,
                valid_from: values.validFrom
                  ? new Date(values.validFrom).toISOString()
                  : null,
                valid_until: values.validUntil
                  ? new Date(values.validUntil).toISOString()
                  : null,
              })
              handleDialogOpenChange(false)
            } catch {
              return
            }
          })}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              name="validFrom"
              control={form.control}
              render={({ field }) => (
                <AppFormField
                  label="Valid from"
                  htmlFor="edit-direct-role-valid-from"
                >
                  <AppDateTimePicker
                    id="edit-direct-role-valid-from"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    disabled={!canEdit || updateMembershipMutation.isPending}
                    placeholder="Always on"
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
                  htmlFor="edit-direct-role-valid-until"
                  errors={[fieldState.error]}
                >
                  <AppDateTimePicker
                    id="edit-direct-role-valid-until"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    disabled={!canEdit || updateMembershipMutation.isPending}
                    placeholder="Open ended"
                  />
                </AppFormField>
              )}
            />
          </div>

          {submitError ? <FieldError>{submitError}</FieldError> : null}

          <DialogFooter>
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
                !canEdit ||
                !membership ||
                updateMembershipMutation.isPending
              }
            >
              {updateMembershipMutation.isPending
                ? 'Saving…'
                : 'Save window'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
