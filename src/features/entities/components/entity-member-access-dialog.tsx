import { useEffect, useMemo, useState } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Controller, type Resolver, useForm } from 'react-hook-form'
import { CalendarClock, ChevronRight, Search, UserRoundPlus } from 'lucide-react'

import { AppDateTimePicker } from '@/components/app/app-date-time-picker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { getUsersQueryOptions } from '@/features/users/api/users.query-options'
import type { User } from '@/features/users/types/users.types'
import { useCreateMembershipMutation } from '@/features/memberships/hooks/use-create-membership-mutation'
import { useRemoveMembershipMutation } from '@/features/memberships/hooks/use-remove-membership-mutation'
import { useUpdateMembershipMutation } from '@/features/memberships/hooks/use-update-membership-mutation'
import {
  entityMemberAccessSchema,
  type EntityMemberAccessFormValues,
} from '@/features/entities/schemas/entity-member-access.schema'
import type { Entity, EntityMember } from '@/features/entities/types/entities.types'
import type { Role } from '@/features/roles/types/roles.types'
import {
  formatMembershipToken,
  getMembershipStatusVariant,
} from '@/features/memberships/utils/membership-display'
import {
  formatRoleToken,
  getRoleScopeSummary,
} from '@/features/roles/utils/role-display'
import { getApiErrorMessage } from '@/lib/api/errors'
import { cn } from '@/lib/utils/cn'

type EntityMemberAccessDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  entity: Entity
  availableRoles: Role[]
  existingMember?: EntityMember | null
  existingUserIds: string[]
  rootEntityId?: string | null
  canCreateMemberships: boolean
  canUpdateMemberships: boolean
  canRemoveMemberships: boolean
}

const membershipStatusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'suspended' },
] as const

function getMemberDisplayName(member?: EntityMember | null) {
  if (!member) {
    return ''
  }

  const displayName = [member.user_first_name, member.user_last_name]
    .filter(Boolean)
    .join(' ')
    .trim()

  return displayName || member.user_email
}

function getUserDisplayName(user: User) {
  const displayName = [user.first_name, user.last_name]
    .filter(Boolean)
    .join(' ')
    .trim()

  return displayName || user.email
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16)
}

function toIsoValue(value?: string) {
  return value ? new Date(value).toISOString() : null
}

