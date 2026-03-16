import { useEffect, useMemo } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { buildEntityOptions } from '@/features/entities/utils/build-entity-options'
import type { Entity } from '@/features/entities/types/entities.types'
import type { Role } from '@/features/roles/types/roles.types'
import { useInviteUserMutation } from '@/features/users/hooks/use-invite-user-mutation'
import {
  type InviteUserFormValues,
  inviteUserSchema,
} from '@/features/users/schemas/invite-user.schema'
import { getApiErrorMessage } from '@/lib/api/errors'
import { cn } from '@/lib/utils/cn'

type InviteUserDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  entities: Entity[]
  roles: Role[]
}

function formatToken(value: string) {
  return value
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatAssignableTypes(role: Role) {
  if (role.assignable_at_types.length === 0) {
    return null
  }

  return role.assignable_at_types.map(formatToken).join(', ')
}

function getRoleScopeSummary(role: Role) {
  if (role.is_global) {
    return 'Global role'
  }

  if (role.scope_entity_name) {
    return `Scoped from ${role.scope_entity_name}`
  }

  return `Scope: ${formatToken(role.scope)}`
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
  const entityId = form.watch('entityId')
  const submitError = inviteMutation.error
    ? getApiErrorMessage(inviteMutation.error, 'Unable to send the invitation.')
    : null
  const entityOptions = useMemo(() => buildEntityOptions(entities), [entities])
  const selectedEntity =
    entityOptions.find((option) => option.id === entityId) ?? null
  const sortedRoles = useMemo(
    () =>
      [...roles].sort((left, right) =>
        left.display_name.localeCompare(right.display_name)
      ),
    [roles]
  )

  const emailField = form.register('email')
  const firstNameField = form.register('firstName')
  const lastNameField = form.register('lastName')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-hidden p-0 sm:max-w-4xl">
        <div className="flex max-h-[calc(100svh-2rem)] flex-col">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle className="text-2xl">Invite user</DialogTitle>
            <DialogDescription className="max-w-2xl text-base leading-7">
              Create the account, choose the exact entity scope, and attach
              roles that should activate after acceptance.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
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
            <div className="grid min-h-0 flex-1 gap-6 overflow-auto px-6 py-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.95fr)]">
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email</Label>
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
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="invite-first-name">First name</Label>
                    <Input
                      id="invite-first-name"
                      placeholder="First name"
                      autoComplete="given-name"
                      disabled={inviteMutation.isPending}
                      {...firstNameField}
                    />
                    <FieldError errors={[form.formState.errors.firstName]} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invite-last-name">Last name</Label>
                    <Input
                      id="invite-last-name"
                      placeholder="Last name"
                      autoComplete="family-name"
                      disabled={inviteMutation.isPending}
                      {...lastNameField}
                    />
                    <FieldError errors={[form.formState.errors.lastName]} />
                  </div>
                </div>

                <section className="rounded-xl border p-4">
                  <div className="space-y-1">
                    <h3 className="font-medium">Entity scope</h3>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Search the hierarchy and choose the exact entity this
                      invite belongs to. Higher-level entities usually imply a
                      broader starting scope once roles are applied.
                    </p>
                  </div>

                  <div className="mt-4 space-y-3">
                    <Controller
                      name="entityId"
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <div className="space-y-2">
                          <Combobox
                            items={entityOptions}
                            itemToStringValue={(item) =>
                              item
                                ? `${item.title} ${item.pathLabel} ${item.entityTypeLabel} ${item.entityClassLabel}`
                                : ''
                            }
                            value={selectedEntity}
                            onValueChange={(value) => {
                              field.onChange(value?.id ?? '')
                            }}
                            disabled={inviteMutation.isPending}
                          >
                            <ComboboxInput
                              id="invite-entity"
                              placeholder="Search organization, region, office, or team"
                              className="w-full"
                              showClear
                            />
                            <ComboboxContent align="start">
                              <ComboboxEmpty>No entities found.</ComboboxEmpty>
                              <ComboboxList>
                                {(option) => (
                                  <ComboboxItem
                                    key={option.id}
                                    value={option}
                                    className="items-start py-2.5"
                                  >
                                    <div className="flex min-w-0 flex-col gap-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-medium">
                                          {option.title}
                                        </span>
                                        <Badge variant="outline">
                                          {option.entityTypeLabel}
                                        </Badge>
                                      </div>
                                      <span className="truncate text-xs text-muted-foreground">
                                        {option.pathLabel}
                                      </span>
                                    </div>
                                  </ComboboxItem>
                                )}
                              </ComboboxList>
                            </ComboboxContent>
                          </Combobox>
                          <FieldError errors={[fieldState.error]} />
                        </div>
                      )}
                    />

                    {selectedEntity ? (
                      <div className="rounded-xl bg-muted/40 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{selectedEntity.title}</p>
                          <Badge variant="outline">
                            {selectedEntity.entityTypeLabel}
                          </Badge>
                          <Badge variant="outline">
                            {selectedEntity.entityClassLabel}
                          </Badge>
                          {selectedEntity.isTopLevel ? (
                            <Badge variant="secondary">Top level</Badge>
                          ) : null}
                        </div>
                        <p className="mt-3 text-sm leading-6 text-muted-foreground">
                          Full path: {selectedEntity.pathLabel}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {selectedEntity.isTopLevel
                            ? 'This selection sits at the top of the hierarchy and usually grants the broadest starting scope.'
                            : `Parent path: ${selectedEntity.parentPathLabel}`}
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed p-4">
                        <p className="font-medium">No entity selected</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          Leave this empty only when the account should be
                          created first and assigned to an entity later.
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              </div>

              <section className="flex min-h-0 flex-col rounded-xl border">
                <div className="border-b px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-medium">Roles</h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Select the roles that should activate after the invite
                        is accepted.
                      </p>
                    </div>
                    <Badge variant="outline">
                      {roleIds.length} selected
                    </Badge>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto">
                  {sortedRoles.length > 0 ? (
                    <div className="divide-y">
                      {sortedRoles.map((role) => {
                        const checked = roleIds.includes(role.id)
                        const roleInputId = `invite-role-${role.id}`
                        const assignableTypes = formatAssignableTypes(role)

                        return (
                          <div
                            key={role.id}
                            className={cn(
                              'px-4 py-4 transition-colors',
                              checked ? 'bg-muted/30' : 'bg-background'
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <Checkbox
                                id={roleInputId}
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
                                className="mt-1"
                              />

                              <div className="min-w-0 flex-1 space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Label
                                    htmlFor={roleInputId}
                                    className="cursor-pointer text-sm font-medium"
                                  >
                                    {role.display_name}
                                  </Label>
                                  {role.is_global ? (
                                    <Badge variant="outline">Global</Badge>
                                  ) : null}
                                  <Badge variant="outline">
                                    {role.permissions.length} permissions
                                  </Badge>
                                </div>

                                <p className="text-sm leading-6 text-muted-foreground">
                                  {role.description || role.name}
                                </p>

                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <span>{getRoleScopeSummary(role)}</span>
                                  {assignableTypes ? (
                                    <span>Assignable at: {assignableTypes}</span>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="px-4 py-6 text-sm text-muted-foreground">
                      No assignable roles are available for this backend.
                    </div>
                  )}
                </div>

                {submitError ? (
                  <div className="border-t px-4 py-3">
                    <FieldError>{submitError}</FieldError>
                  </div>
                ) : null}
              </section>
            </div>

            <DialogFooter className="mt-0 shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
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
