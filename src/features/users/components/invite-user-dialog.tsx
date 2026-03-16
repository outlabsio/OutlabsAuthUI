import { useEffect } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useInviteUserMutation } from '@/features/users/hooks/use-invite-user-mutation'
import {
  type InviteUserFormValues,
  inviteUserSchema,
} from '@/features/users/schemas/invite-user.schema'
import { getApiErrorMessage } from '@/lib/api/errors'
import type { Entity } from '@/features/entities/types/entities.types'
import type { Role } from '@/features/roles/types/roles.types'

type InviteUserDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  entities: Entity[]
  roles: Role[]
}

export function InviteUserDialog({
  open,
  onOpenChange,
  entities,
  roles,
}: InviteUserDialogProps) {
  const inviteMutation = useInviteUserMutation()
  const form = useForm<InviteUserFormValues>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
      entityId: '',
      roleIds: [],
    },
  })

  useEffect(() => {
    if (!open) {
      form.reset()
      inviteMutation.reset()
    }
  }, [form, inviteMutation, open])

  const roleIds = form.watch('roleIds')
  const submitError = inviteMutation.error
    ? getApiErrorMessage(inviteMutation.error, 'Unable to send the invitation.')
    : null

  const emailField = form.register('email')
  const firstNameField = form.register('firstName')
  const lastNameField = form.register('lastName')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] max-w-2xl overflow-y-auto p-0">
        <div className="p-6">
          <DialogHeader>
            <DialogTitle>Invite user</DialogTitle>
            <DialogDescription>
              Create an invited account and optionally assign entity context and roles.
            </DialogDescription>
          </DialogHeader>
          <form
            className="mt-6"
            onSubmit={form.handleSubmit(async (values) => {
              try {
                await inviteMutation.mutateAsync({
                  email: values.email,
                  first_name: values.firstName?.trim() || undefined,
                  last_name: values.lastName?.trim() || undefined,
                  entity_id: values.entityId || undefined,
                  role_ids: values.roleIds.length > 0 ? values.roleIds : undefined,
                })
                onOpenChange(false)
              } catch {
                return
              }
            })}
          >
            <FieldGroup>
              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="invite-email">Email</FieldLabel>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="person@example.com"
                    autoComplete="email"
                    aria-invalid={Boolean(form.formState.errors.email)}
                    disabled={inviteMutation.isPending}
                    {...emailField}
                  />
                  <FieldError errors={[form.formState.errors.email]} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="invite-entity">Entity</FieldLabel>
                  <Select
                    items={[
                      { label: 'No entity context', value: 'none' },
                      ...entities.map((entity) => ({
                        label: entity.display_name,
                        value: entity.id,
                      })),
                    ]}
                    value={form.watch('entityId') || 'none'}
                    onValueChange={(value) => {
                      form.setValue('entityId', !value || value === 'none' ? '' : value, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }}
                    disabled={inviteMutation.isPending}
                  >
                    <SelectTrigger id="invite-entity" className="w-full">
                      <SelectValue placeholder="No entity context" />
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false}>
                      <SelectGroup>
                        <SelectItem value="none">No entity context</SelectItem>
                        {entities.map((entity) => (
                          <SelectItem key={entity.id} value={entity.id}>
                            {entity.display_name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Leave empty for a generic invite not scoped to one entity.
                  </FieldDescription>
                </Field>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="invite-first-name">First name</FieldLabel>
                  <Input
                    id="invite-first-name"
                    placeholder="First name"
                    disabled={inviteMutation.isPending}
                    {...firstNameField}
                  />
                  <FieldError errors={[form.formState.errors.firstName]} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="invite-last-name">Last name</FieldLabel>
                  <Input
                    id="invite-last-name"
                    placeholder="Last name"
                    disabled={inviteMutation.isPending}
                    {...lastNameField}
                  />
                  <FieldError errors={[form.formState.errors.lastName]} />
                </Field>
              </div>
              <FieldSet>
                <FieldTitle>Roles</FieldTitle>
                <FieldDescription>
                  Select any roles that should be assigned after the invite is accepted.
                </FieldDescription>
                <div className="grid gap-3 md:grid-cols-2">
                  {roles.map((role) => {
                    const checked = roleIds.includes(role.id)

                    return (
                      <Field key={role.id} orientation="horizontal">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(nextChecked) => {
                            const nextRoleIds = nextChecked
                              ? [...roleIds, role.id]
                              : roleIds.filter((roleId) => roleId !== role.id)

                            form.setValue('roleIds', nextRoleIds, {
                              shouldDirty: true,
                              shouldValidate: true,
                            })
                          }}
                          disabled={inviteMutation.isPending}
                        />
                        <FieldContent>
                          <FieldLabel>{role.display_name}</FieldLabel>
                          <FieldDescription>
                            {role.description || role.name}
                          </FieldDescription>
                        </FieldContent>
                      </Field>
                    )
                  })}
                </div>
              </FieldSet>
              {submitError ? <FieldError>{submitError}</FieldError> : null}
            </FieldGroup>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={inviteMutation.isPending}>
                {inviteMutation.isPending ? 'Sending invite...' : 'Send invite'}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
