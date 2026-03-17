import { useEffect, useMemo, useState } from 'react'

import { useQuery } from '@tanstack/react-query'
import { CalendarClock, ChevronRight } from 'lucide-react'

import { AppDateTimePicker } from '@/components/app/app-date-time-picker'
import { AppInfoPopover } from '@/components/app/app-info-popover'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { buildEntityOptions } from '@/features/entities/utils/build-entity-options'
import type { Entity } from '@/features/entities/types/entities.types'
import { useCreateMembershipMutation } from '@/features/memberships/hooks/use-create-membership-mutation'
import { useRemoveMembershipMutation } from '@/features/memberships/hooks/use-remove-membership-mutation'
import { useUpdateMembershipMutation } from '@/features/memberships/hooks/use-update-membership-mutation'
import type { UserMembership } from '@/features/memberships/types/memberships.types'
import {
  formatMembershipToken,
  getMembershipStatusVariant,
} from '@/features/memberships/utils/membership-display'
import { getRolesForEntityQueryOptions } from '@/features/roles/api/roles.query-options'
import {
  formatAssignableTypes,
  getRoleScopeSummary,
} from '@/features/roles/utils/role-display'
import { getApiErrorMessage } from '@/lib/api/errors'
import { cn } from '@/lib/utils/cn'

type MembershipAccessDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  entities: Entity[]
  memberships: UserMembership[]
  initialEntityId?: string | null
  lockEntity?: boolean
  canManageMembershipAccess: boolean
  canRemoveMemberships: boolean
}

const membershipStatusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'suspended' },
] as const

function areRoleIdsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false
  }

  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()

  return sortedLeft.every((roleId, index) => roleId === sortedRight[index])
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16)
}

function toIsoValue(value: string) {
  return value ? new Date(value).toISOString() : null
}

