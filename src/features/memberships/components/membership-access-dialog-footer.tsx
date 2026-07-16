import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'

type MembershipAccessDialogFooterProps = {
  canRemove: boolean
  confirmRemoval: boolean
  isPending: boolean
  isRemoving: boolean
  idleHint?: string | null
  submitLabel: string
  pendingSubmitLabel: string
  submitDisabled: boolean
  onCancel: () => void
  onConfirmRemovalChange: (confirming: boolean) => void
  onRemove: () => void
}

export function MembershipAccessDialogFooter({
  canRemove,
  confirmRemoval,
  isPending,
  isRemoving,
  idleHint,
  submitLabel,
  pendingSubmitLabel,
  submitDisabled,
  onCancel,
  onConfirmRemovalChange,
  onRemove,
}: MembershipAccessDialogFooterProps) {
  return (
    <DialogFooter className="mx-0 mb-0 flex-col gap-4 rounded-none border-t bg-background px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {canRemove ? (
          confirmRemoval ? (
            <>
              <span className="text-sm text-muted-foreground">
                Remove this membership?
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  onConfirmRemovalChange(false)
                }}
                disabled={isPending}
              >
                Keep access
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={onRemove}
                disabled={isPending}
              >
                {isRemoving ? 'Removing…' : 'Confirm remove'}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
              onClick={() => {
                onConfirmRemovalChange(true)
              }}
              disabled={isPending}
            >
              Remove membership
            </Button>
          )
        ) : idleHint ? (
          <span className="text-sm text-muted-foreground">{idleHint}</span>
        ) : null}
      </div>

      <div className="flex w-full shrink-0 items-center justify-end gap-3 sm:w-auto">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitDisabled}>
          {isPending ? pendingSubmitLabel : submitLabel}
        </Button>
      </div>
    </DialogFooter>
  )
}
