import { useEffect, useState } from 'react'

import { AppDateTimePicker } from '@/components/app/app-date-time-picker'
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
import { Label } from '@/components/ui/label'
import { useUpdateUserRoleMembershipMutation } from '@/features/users/hooks/use-update-user-role-membership-mutation'
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
  const [validFrom, setValidFrom] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const updateMembershipMutation = useUpdateUserRoleMembershipMutation()

  useEffect(() => {
    if (!open || !membership) {
      return
    }

    setValidFrom(toPickerValue(membership.valid_from))
    setValidUntil(toPickerValue(membership.valid_until))
  }, [membership, open])

  const submitError = updateMembershipMutation.error
    ? getApiErrorMessage(
        updateMembershipMutation.error,
        'The direct role window could not be updated.',
      )
    : null
  const validityError =
    validFrom &&
    validUntil &&
    new Date(validUntil).getTime() < new Date(validFrom).getTime()
      ? 'Valid until must be after valid from.'
      : null

  function handleDialogOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setValidFrom('')
      setValidUntil('')
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
          onSubmit={async (event) => {
            event.preventDefault()

            if (!canEdit || !membership || validityError) {
              return
            }

            try {
              await updateMembershipMutation.mutateAsync({
                userId,
                membershipId: membership.id,
                valid_from: validFrom ? new Date(validFrom).toISOString() : null,
                valid_until: validUntil
                  ? new Date(validUntil).toISOString()
                  : null,
              })
              handleDialogOpenChange(false)
            } catch {
              return
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-direct-role-valid-from">Valid from</Label>
              <AppDateTimePicker
                id="edit-direct-role-valid-from"
                value={validFrom}
                onChange={setValidFrom}
                disabled={!canEdit || updateMembershipMutation.isPending}
                placeholder="Always on"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-direct-role-valid-until">Valid until</Label>
              <AppDateTimePicker
                id="edit-direct-role-valid-until"
                value={validUntil}
                onChange={setValidUntil}
                disabled={!canEdit || updateMembershipMutation.isPending}
                placeholder="Open ended"
              />
            </div>
          </div>

          {validityError ? <FieldError>{validityError}</FieldError> : null}
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
                updateMembershipMutation.isPending ||
                Boolean(validityError)
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
