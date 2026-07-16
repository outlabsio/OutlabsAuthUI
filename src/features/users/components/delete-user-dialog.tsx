import { useEffect, useRef } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { AppFormField } from '@/components/app/app-form-field';
import { AppStatusCallout } from '@/components/app/app-status-callout';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useDeleteUserMutation } from '@/features/users/hooks/use-delete-user-mutation';
import {
  createDeleteUserSchema,
  type DeleteUserFormValues,
} from '@/features/users/schemas/delete-user.schema';
import { getApiErrorMessage } from '@/lib/api/errors';

type DeleteUserDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userEmail: string;
  onDeleted: () => void;
};

export function DeleteUserDialog({
  open,
  onOpenChange,
  userId,
  userEmail,
  onDeleted,
}: DeleteUserDialogProps) {
  const deleteUserMutation = useDeleteUserMutation();
  const previousOpenRef = useRef(open);
  const form = useForm<DeleteUserFormValues>({
    resolver: zodResolver(createDeleteUserSchema(userEmail)),
    defaultValues: {
      email: '',
    },
  });

  useEffect(() => {
    const wasOpen = previousOpenRef.current;

    if (wasOpen && !open) {
      form.reset();
      deleteUserMutation.reset();
    }

    previousOpenRef.current = open;
  }, [deleteUserMutation, form, open]);

  const submitError = deleteUserMutation.error
    ? getApiErrorMessage(
        deleteUserMutation.error,
        'The user could not be deleted.',
      )
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Delete user</DialogTitle>
        </DialogHeader>

        <form
          id="delete-user-form"
          className="space-y-4"
          onSubmit={form.handleSubmit(async () => {
            try {
              await deleteUserMutation.mutateAsync({
                userId,
              });
              onOpenChange(false)
              onDeleted();
            } catch {
              return;
            }
          })}
        >
          <AppStatusCallout color="warning" appearance="soft" compact>
            This soft-deletes the account, blocks future sign-in, and preserves
            the audit trail.
          </AppStatusCallout>

          <AppFormField
            label={`Type ${userEmail} to confirm`}
            htmlFor="delete-user-confirm-email"
            errors={[form.formState.errors.email]}
          >
            <Input
              id="delete-user-confirm-email"
              type="email"
              autoComplete="off"
              disabled={deleteUserMutation.isPending}
              {...form.register('email')}
            />
          </AppFormField>

          {submitError ? (
            <FieldError>{submitError}</FieldError>
          ) : null}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={deleteUserMutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="delete-user-form"
            variant="destructive"
            disabled={deleteUserMutation.isPending}
          >
            {deleteUserMutation.isPending ? 'Deleting…' : 'Delete user'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
