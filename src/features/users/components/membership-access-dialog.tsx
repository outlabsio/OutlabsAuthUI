import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'

import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'

import { AppInfoPopover } from '@/components/app/app-info-popover'
import { AppStatusBadge } from '@/components/app/app-status-badge'
import { Badge } from '@/components/ui/badge'
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { buildEntityOptions } from '@/features/entities/utils/build-entity-options'
import type { Entity } from '@/features/entities/types/entities.types'
import { MembershipAccessDialogFooter } from '@/features/memberships/components/membership-access-dialog-footer'
import { MembershipAccessRolesPanel } from '@/features/memberships/components/membership-access-roles-panel'
import { MembershipLifecyclePanel } from '@/features/memberships/components/membership-lifecycle-panel'
import { useMembershipAccessActions } from '@/features/memberships/hooks/use-membership-access-actions'
import type { UserMembership } from '@/features/memberships/types/memberships.types'
import {
  formatMembershipToken,
  getMembershipStatusTone,
} from '@/features/memberships/utils/membership-display'
import {
  areRoleIdsEqual,
  toDateTimeLocalValue,
} from '@/features/memberships/utils/membership-datetime'
import { getRolesForEntityQueryOptions } from '@/features/roles/api/roles.query-options'
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
  const initialDialogEntityId = initialEntityId ?? ''
  const initialMembership =
    memberships.find((membership) => membership.entity_id === initialDialogEntityId) ??
    null
  const [selectedEntityId, setSelectedEntityId] = useState(initialDialogEntityId)
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(
    () => initialMembership?.role_ids ?? []
  )
  const [selectedStatus, setSelectedStatus] = useState<'active' | 'suspended'>(
    initialMembership?.status === 'suspended' ? 'suspended' : 'active'
  )
  const [validFrom, setValidFrom] = useState(
    toDateTimeLocalValue(initialMembership?.valid_from)
  )
  const [validUntil, setValidUntil] = useState(
    toDateTimeLocalValue(initialMembership?.valid_until)
  )
  const [reason, setReason] = useState(initialMembership?.revocation_reason ?? '')
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const membershipActions = useMembershipAccessActions()

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

  const availableRoles = useMemo(
    () =>
      (rolesQuery.data?.items ?? []).sort((left, right) =>
        left.display_name.localeCompare(right.display_name)
      ),
    [rolesQuery.data?.items]
  )
  const initialRoleIds = existingMembership?.role_ids ?? []
  const initialStatus =
    existingMembership?.status === 'suspended' ? 'suspended' : 'active'
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
  const submitErrorMessage = membershipActions.getSubmitErrorMessage(
    Boolean(existingMembership),
    'The entity access could not be created.'
  )

  function applyMembershipState(membership?: UserMembership | null) {
    setSelectedRoleIds(membership?.role_ids ?? [])
    setSelectedStatus(membership?.status === 'suspended' ? 'suspended' : 'active')
    setValidFrom(toDateTimeLocalValue(membership?.valid_from))
    setValidUntil(toDateTimeLocalValue(membership?.valid_until))
    setReason(membership?.revocation_reason ?? '')
    setShowRemoveConfirm(false)
  }

  function handleEntitySelection(nextEntityId: string) {
    setSelectedEntityId(nextEntityId)
    applyMembershipState(
      memberships.find((membership) => membership.entity_id === nextEntityId) ?? null
    )
  }

  const wasOpenRef = useRef(false)
  const resetDialogState = useEffectEvent(() => {
    const nextEntityId = initialEntityId ?? ''

    setSelectedEntityId(nextEntityId)
    applyMembershipState(
      memberships.find((membership) => membership.entity_id === nextEntityId) ?? null
    )
    membershipActions.reset()
  })

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current
    wasOpenRef.current = open

    if (!justOpened) {
      return
    }

    resetDialogState()
  }, [open])

  function handleDialogOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetDialogState()
    }

    onOpenChange(nextOpen)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!canManageMembershipAccess || !selectedEntityId) {
      return
    }

    try {
      await membershipActions.saveMembership(
        {
          userId,
          entityId: selectedEntityId,
          roleIds: selectedRoleIds,
          status: selectedStatus,
          validFrom,
          validUntil,
          reason,
        },
        { isUpdate: Boolean(existingMembership) }
      )
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
      await membershipActions.removeMembership({
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
  const currentStatusTone = existingMembership
    ? getMembershipStatusTone(existingMembership.effective_status)
    : 'neutral'
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
                    <AppInfoPopover label="Explain entity scope" title="Entity scope">
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
                          handleEntitySelection(value?.id ?? '')
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
                            <AppStatusBadge tone={currentStatusTone}>
                              {currentStatusLabel}
                            </AppStatusBadge>
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
                              {formatDateTime(
                                existingMembership?.joined_at,
                                'Not assigned yet'
                              )}
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

                        <MembershipLifecyclePanel
                          className="bg-background/80"
                          status={selectedStatus}
                          validFrom={validFrom}
                          validUntil={validUntil}
                          reason={reason}
                          helperMessage={accessWindowStateMessage}
                          disabled={!canManageMembershipAccess}
                          validUntilError={null}
                          reasonLabel="Lifecycle note"
                          reasonPlaceholder="Optional note for suspension, restoration, or timing context"
                          onStatusChange={setSelectedStatus}
                          onValidFromChange={setValidFrom}
                          onValidUntilChange={setValidUntil}
                          onReasonChange={setReason}
                        />
                      </div>
                    ) : (
                      <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
                        Choose an entity to configure scoped access.
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {!selectedEntityId ? (
                <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border">
                  <div className="flex min-h-full items-center justify-center px-6 py-10 text-sm text-muted-foreground">
                    Pick an entity to load the scoped role catalog.
                  </div>
                </section>
              ) : (
                <MembershipAccessRolesPanel
                  roles={availableRoles}
                  selectedRoleIds={selectedRoleIds}
                  disabled={!canManageMembershipAccess}
                  isLoading={rolesQuery.isPending}
                  error={rolesQuery.error}
                  onRoleToggle={(roleId, checked) => {
                    setSelectedRoleIds((currentRoleIds) => {
                      if (checked) {
                        return [...currentRoleIds, roleId]
                      }

                      return currentRoleIds.filter(
                        (currentRoleId) => currentRoleId !== roleId
                      )
                    })
                  }}
                />
              )}
            </div>

            {submitErrorMessage ? (
              <div className="px-6 pb-4">
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {submitErrorMessage}
                </div>
              </div>
            ) : null}

            <MembershipAccessDialogFooter
              canRemove={Boolean(
                existingMembership &&
                  canRemoveMemberships &&
                  existingMembership.status !== 'revoked'
              )}
              confirmRemoval={showRemoveConfirm}
              isPending={membershipActions.isPending}
              isRemoving={membershipActions.isRemoving}
              idleHint={
                existingMembership?.status === 'revoked'
                  ? 'This entity membership has been removed. Save to restore it.'
                  : 'Membership changes apply only within the selected entity.'
              }
              submitLabel={existingMembership ? 'Save access' : 'Assign entity'}
              pendingSubmitLabel={existingMembership ? 'Saving…' : 'Assigning…'}
              submitDisabled={
                !canManageMembershipAccess ||
                !selectedEntityId ||
                !isDirty ||
                membershipActions.isPending
              }
              onCancel={() => {
                handleDialogOpenChange(false)
              }}
              onConfirmRemovalChange={setShowRemoveConfirm}
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
