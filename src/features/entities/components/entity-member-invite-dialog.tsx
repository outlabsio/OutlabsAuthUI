import { useEffect, useEffectEvent } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { type Resolver, useForm } from 'react-hook-form'

import { AppEmptyState } from '@/components/app/app-empty-state'
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
import { Input } from '@/components/ui/input'
import { useInviteUserMutation } from '@/features/users/hooks/use-invite-user-mutation'
import { entitiesKeys } from '@/features/entities/api/entities.keys'
import {
  entityMemberInviteSchema,
  type EntityMemberInviteFormValues,
} from '@/features/entities/schemas/entity-member-invite.schema'
import type { Entity } from '@/features/entities/types/entities.types'
import { AssignableRolesTable } from '@/features/roles/components/assignable-roles-table'
import type { Role } from '@/features/roles/types/roles.types'
import { getApiErrorMessage } from '@/lib/api/errors'

type EntityMemberInviteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  entity: Entity
  availableRoles: Role[]
  initialRoleIds?: string[]
  canInviteMembers: boolean
}

export function EntityMemberInviteDialog({
  open,
  onOpenChange,
  entity,
  availableRoles,
  initialRoleIds = [],
  canInviteMembers,
}: EntityMemberInviteDialogProps) {
  const queryClient = useQueryClient()
  const inviteMutation = useInviteUserMutation()
  const resolver = zodResolver(entityMemberInviteSchema) as Resolver<EntityMemberInviteFormValues>
  const form = useForm<EntityMemberInviteFormValues>({
    resolver,
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
      roleIds: initialRoleIds,
    },
  })

  const resetDialogState = useEffectEvent(() => {
    form.reset({
      email: '',
      firstName: '',
      lastName: '',
      roleIds: initialRoleIds,
    })
    inviteMutation.reset()
  })

  useEffect(() => {
    if (!open) {
      return
    }

    resetDialogState()
  }, [initialRoleIds, open])

  const selectedRoleIds = form.watch('roleIds')
  const submitErrorMessage = inviteMutation.error
    ? getApiErrorMessage(inviteMutation.error, 'The invitation could not be sent.')
    : null

  function handleRoleToggle(roleId: string, checked: boolean) {
    const nextRoleIds = checked
      ? [...selectedRoleIds, roleId]
      : selectedRoleIds.filter((currentRoleId) => currentRoleId !== roleId)

    form.setValue('roleIds', nextRoleIds, {
      shouldDirty: true,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-hidden p-0 sm:max-w-3xl">
        <div className="flex max-h-[calc(100svh-2rem)] flex-col">
          <DialogHeader className="border-b px-6 py-5">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-xl">
                Invite new member to {entity.display_name}
              </DialogTitle>
              <AppInfoPopover
                label="Explain entity invite flow"
                title="Entity invite"
              >
                A usable email address is required. This flow creates an invited user and attaches
                the first entity membership at the same time. Optional initial roles apply only
                inside this entity context.
              </AppInfoPopover>
            </div>
          </DialogHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={form.handleSubmit(async (values) => {
              try {
                await inviteMutation.mutateAsync({
                  email: values.email,
                  first_name: values.firstName?.trim() || undefined,
                  last_name: values.lastName?.trim() || undefined,
                  entity_id: entity.id,
                  role_ids: values.roleIds.length > 0 ? values.roleIds : undefined,
                })

                await queryClient.invalidateQueries({
                  queryKey: entitiesKeys.members(entity.id),
                })

                onOpenChange(false)
              } catch {
                return
              }
            })}
          >
            <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
              <div className="space-y-6">
                <section className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center gap-2">
                    <div className="font-medium">Invitation scope</div>
                    <AppInfoPopover
                      label="Explain invitation scope"
                      title="Invitation scope"
                    >
                      The invited user will receive their first membership in {entity.display_name}.
                    </AppInfoPopover>
                  </div>
                </section>

                <div className="grid gap-4 sm:grid-cols-2">
                  <AppFormField
                    className="sm:col-span-2"
                    label="Email"
                    htmlFor="entity-member-invite-email"
                    errors={[form.formState.errors.email]}
                  >
                    <Input
                      id="entity-member-invite-email"
                      type="email"
                      disabled={inviteMutation.isPending || !canInviteMembers}
                      placeholder="person@example.com"
                      {...form.register('email')}
                    />
                  </AppFormField>

                  <AppFormField
                    label="First name"
                    htmlFor="entity-member-invite-first-name"
                    errors={[form.formState.errors.firstName]}
                  >
                    <Input
                      id="entity-member-invite-first-name"
                      disabled={inviteMutation.isPending || !canInviteMembers}
                      placeholder="First name"
                      {...form.register('firstName')}
                    />
                  </AppFormField>

                  <AppFormField
                    label="Last name"
                    htmlFor="entity-member-invite-last-name"
                    errors={[form.formState.errors.lastName]}
                  >
                    <Input
                      id="entity-member-invite-last-name"
                      disabled={inviteMutation.isPending || !canInviteMembers}
                      placeholder="Last name"
                      {...form.register('lastName')}
                    />
                  </AppFormField>
                </div>

                <section className="rounded-xl border p-4">
                  <div className="flex items-center gap-2">
                    <div className="font-medium">Initial roles</div>
                    <AppInfoPopover
                      label="Explain initial invite roles"
                      title="Initial roles"
                    >
                      Initial roles are optional. They are applied through the membership created
                      for this entity, not as global account roles.
                    </AppInfoPopover>
                  </div>

                  <div className="mt-4">
                    <AssignableRolesTable
                      roles={availableRoles}
                      selectedRoleIds={selectedRoleIds}
                      onRoleToggle={handleRoleToggle}
                      disabled={inviteMutation.isPending || !canInviteMembers}
                      emptyMessage="No roles are currently available at this entity."
                      searchPlaceholder="Search initial roles"
                    />
                  </div>
                </section>

                {!canInviteMembers ? (
                  <AppEmptyState
                    title="Your account cannot invite users into this entity."
                    compact
                  />
                ) : null}

                {submitErrorMessage ? (
                  <FieldError>{submitErrorMessage}</FieldError>
                ) : null}
              </div>
            </div>

            <DialogFooter className="mx-0 mb-0 mt-auto rounded-none border-t bg-background px-6 py-4 sm:items-center sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                disabled={inviteMutation.isPending}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={inviteMutation.isPending || !canInviteMembers}
              >
                {inviteMutation.isPending ? 'Sending…' : 'Send invite'}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
