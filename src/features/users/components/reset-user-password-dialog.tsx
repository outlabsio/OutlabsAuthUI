import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import { AppFormField } from '@/components/app/app-form-field'
import { AppStatusCallout } from '@/components/app/app-status-callout'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useResetUserPasswordMutation } from '@/features/users/hooks/use-reset-user-password-mutation'
import {
  type ResetUserPasswordFormValues,
  resetUserPasswordSchema,
} from '@/features/users/schemas/reset-user-password.schema'
import { getApiErrorMessage } from '@/lib/api/errors'

type ResetUserPasswordDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  userEmail: string
}

export function ResetUserPasswordDialog({
  open,
  onOpenChange,
  userId,
  userEmail,
}: ResetUserPasswordDialogProps) {
  const resetUserPasswordMutation = useResetUserPasswordMutation()
  const form = useForm<ResetUserPasswordFormValues>({
    resolver: zodResolver(resetUserPasswordSchema),
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
  })

  // Handler-first reset: clear the form and mutation state as the dialog closes
  // instead of syncing off an `open` effect.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      form.reset()
      resetUserPasswordMutation.reset()
    }

    onOpenChange(nextOpen)
  }

  const submitError = resetUserPasswordMutation.error
    ? getApiErrorMessage(
        resetUserPasswordMutation.error,
        'The password could not be reset.'
      )
    : null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
        </DialogHeader>

        <form
          id="reset-user-password-form"
          className="space-y-4"
          onSubmit={form.handleSubmit(async (values) => {
            try {
              await resetUserPasswordMutation.mutateAsync({
                userId,
                new_password: values.newPassword,
              })
              handleOpenChange(false)
            } catch {
              return
            }
          })}
        >
          <AppStatusCallout color="neutral" appearance="soft" compact>
            Set a new password for{' '}
            <span className="font-medium text-foreground">{userEmail}</span>.
            The current password will stop working immediately.
          </AppStatusCallout>

          <AppFormField
            label="New password"
            htmlFor="reset-user-password-new"
            errors={[form.formState.errors.newPassword]}
          >
            <Input
              id="reset-user-password-new"
              type="password"
              autoComplete="new-password"
              disabled={resetUserPasswordMutation.isPending}
              {...form.register('newPassword')}
            />
          </AppFormField>

          <AppFormField
            label="Confirm password"
            htmlFor="reset-user-password-confirm"
            errors={[form.formState.errors.confirmPassword]}
          >
            <Input
              id="reset-user-password-confirm"
              type="password"
              autoComplete="new-password"
              disabled={resetUserPasswordMutation.isPending}
              {...form.register('confirmPassword')}
            />
          </AppFormField>

          {submitError ? <FieldError>{submitError}</FieldError> : null}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={resetUserPasswordMutation.isPending}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="reset-user-password-form"
            disabled={resetUserPasswordMutation.isPending}
          >
            {resetUserPasswordMutation.isPending
              ? 'Resetting…'
              : 'Reset password'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
