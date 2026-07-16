import { useEffect, useEffectEvent, useMemo, useState } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { type Resolver, useForm } from 'react-hook-form'
import { ChevronRight, Search, UserRoundPlus } from 'lucide-react'

import { AppInfoPopover } from '@/components/app/app-info-popover'
import { AppStatusBadge } from '@/components/app/app-status-badge'
import { AppErrorState } from '@/components/app/app-error-state'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { MembershipAccessDialogFooter } from '@/features/memberships/components/membership-access-dialog-footer'
import { MembershipLifecyclePanel } from '@/features/memberships/components/membership-lifecycle-panel'
import { useMembershipAccessActions } from '@/features/memberships/hooks/use-membership-access-actions'
import { getUsersQueryOptions } from '@/features/users/api/users.query-options'
import type { User } from '@/features/users/types/users.types'
import {
  entityMemberAccessSchema,
  type EntityMemberAccessFormValues,
} from '@/features/entities/schemas/entity-member-access.schema'
import type { Entity, EntityMember } from '@/features/entities/types/entities.types'
import { getEntityStatusTone } from '@/features/entities/utils/entity-display'
import type { Role } from '@/features/roles/types/roles.types'
import { AssignableRolesTable } from '@/features/roles/components/assignable-roles-table'
import { filterAssignableRoles } from '@/features/roles/utils/filter-assignable-roles'
import {
  formatMembershipToken,
  getMembershipStatusTone,
} from '@/features/memberships/utils/membership-display'
import { toDateTimeLocalValue } from '@/features/memberships/utils/membership-datetime'
import { formatRoleToken } from '@/features/roles/utils/role-display'
import { getApiErrorMessage } from '@/lib/api/errors'
import { cn } from '@/lib/utils/cn'

type EntityMemberAccessDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  entity: Entity
  availableRoles: Role[]
  existingMember?: EntityMember | null
  initialRoleIds?: string[]
  existingUserIds: string[]
  rootEntityId?: string | null
  canCreateMemberships: boolean
  canUpdateMemberships: boolean
  canRemoveMemberships: boolean
}

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