export function EntityMemberAccessDialog({
  open,
  onOpenChange,
  entity,
  availableRoles,
  existingMember,
  existingUserIds,
  rootEntityId,
  canCreateMemberships,
  canUpdateMemberships,
  canRemoveMemberships,
}: EntityMemberAccessDialogProps) {
  const [userSearch, setUserSearch] = useState('')
  const [confirmRemoval, setConfirmRemoval] = useState(false)
  const createMembershipMutation = useCreateMembershipMutation()
  const updateMembershipMutation = useUpdateMembershipMutation()
  const removeMembershipMutation = useRemoveMembershipMutation()
  const canManageMembershipAccess = existingMember
    ? canUpdateMemberships
    : canCreateMemberships
  const resolver = zodResolver(entityMemberAccessSchema) as Resolver<EntityMemberAccessFormValues>
  const form = useForm<EntityMemberAccessFormValues>({
    resolver,
    defaultValues: {
      userId: existingMember?.user_id ?? '',
      roleIds: existingMember?.roles.map((role) => role.id) ?? [],
      status: existingMember?.status === 'suspended' ? 'suspended' : 'active',
      validFrom: toDateTimeLocalValue(existingMember?.valid_from),
      validUntil: toDateTimeLocalValue(existingMember?.valid_until),
      reason: '',
    },
  })

  useEffect(() => {
    if (!open) {
      return
    }

    form.reset({
      userId: existingMember?.user_id ?? '',
      roleIds: existingMember?.roles.map((role) => role.id) ?? [],
      status: existingMember?.status === 'suspended' ? 'suspended' : 'active',
      validFrom: toDateTimeLocalValue(existingMember?.valid_from),
      validUntil: toDateTimeLocalValue(existingMember?.valid_until),
      reason: '',
    })
    setUserSearch('')
    setConfirmRemoval(false)
    createMembershipMutation.reset()
    updateMembershipMutation.reset()
    removeMembershipMutation.reset()
  }, [
    createMembershipMutation,
    existingMember,
    form,
    open,
    removeMembershipMutation,
    updateMembershipMutation,
  ])

  const usersQuery = useQuery({
    ...getUsersQueryOptions({
      page: 1,
      limit: 20,
      search: userSearch || undefined,
      rootEntityId: rootEntityId ?? undefined,
    }),
    enabled: open && !existingMember && canCreateMemberships,
  })

  const availableUsers = useMemo(() => {
    const blockedUserIds = new Set(existingUserIds)

    if (existingMember?.user_id) {
      blockedUserIds.delete(existingMember.user_id)
    }

    return (usersQuery.data?.items ?? []).filter(
      (user) => !blockedUserIds.has(user.id)
    )
  }, [existingMember?.user_id, existingUserIds, usersQuery.data?.items])

  const selectedUserId = form.watch('userId')
  const selectedUser = useMemo(() => {
    if (existingMember) {
      return null
    }

    return (
      availableUsers.find((user) => user.id === selectedUserId) ??
      usersQuery.data?.items.find((user) => user.id === selectedUserId) ??
      null
    )
  }, [availableUsers, existingMember, selectedUserId, usersQuery.data?.items])

  const selectedRoleIds = form.watch('roleIds')
  const isPending =
    createMembershipMutation.isPending ||
    updateMembershipMutation.isPending ||
    removeMembershipMutation.isPending
  const submitError =
    createMembershipMutation.error ??
    updateMembershipMutation.error ??
    removeMembershipMutation.error
  const submitErrorMessage = submitError
    ? getApiErrorMessage(
        submitError,
        existingMember
          ? 'The entity access could not be updated.'
          : 'The member could not be added to this entity.'
      )
    : null

  async function handleSubmit(values: EntityMemberAccessFormValues) {
    try {
      if (existingMember) {
        await updateMembershipMutation.mutateAsync({
          userId: existingMember.user_id,
          entityId: entity.id,
          roleIds: values.roleIds,
          status: values.status,
          validFrom: toIsoValue(values.validFrom),
          validUntil: toIsoValue(values.validUntil),
          reason: values.reason?.trim() || null,
        })
      } else {
        await createMembershipMutation.mutateAsync({
          userId: values.userId,
          entityId: entity.id,
          roleIds: values.roleIds,
          status: values.status,
          validFrom: toIsoValue(values.validFrom),
          validUntil: toIsoValue(values.validUntil),
          reason: values.reason?.trim() || null,
        })
      }

      onOpenChange(false)
    } catch {
      return
    }
  }

  async function handleRemoveMembership() {
    if (!existingMember) {
      return
    }

    try {
      await removeMembershipMutation.mutateAsync({
        userId: existingMember.user_id,
        entityId: entity.id,
      })
      onOpenChange(false)
    } catch {
      return
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-hidden p-0 sm:max-w-4xl">
        <div className="flex max-h-[calc(100svh-2rem)] flex-col">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle className="text-2xl">
              {existingMember ? 'Manage member access' : `Add member to ${entity.display_name}`}
            </DialogTitle>
          </DialogHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={form.handleSubmit(handleSubmit)}
          >
            <div className="grid min-h-0 flex-1 gap-6 overflow-hidden px-6 py-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="flex min-h-0 flex-col gap-4">
                <section className="rounded-xl border bg-muted/20 p-4">
                  <div className="space-y-1">
                    <div className="font-medium">Entity context</div>
                    <p className="text-sm text-muted-foreground">
                      Access changes will apply only within {entity.display_name}.
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="outline">{formatRoleToken(entity.entity_type)}</Badge>
                    <Badge variant="outline">{formatRoleToken(entity.entity_class)}</Badge>
                    <Badge variant="outline">{formatRoleToken(entity.status)}</Badge>
                  </div>
                </section>

                {existingMember ? (
                  <section className="rounded-xl border p-4">
                    <div className="space-y-1">
                      <div className="font-medium">{getMemberDisplayName(existingMember)}</div>
                      <p className="text-sm text-muted-foreground">
                        {existingMember.user_email}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="outline">
                        User status: {formatMembershipToken(existingMember.user_status)}
                      </Badge>
                      <Badge variant={getMembershipStatusVariant(existingMember.effective_status)}>
                        Membership: {formatMembershipToken(existingMember.effective_status)}
                      </Badge>
                    </div>
                  </section>
                ) : (
                  <section className="flex min-h-0 flex-1 flex-col rounded-xl border p-4">
                    <div className="space-y-1">
                      <div className="font-medium">Choose a user</div>
                      <p className="text-sm text-muted-foreground">
                        Search the current user directory and attach this entity membership.
                      </p>
                    </div>

                    <div className="mt-4 space-y-2">
                      <Label htmlFor="entity-member-search">User search</Label>
                      <div className="relative">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="entity-member-search"
                          value={userSearch}
                          onChange={(event) => setUserSearch(event.target.value)}
                          disabled={isPending || !canManageMembershipAccess}
                          className="pl-9"
                          placeholder="Search by name or email"
                        />
                      </div>
                    </div>

                    <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-xl border bg-background">
                      {!canManageMembershipAccess ? (
                        <div className="px-4 py-6 text-sm text-muted-foreground">
                          Your account cannot create or edit entity memberships.
                        </div>
                      ) : usersQuery.isPending ? (
                        <div className="px-4 py-6 text-sm text-muted-foreground">
                          Loading users…
                        </div>
                      ) : usersQuery.error ? (
                        <div className="px-4 py-6 text-sm text-destructive">
                          {getApiErrorMessage(
                            usersQuery.error,
                            'The user directory could not be loaded.'
                          )}
                        </div>
                      ) : availableUsers.length > 0 ? (
                        <div className="divide-y">
                          {availableUsers.map((user) => {
                            const isSelected = selectedUserId === user.id

                            return (
                              <button
                                key={user.id}
                                type="button"
                                className={cn(
                                  'flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors',
                                  isSelected ? 'bg-muted/40' : 'hover:bg-muted/20'
                                )}
                                onClick={() => form.setValue('userId', user.id)}
                              >
                                <div className="min-w-0 space-y-1">
                                  <div className="font-medium">{getUserDisplayName(user)}</div>
                                  <div className="truncate text-sm text-muted-foreground">
                                    {user.email}
                                  </div>
                                </div>
                                {isSelected ? (
                                  <Badge variant="secondary">Selected</Badge>
                                ) : (
                                  <ChevronRight className="mt-1 size-4 text-muted-foreground" />
                                )}
                              </button>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="px-4 py-6 text-sm text-muted-foreground">
                          No eligible users matched this search.
                        </div>
                      )}
                    </div>
                    <FieldError errors={[form.formState.errors.userId]} className="mt-3" />

                    {selectedUser ? (
                      <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
                        <div className="flex items-start gap-3">
                          <UserRoundPlus className="mt-0.5 size-4 text-primary" />
                          <div className="space-y-1">
                            <div className="font-medium">{getUserDisplayName(selectedUser)}</div>
                            <div className="text-sm text-muted-foreground">
                              {selectedUser.email}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </section>
                )}
              </div>

              <div className="flex min-h-0 flex-col gap-4">
                <section className="flex min-h-0 flex-1 flex-col rounded-xl border p-4">
                  <div className="space-y-1">
                    <div className="font-medium">Role assignment</div>
                    <p className="text-sm text-muted-foreground">
                      Roles available within this entity scope.
                    </p>
                  </div>

                  <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-xl border bg-background">
                    {availableRoles.length > 0 ? (
                      <div className="divide-y">
                        {availableRoles.map((role) => {
                          const isChecked = selectedRoleIds.includes(role.id)
                          const roleScopeSummary = getRoleScopeSummary(role)

                          return (
                            <label
                              key={role.id}
                              className={cn(
                                'flex cursor-pointer gap-3 px-4 py-3 transition-colors',
                                isChecked ? 'bg-muted/30' : 'hover:bg-muted/20'
                              )}
                            >
                              <Checkbox
                                checked={isChecked}
                                disabled={isPending || !canManageMembershipAccess}
                                onCheckedChange={(checked) => {
                                  const nextRoleIds = checked
                                    ? [...selectedRoleIds, role.id]
                                    : selectedRoleIds.filter(
                                        (roleId) => roleId !== role.id
                                      )

                                  form.setValue('roleIds', nextRoleIds, {
                                    shouldDirty: true,
                                  })
                                }}
                                className="mt-1"
                              />
                              <div className="min-w-0 space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium">{role.display_name}</span>
                                  {role.is_auto_assigned ? (
                                    <Badge variant="outline">Auto-assigned</Badge>
                                  ) : null}
                                  <Badge variant="outline">
                                    {role.permissions.length} permissions
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {role.description || role.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {roleScopeSummary}
                                </p>
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="px-4 py-6 text-sm text-muted-foreground">
                        No assignable roles are available for this entity yet.
                      </div>
                    )}
                  </div>
                </section>

                <section className="rounded-xl border p-4">
                  <div className="flex items-start gap-3">
                    <CalendarClock className="mt-0.5 size-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1 space-y-4">
                      <div className="space-y-1">
                        <div className="font-medium">Membership lifecycle</div>
                        <p className="text-sm text-muted-foreground">
                          Suspend access, schedule it, or keep it active immediately.
                        </p>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Status</Label>
                          <Controller
                            control={form.control}
                            name="status"
                            render={({ field }) => (
                              <Select
                                value={field.value}
                                onValueChange={field.onChange}
                                disabled={isPending || !canManageMembershipAccess}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Choose a status" />
                                </SelectTrigger>
                                <SelectContent>
                                  {membershipStatusOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="entity-member-reason">Reason</Label>
                          <Textarea
                            id="entity-member-reason"
                            rows={2}
                            disabled={isPending || !canManageMembershipAccess}
                            placeholder="Optional context for this lifecycle change"
                            {...form.register('reason')}
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="entity-member-valid-from">Valid from</Label>
                          <Controller
                            control={form.control}
                            name="validFrom"
                            render={({ field }) => (
                              <AppDateTimePicker
                                id="entity-member-valid-from"
                                value={field.value ?? ''}
                                onChange={field.onChange}
                                disabled={isPending || !canManageMembershipAccess}
                                placeholder="Pick a start date"
                              />
                            )}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="entity-member-valid-until">Valid until</Label>
                          <Controller
                            control={form.control}
                            name="validUntil"
                            render={({ field }) => (
                              <AppDateTimePicker
                                id="entity-member-valid-until"
                                value={field.value ?? ''}
                                onChange={field.onChange}
                                disabled={isPending || !canManageMembershipAccess}
                                placeholder="Pick an end date"
                              />
                            )}
                          />
                        </div>
                      </div>
                      <FieldError errors={[form.formState.errors.validUntil]} />
                    </div>
                  </div>
                </section>

                {submitErrorMessage ? (
                  <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                    {submitErrorMessage}
                  </div>
                ) : null}
              </div>
            </div>

            <DialogFooter className="flex items-center justify-between gap-3 border-t px-6 py-4">
              <div className="flex items-center gap-2">
                {existingMember && canRemoveMemberships ? (
                  confirmRemoval ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={isPending}
                        onClick={() => setConfirmRemoval(false)}
                      >
                        Keep membership
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={isPending}
                        onClick={() => {
                          void handleRemoveMembership()
                        }}
                      >
                        {isPending ? 'Removing…' : 'Confirm removal'}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={isPending}
                      onClick={() => setConfirmRemoval(true)}
                    >
                      Remove membership
                    </Button>
                  )
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isPending || !canManageMembershipAccess}
                >
                  {isPending
                    ? existingMember
                      ? 'Saving…'
                      : 'Adding…'
                    : existingMember
                      ? 'Save access'
                      : 'Add member'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