function formatDateTime(value?: string | null, fallback = 'Not set') {
  if (!value) {
    return fallback
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function MembershipAccessDialog({
  open,
  onOpenChange,
  userId,
  entities,
  memberships,
  initialEntityId,
  lockEntity = false,
  canManageMembershipAccess,
  canRemoveMemberships,
}: MembershipAccessDialogProps) {
  const [selectedEntityId, setSelectedEntityId] = useState(initialEntityId ?? '')
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([])
  const [selectedStatus, setSelectedStatus] = useState<'active' | 'suspended'>('active')
  const [validFrom, setValidFrom] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [reason, setReason] = useState('')
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)

  const createMembershipMutation = useCreateMembershipMutation()
  const updateMembershipMutation = useUpdateMembershipMutation()
  const removeMembershipMutation = useRemoveMembershipMutation()

  const entityOptions = useMemo(() => buildEntityOptions(entities), [entities])
  const selectedEntity =
    entityOptions.find((entityOption) => entityOption.id === selectedEntityId) ?? null
  const existingMembership =
    memberships.find((membership) => membership.entity_id === selectedEntityId) ?? null
  const selectedEntityPath = selectedEntity?.pathLabel.split(' / ') ?? []
  const rolesQuery = useQuery({
    ...getRolesForEntityQueryOptions(selectedEntityId, { limit: 100 }),
    enabled: open && canManageMembershipAccess && Boolean(selectedEntityId),
  })

  useEffect(() => {
    if (!open) {
      return
    }

    setSelectedEntityId(initialEntityId ?? '')
    setShowRemoveConfirm(false)
  }, [initialEntityId, open])

  useEffect(() => {
    if (!open) {
      return
    }

    setSelectedRoleIds(existingMembership?.role_ids ?? [])
    setSelectedStatus(existingMembership?.status === 'suspended' ? 'suspended' : 'active')
    setValidFrom(toDateTimeLocalValue(existingMembership?.valid_from))
    setValidUntil(toDateTimeLocalValue(existingMembership?.valid_until))
    setReason(existingMembership?.revocation_reason ?? '')
    setShowRemoveConfirm(false)
  }, [
    existingMembership?.entity_id,
    existingMembership?.revocation_reason,
    existingMembership?.role_ids,
    existingMembership?.status,
    existingMembership?.valid_from,
    existingMembership?.valid_until,
    open,
    selectedEntityId,
  ])

  const availableRoles = useMemo(
    () =>
      (rolesQuery.data?.items ?? []).sort((left, right) =>
        left.display_name.localeCompare(right.display_name)
      ),
    [rolesQuery.data?.items]
  )
  const initialRoleIds = existingMembership?.role_ids ?? []
  const initialStatus = existingMembership?.status === 'suspended' ? 'suspended' : 'active'
  const initialValidFrom = toDateTimeLocalValue(existingMembership?.valid_from)
  const initialValidUntil = toDateTimeLocalValue(existingMembership?.valid_until)
  const initialReason = existingMembership?.revocation_reason ?? ''
  const lifecycleChanged =
    selectedStatus !== initialStatus ||
    validFrom !== initialValidFrom ||
    validUntil !== initialValidUntil ||
    reason !== initialReason
  const isDirty = existingMembership
    ? !areRoleIdsEqual(selectedRoleIds, initialRoleIds) || lifecycleChanged
    : Boolean(selectedEntityId)
  const isSaving =
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
        existingMembership
          ? 'The entity access could not be updated.'
          : 'The entity access could not be created.'
      )
    : null

  function handleDialogOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setShowRemoveConfirm(false)
      createMembershipMutation.reset()
      updateMembershipMutation.reset()
      removeMembershipMutation.reset()
    }

    onOpenChange(nextOpen)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!canManageMembershipAccess || !selectedEntityId) {
      return
    }

    try {
      if (existingMembership) {
        await updateMembershipMutation.mutateAsync({
          userId,
          entityId: selectedEntityId,
          roleIds: selectedRoleIds,
          status: selectedStatus,
          validFrom: toIsoValue(validFrom),
          validUntil: toIsoValue(validUntil),
          reason: reason.trim() || null,
        })
      } else {
        await createMembershipMutation.mutateAsync({
          userId,
          entityId: selectedEntityId,
          roleIds: selectedRoleIds,
          status: selectedStatus,
          validFrom: toIsoValue(validFrom),
          validUntil: toIsoValue(validUntil),
          reason: reason.trim() || null,
        })
      }

      handleDialogOpenChange(false)
    } catch {
      return
    }
  }

  async function handleRemoveMembership() {
    if (!existingMembership) {
      return
    }

    try {
      await removeMembershipMutation.mutateAsync({
        userId,
        entityId: existingMembership.entity_id,
      })
      handleDialogOpenChange(false)
    } catch {
      return
    }
  }

  const currentStatusLabel = existingMembership
    ? formatMembershipToken(existingMembership.effective_status)
    : null
  const currentStatusVariant = existingMembership
    ? getMembershipStatusVariant(existingMembership.effective_status)
    : 'outline'
  const accessWindowStateMessage =
    existingMembership?.effective_status === 'expired'
      ? 'Window ended.'
      : existingMembership?.effective_status === 'pending'
        ? 'Window starts later.'
        : null

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-hidden p-0 sm:max-w-5xl">
        <div className="flex max-h-[calc(100svh-2rem)] flex-col">
          <DialogHeader className="border-b px-6 py-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-2xl">
                  {existingMembership ? 'Manage entity access' : 'Assign entity'}
                </DialogTitle>
                <AppInfoPopover
                  label="Explain membership access editor"
                  title="Membership access"
                >
                  Entity memberships attach the user to one branch of the hierarchy. Use this
                  editor to choose the entity, local roles, and lifecycle window for that scoped
                  access.
                </AppInfoPopover>
              </div>
              <Badge variant="outline">{selectedRoleIds.length} roles</Badge>
            </div>
          </DialogHeader>

          <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
            <div className="grid min-h-0 flex-1 gap-6 overflow-hidden px-6 py-6 xl:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]">
              <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border">
                <div className="border-b px-4 py-4">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">Entity scope</h3>
                    <AppInfoPopover
                      label="Explain entity scope"
                      title="Entity scope"
                    >
                      Choose the entity where this membership lives. Any roles selected here apply
                      only in that entity context.
                    </AppInfoPopover>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                  <div className="flex flex-col gap-4">
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
                        setSelectedEntityId(value?.id ?? '')
                      }}
                      disabled={lockEntity || !canManageMembershipAccess}
                    >
                      <ComboboxInput
                        id="membership-access-entity"
                        placeholder="Search organization, region, office, or team"
                        className="w-full"
                        showClear={!lockEntity}
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
                                  <span className="font-medium">{option.title}</span>
                                  <Badge variant="outline">{option.entityTypeLabel}</Badge>
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
                  </div>

                  {selectedEntity ? (
                    <div className="flex flex-col gap-4 rounded-xl border bg-muted/30 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{selectedEntity.title}</p>
                        <Badge variant="outline">{selectedEntity.entityTypeLabel}</Badge>
                        <Badge variant="outline">{selectedEntity.entityClassLabel}</Badge>
                        {existingMembership ? (
                          <Badge variant={currentStatusVariant}>{currentStatusLabel}</Badge>
                        ) : null}
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                          Hierarchy path
                        </p>
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
                            {selectedEntityPath.map((segment, index) => {
                              const isLast = index === selectedEntityPath.length - 1

                              return (
                                <div
                                  key={`${segment}-${index}`}
                                  className="flex max-w-full items-center gap-1"
                                >
                                  {index > 0 ? (
                                    <ChevronRight className="size-3 text-muted-foreground/70" />
                                  ) : null}
                                  <span
                                    className={cn(
                                      'max-w-full rounded-full border px-2 py-0.5 text-xs leading-4 whitespace-normal break-words',
                                      isLast
                                        ? 'border-foreground bg-foreground text-background'
                                        : 'bg-background/80'
                                    )}
                                  >
                                    {segment}
                                  </span>
                                </div>
                              )
                            })}
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-lg border bg-background/80 px-3 py-2.5">
                          <div className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
                            Joined
                          </div>
                          <div className="mt-1 text-sm">
                            {formatDateTime(existingMembership?.joined_at, 'Not assigned yet')}
                          </div>
                        </div>
                        <div className="rounded-lg border bg-background/80 px-3 py-2.5">
                          <div className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
                            Current access
                          </div>
                          <div className="mt-1 text-sm">
                            {existingMembership?.can_grant_permissions
                              ? 'Grants permissions now'
                              : existingMembership
                                ? 'Does not currently grant permissions'
                                : 'Will activate after save'}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3 rounded-lg border bg-background/80 p-4">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="membership-access-status" className="text-base">
                            Access state
                          </Label>
                          <AppInfoPopover
                            label="Explain membership access state"
                            title="Access state"
                          >
                            Active memberships can grant access now or within the configured window.
                            Suspended memberships stay linked to the entity but stop granting
                            access until restored.
                          </AppInfoPopover>
                        </div>

                        <Select
                          items={membershipStatusOptions}
                          value={selectedStatus}
                          onValueChange={(value) => {
                            setSelectedStatus((value as 'active' | 'suspended') ?? 'active')
                          }}
                          disabled={!canManageMembershipAccess}
                        >
                          <SelectTrigger
                            id="membership-access-status"
                            className="h-10 w-full"
                            aria-label="Select access state"
                          >
                            <SelectValue placeholder="Select an access state" />
                          </SelectTrigger>
                          <SelectContent align="start" alignItemWithTrigger={false}>
                            <SelectGroup>
                              {membershipStatusOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-4 rounded-lg border bg-background/80 p-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 font-medium text-foreground">
                            <CalendarClock className="size-4 text-muted-foreground" />
                            <span>Access window</span>
                            <AppInfoPopover
                              label="Explain membership access window"
                              title="Access window"
                            >
                              Start and end dates are optional. Use them when the membership should
                              activate later or expire automatically.
                            </AppInfoPopover>
                          </div>
                          {accessWindowStateMessage ? (
                            <p className="text-sm text-muted-foreground">
                              {accessWindowStateMessage}
                            </p>
                          ) : null}
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="membership-access-valid-from">Valid from</Label>
                            <AppDateTimePicker
                              id="membership-access-valid-from"
                              value={validFrom}
                              onChange={(nextValue) => {
                                setValidFrom(nextValue)
                              }}
                              disabled={!canManageMembershipAccess}
                              placeholder="Pick a start date"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="membership-access-valid-until">Valid until</Label>
                            <AppDateTimePicker
                              id="membership-access-valid-until"
                              value={validUntil}
                              onChange={(nextValue) => {
                                setValidUntil(nextValue)
                              }}
                              disabled={!canManageMembershipAccess}
                              placeholder="Pick an end date"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="membership-access-reason">Lifecycle note</Label>
                          <Textarea
                            id="membership-access-reason"
                            value={reason}
                            disabled={!canManageMembershipAccess}
                            placeholder="Optional note for suspension, restoration, or timing context"
                            onChange={(event) => {
                              setReason(event.target.value)
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
                      Choose an entity to configure scoped access.
                    </div>
                  )}
                  </div>
                </div>
              </section>

              <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border">
                <div className="border-b px-4 py-4">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">Roles</h3>
                    <AppInfoPopover
                      label="Explain membership roles"
                      title="Membership roles"
                    >
                      These are the roles available for the selected entity. They affect this
                      membership only, not the user account globally.
                    </AppInfoPopover>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                  {!selectedEntityId ? (
                    <div className="flex min-h-full items-center justify-center px-6 py-10 text-sm text-muted-foreground">
                      Pick an entity to load the scoped role catalog.
                    </div>
                  ) : rolesQuery.isPending ? (
                    <div className="flex min-h-full items-center justify-center px-6 py-10 text-sm text-muted-foreground">
                      Loading roles…
                    </div>
                  ) : rolesQuery.isError ? (
                    <div className="px-6 py-6 text-sm text-destructive">
                      {getApiErrorMessage(
                        rolesQuery.error,
                        'The role catalog for this entity could not be loaded.'
                      )}
                    </div>
                  ) : availableRoles.length > 0 ? (
                    <div className="divide-y">
                      {availableRoles.map((role) => {
                        const checked = selectedRoleIds.includes(role.id)

                        return (
                          <label
                            key={role.id}
                            className={cn(
                              'flex cursor-pointer items-start gap-3 px-4 py-4 transition-colors',
                              checked ? 'bg-muted/30' : 'hover:bg-muted/20'
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(nextChecked) => {
                                setSelectedRoleIds((currentRoleIds) => {
                                  if (nextChecked) {
                                    return [...currentRoleIds, role.id]
                                  }

                                  return currentRoleIds.filter(
                                    (currentRoleId) => currentRoleId !== role.id
                                  )
                                })
                              }}
                              disabled={!canManageMembershipAccess}
                              className="mt-1"
                            />

                            <div className="min-w-0 flex-1 space-y-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{role.display_name}</span>
                                {role.is_global ? <Badge variant="outline">Global</Badge> : null}
                                <Badge variant="outline">
                                  {role.permissions.length} permissions
                                </Badge>
                              </div>

                              {role.description ? (
                                <p className="text-sm text-muted-foreground">{role.description}</p>
                              ) : null}

                              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                <span className="inline-flex items-center rounded-full border px-2 py-1">
                                  {getRoleScopeSummary(role)}
                                </span>
                                {role.assignable_at_types.length > 0 ? (
                                <span className="inline-flex items-center rounded-full border px-2 py-1">
                                    Assignable at {formatAssignableTypes(role)}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="flex min-h-full items-center justify-center px-6 py-10 text-sm text-muted-foreground">
                      No roles are currently available for this entity.
                    </div>
                  )}
                </div>
              </section>
            </div>

            {submitErrorMessage ? (
              <div className="px-6 pb-4">
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {submitErrorMessage}
                </div>
              </div>
            ) : null}

            <DialogFooter className="mx-0 mb-0 flex-col gap-4 rounded-none border-t bg-background px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  {existingMembership && canRemoveMemberships && existingMembership.status !== 'revoked' ? (
                    showRemoveConfirm ? (
                      <>
                        <span className="text-sm text-muted-foreground">
                          Remove this user from the selected entity?
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setShowRemoveConfirm(false)
                          }}
                          disabled={isSaving}
                        >
                          Keep access
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={handleRemoveMembership}
                          disabled={isSaving}
                        >
                          {removeMembershipMutation.isPending
                            ? 'Removing…'
                            : 'Confirm remove'}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
                        onClick={() => {
                          setShowRemoveConfirm(true)
                        }}
                        disabled={isSaving}
                        >
                          Remove membership
                        </Button>
                    )
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {existingMembership?.status === 'revoked'
                        ? 'This entity membership has been removed. Save to restore it.'
                        : 'Membership changes apply only within the selected entity.'}
                    </span>
                  )}
              </div>

              <div className="flex w-full shrink-0 items-center justify-end gap-3 sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    handleDialogOpenChange(false)
                  }}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    !canManageMembershipAccess ||
                    !selectedEntityId ||
                    !isDirty ||
                    isSaving
                  }
                >
                  {isSaving
                    ? existingMembership
                      ? 'Saving…'
                      : 'Assigning…'
                    : existingMembership
                      ? 'Save access'
                      : 'Assign entity'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