export function EntityMemberAccessDialog({
  open,
  onOpenChange,
  entity,
  availableRoles,
  existingMember,
  initialRoleIds = [],
  existingUserIds,
  rootEntityId,
  canCreateMemberships,
  canUpdateMemberships,
  canRemoveMemberships,
}: EntityMemberAccessDialogProps) {
  const [userSearch, setUserSearch] = useState('')
  const [roleSearchValue, setRoleSearchValue] = useState('')
  const [showSelectedRolesOnly, setShowSelectedRolesOnly] = useState(false)
  const [confirmRemoval, setConfirmRemoval] = useState(false)
  const membershipActions = useMembershipAccessActions()
  const canManageMembershipAccess = existingMember
    ? canUpdateMemberships
    : canCreateMemberships
  const resolver = zodResolver(entityMemberAccessSchema) as Resolver<EntityMemberAccessFormValues>
  const form = useForm<EntityMemberAccessFormValues>({
    resolver,
    defaultValues: {
      userId: existingMember?.user_id ?? '',
      roleIds: existingMember?.roles.map((role) => role.id) ?? initialRoleIds,
      status: existingMember?.status === 'suspended' ? 'suspended' : 'active',
      validFrom: toDateTimeLocalValue(existingMember?.valid_from),
      validUntil: toDateTimeLocalValue(existingMember?.valid_until),
      reason: '',
    },
  })
  const resetDialogState = useEffectEvent(() => {
    form.reset({
      userId: existingMember?.user_id ?? '',
      roleIds: existingMember?.roles.map((role) => role.id) ?? initialRoleIds,
      status: existingMember?.status === 'suspended' ? 'suspended' : 'active',
      validFrom: toDateTimeLocalValue(existingMember?.valid_from),
      validUntil: toDateTimeLocalValue(existingMember?.valid_until),
      reason: '',
    })
    setUserSearch('')
    setRoleSearchValue('')
    setShowSelectedRolesOnly(false)
    setConfirmRemoval(false)
    membershipActions.reset()
  })

  useEffect(() => {
    if (!open) {
      return
    }

    resetDialogState()
  }, [
    existingMember,
    initialRoleIds,
    open,
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
  const selectedStatus = form.watch('status')
  const selectedValidFrom = form.watch('validFrom') ?? ''
  const selectedValidUntil = form.watch('validUntil') ?? ''
  const selectedReason = form.watch('reason') ?? ''
  const visibleAssignableRoles = useMemo(
    () =>
      filterAssignableRoles({
        roles: availableRoles,
        searchValue: roleSearchValue,
        selectedRoleIdSet: new Set(selectedRoleIds),
        showSelectedOnly: showSelectedRolesOnly,
      }),
    [availableRoles, roleSearchValue, selectedRoleIds, showSelectedRolesOnly]
  )
  const isPending = membershipActions.isPending
  const submitErrorMessage = membershipActions.getSubmitErrorMessage(
    Boolean(existingMember),
    'The member could not be added to this entity.'
  )

  function handleRoleToggle(roleId: string, checked: boolean) {
    const nextRoleIds = checked
      ? [...selectedRoleIds, roleId]
      : selectedRoleIds.filter((currentRoleId) => currentRoleId !== roleId)

    form.setValue('roleIds', nextRoleIds, {
      shouldDirty: true,
    })
  }

  async function handleSubmit(values: EntityMemberAccessFormValues) {
    try {
      await membershipActions.saveMembership(
        {
          userId: existingMember?.user_id ?? values.userId,
          entityId: entity.id,
          roleIds: values.roleIds,
          status: values.status,
          validFrom: values.validFrom,
          validUntil: values.validUntil,
          reason: values.reason,
        },
        { isUpdate: Boolean(existingMember) }
      )
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
      await membershipActions.removeMembership({
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
      <DialogContent
        className="top-0 left-0 h-[100svh] max-h-[100svh] w-screen max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none p-0 ring-0 sm:top-4 sm:left-4 sm:h-[calc(100svh-2rem)] sm:max-h-[calc(100svh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-none sm:rounded-2xl sm:ring-1 xl:w-[min(112rem,calc(100vw-2rem))]"
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="shrink-0 border-b px-6 py-5 pr-16">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-xl">
                {existingMember ? 'Manage member access' : `Add member to ${entity.display_name}`}
              </DialogTitle>
              <AppInfoPopover
                label="Explain entity member access editor"
                title="Entity member access"
              >
                This editor manages one membership inside {entity.display_name}. Use it to choose
                the person, local roles, and lifecycle settings for that entity only.
              </AppInfoPopover>
            </div>
          </DialogHeader>

          <form
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            onSubmit={form.handleSubmit(handleSubmit)}
          >
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              <div className="grid gap-6 xl:grid-cols-[minmax(22rem,0.84fr)_minmax(0,1.16fr)]">
              <div className="flex min-h-0 flex-col gap-4">
                <section className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center gap-2">
                    <div className="font-medium">Entity context</div>
                    <AppInfoPopover
                      label="Explain entity context"
                      title="Entity context"
                    >
                      All changes in this dialog are local to {entity.display_name}. They do not
                      modify access in sibling entities or other branches.
                    </AppInfoPopover>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="outline">{formatRoleToken(entity.entity_type)}</Badge>
                    <Badge variant="outline">{formatRoleToken(entity.entity_class)}</Badge>
                    <AppStatusBadge tone={getEntityStatusTone(entity.status)}>
                      {formatRoleToken(entity.status)}
                    </AppStatusBadge>
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
                      <AppStatusBadge
                        tone={getMembershipStatusTone(existingMember.effective_status)}
                      >
                        Membership: {formatMembershipToken(existingMember.effective_status)}
                      </AppStatusBadge>
                    </div>
                  </section>
                ) : (
                  <section className="flex min-h-0 flex-1 flex-col rounded-xl border p-4">
                    <div className="flex items-center gap-2">
                      <div className="font-medium">Choose a user</div>
                      <AppInfoPopover
                        label="Explain choose user"
                        title="Choose a user"
                      >
                        Search the current user directory and select the person who should receive
                        this entity membership.
                      </AppInfoPopover>
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

                    <div className="mt-4 h-[50svh] min-h-[18rem] max-h-[36rem] overflow-auto rounded-xl border bg-background">
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

              <div className="flex flex-col gap-4">
                <section className="overflow-hidden rounded-xl border p-4">
                  <div className="flex items-center gap-2">
                    <div className="font-medium">Role assignment</div>
                    <AppInfoPopover
                      label="Explain entity role assignment"
                      title="Role assignment"
                    >
                      These roles are the ones currently assignable in this entity context. They
                      apply to this membership only.
                    </AppInfoPopover>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="relative w-full lg:max-w-sm">
                      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        aria-label="Search roles"
                        value={roleSearchValue}
                        onChange={(event) => setRoleSearchValue(event.target.value)}
                        className="pl-9"
                        placeholder="Search roles for this membership"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        {visibleAssignableRoles.length} visible role
                        {visibleAssignableRoles.length === 1 ? '' : 's'}
                      </Badge>
                      <Badge variant="outline">
                        {selectedRoleIds.length} selected
                      </Badge>
                      <label className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm font-medium">
                        <span
                          className={cn(
                            showSelectedRolesOnly ? 'text-foreground' : 'text-muted-foreground'
                          )}
                        >
                          Selected only
                        </span>
                        <Switch
                          checked={showSelectedRolesOnly}
                          disabled={selectedRoleIds.length === 0}
                          aria-label="Show selected roles only"
                          onCheckedChange={(checked) => {
                            setShowSelectedRolesOnly(Boolean(checked))
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="mt-4 h-[50svh] min-h-[20rem] max-h-[36rem] overflow-hidden">
                    <AssignableRolesTable
                      roles={availableRoles}
                      searchValue={roleSearchValue}
                      onSearchValueChange={setRoleSearchValue}
                      showSelectedOnly={showSelectedRolesOnly}
                      onShowSelectedOnlyChange={setShowSelectedRolesOnly}
                      showToolbar={false}
                      selectedRoleIds={selectedRoleIds}
                      onRoleToggle={handleRoleToggle}
                      disabled={isPending || !canManageMembershipAccess}
                      emptyMessage="No roles are available for this entity yet."
                      searchPlaceholder="Search roles for this membership"
                    />
                  </div>
                </section>

                <MembershipLifecyclePanel
                  status={selectedStatus}
                  validFrom={selectedValidFrom}
                  validUntil={selectedValidUntil}
                  reason={selectedReason}
                  reasonLabel="Lifecycle note"
                  disabled={isPending || !canManageMembershipAccess}
                  validUntilError={form.formState.errors.validUntil?.message ?? null}
                  onStatusChange={(nextStatus) => {
                    form.setValue('status', nextStatus, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }}
                  onValidFromChange={(value) => {
                    form.setValue('validFrom', value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }}
                  onValidUntilChange={(value) => {
                    form.setValue('validUntil', value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }}
                  onReasonChange={(value) => {
                    form.setValue('reason', value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }}
                />

                {submitErrorMessage ? (
                  <AppErrorState compact>{submitErrorMessage}</AppErrorState>
                ) : null}
              </div>
            </div>
            </div>

            <MembershipAccessDialogFooter
              canRemove={Boolean(existingMember && canRemoveMemberships)}
              confirmRemoval={confirmRemoval}
              isPending={isPending}
              isRemoving={membershipActions.isRemoving}
              submitLabel={existingMember ? 'Save access' : 'Add member'}
              pendingSubmitLabel={existingMember ? 'Saving…' : 'Adding…'}
              submitDisabled={isPending || !canManageMembershipAccess}
              onCancel={() => {
                onOpenChange(false)
              }}
              onConfirmRemovalChange={setConfirmRemoval}
              onRemove={() => {
                void handleRemoveMembership()
              }}
            />
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
