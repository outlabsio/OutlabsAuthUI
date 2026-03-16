import { useEffect } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

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
import { Label } from '@/components/ui/label'
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

  useEffect(() => {
    if (!open) {
      form.reset()
      resetUserPasswordMutation.reset()
    }
  }, [form, open, resetUserPasswordMutation])

  const submitError = resetUserPasswordMutation.error
    ? getApiErrorMessage(
        resetUserPasswordMutation.error,
        'The password could not be reset.'
      )
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              onOpenChange(false)
            } catch {
              return
            }
          })}
        >
          <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Set a new password for <span className="font-medium text-foreground">{userEmail}</span>.
            The current password will stop working immediately.
          </div>

          <div className="space-y-2">
            <Label htmlFor="reset-user-password-new">New password</Label>
            <Input
              id="reset-user-password-new"
              type="password"
              autoComplete="new-password"
              disabled={resetUserPasswordMutation.isPending}
              {...form.register('newPassword')}
            />
            <FieldError errors={[form.formState.errors.newPassword]} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reset-user-password-confirm">Confirm password</Label>
            <Input
              id="reset-user-password-confirm"
              type="password"
              autoComplete="new-password"
              disabled={resetUserPasswordMutation.isPending}
              {...form.register('confirmPassword')}
            />
            <FieldError errors={[form.formState.errors.confirmPassword]} />
          </div>

          {submitError ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {submitError}
            </div>
          ) : null}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={resetUserPasswordMutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="reset-user-password-form"
            disabled={resetUserPasswordMutation.isPending}
          >
            {resetUserPasswordMutation.isPending ? 'Resetting…' : 'Reset password'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
