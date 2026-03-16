import { useEffect, useMemo, useRef, useState } from 'react'

import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'

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
import { FieldError } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { buildEntityOptions } from '@/features/entities/utils/build-entity-options'
import type { Entity } from '@/features/entities/types/entities.types'
import { getRolesForEntityQueryOptions } from '@/features/roles/api/roles.query-options'
import {
  formatAssignableTypes,
  getRoleScopeSummary,
} from '@/features/roles/utils/role-display'
import { useCreateMembershipMutation } from '@/features/memberships/hooks/use-create-membership-mutation'
import { useUpdateMembershipRolesMutation } from '@/features/memberships/hooks/use-update-membership-roles-mutation'
import type { UserMembership } from '@/features/memberships/types/memberships.types'
import { getApiErrorMessage } from '@/lib/api/errors'
import { cn } from '@/lib/utils/cn'

type MembershipRoleDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  entities: Entity[]
  memberships: UserMembership[]
  initialEntityId?: string | null
  lockEntity?: boolean
  canManageMembershipRoles: boolean
}

function areRoleIdsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false
  }

  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()

  return sortedLeft.every((roleId, index) => roleId === sortedRight[index])
}

export function MembershipRoleDialog({
  open,
  onOpenChange,
  userId,
  entities,
  memberships,
  initialEntityId,
  lockEntity = false,
  canManageMembershipRoles,
}: MembershipRoleDialogProps) {
  const previousOpenRef = useRef(open)
  const [selectedEntityId, setSelectedEntityId] = useState(initialEntityId ?? '')
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([])
  const createMembershipMutation = useCreateMembershipMutation()
  const updateMembershipRolesMutation = useUpdateMembershipRolesMutation()
  const entityOptions = useMemo(() => buildEntityOptions(entities), [entities])
  const selectedEntity =
    entityOptions.find((entityOption) => entityOption.id === selectedEntityId) ?? null
  const selectedEntityPath = selectedEntity?.pathLabel.split(' / ') ?? []
  const existingMembership =
    memberships.find((membership) => membership.entity_id === selectedEntityId) ?? null
  const rolesQuery = useQuery({
    ...getRolesForEntityQueryOptions(selectedEntityId, { limit: 100 }),
    enabled: open && canManageMembershipRoles && Boolean(selectedEntityId),
  })

  useEffect(() => {
    if (!open) {
      return
    }

    setSelectedEntityId(initialEntityId ?? '')
  }, [initialEntityId, open])

  useEffect(() => {
    const wasOpen = previousOpenRef.current

    if (wasOpen && !open) {
      setSelectedEntityId(initialEntityId ?? '')
      setSelectedRoleIds(initialEntityId ? existingMembership?.role_ids ?? [] : [])
      createMembershipMutation.reset()
      updateMembershipRolesMutation.reset()
    }

    previousOpenRef.current = open
  }, [
    createMembershipMutation,
    existingMembership?.role_ids,
    initialEntityId,
    open,
    updateMembershipRolesMutation,
  ])

  useEffect(() => {
    if (!open) {
      return
    }

    setSelectedRoleIds(existingMembership?.role_ids ?? [])
  }, [existingMembership?.id, existingMembership?.role_ids, open, selectedEntityId])

  const availableRoles = useMemo(
    () =>
      (rolesQuery.data?.items ?? []).sort((left, right) =>
        left.display_name.localeCompare(right.display_name)
      ),
    [rolesQuery.data?.items]
  )
  const isDirty = existingMembership
    ? !areRoleIdsEqual(selectedRoleIds, existingMembership.role_ids)
    : Boolean(selectedEntityId) && selectedRoleIds.length > 0
  const submitError = createMembershipMutation.error ?? updateMembershipRolesMutation.error
  const submitErrorMessage = submitError
    ? getApiErrorMessage(
        submitError,
        existingMembership
          ? 'The membership roles could not be updated.'
          : 'The entity membership could not be created.'
      )
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-hidden p-0 sm:max-w-4xl">
        <div className="flex max-h-[calc(100svh-2rem)] flex-col">
          <DialogHeader className="border-b px-6 py-5">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="text-2xl">
                {existingMembership ? 'Manage membership roles' : 'Add membership roles'}
              </DialogTitle>
              <Badge variant="outline">{selectedRoleIds.length} selected</Badge>
            </div>
          </DialogHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={async (event) => {
              event.preventDefault()

              if (!canManageMembershipRoles || !selectedEntityId || selectedRoleIds.length === 0) {
                return
              }

              try {
                if (existingMembership) {
                  await updateMembershipRolesMutation.mutateAsync({
                    userId,
                    entityId: selectedEntityId,
                    roleIds: selectedRoleIds,
                  })
                } else {
                  await createMembershipMutation.mutateAsync({
                    userId,
                    entityId: selectedEntityId,
                    roleIds: selectedRoleIds,
                  })
                }

                onOpenChange(false)
              } catch {
                return
              }
            }}
          >
            <div className="grid min-h-0 flex-1 gap-6 overflow-hidden px-6 py-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
              <section className="flex min-h-0 flex-col rounded-xl border p-4">
                <h3 className="font-medium">Entity scope</h3>

                <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
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
                      disabled={lockEntity || !canManageMembershipRoles}
                    >
                      <ComboboxInput
                        id="membership-role-entity"
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
                    <div className="flex min-h-0 flex-1 flex-col rounded-xl border bg-muted/30 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{selectedEntity.title}</p>
                        <Badge variant="outline">{selectedEntity.entityTypeLabel}</Badge>
                        {existingMembership ? (
                          <Badge variant="secondary">Existing membership</Badge>
                        ) : null}
                      </div>

                      <div className="mt-4 space-y-2">
                        <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                          Hierarchy path
                        </p>
                        <div className="-mx-1 overflow-x-auto px-1 pb-1">
                          <div className="flex min-w-max items-center gap-1">
                            {selectedEntityPath.map((segment, index) => {
                              const isLast = index === selectedEntityPath.length - 1

                              return (
                                <div
                                  key={`${segment}-${index}`}
                                  className="flex shrink-0 items-center gap-1"
                                >
                                  {index > 0 ? (
                                    <ChevronRight className="size-3 text-muted-foreground" />
                                  ) : null}
                                  <span
                                    className={cn(
                                      'inline-flex shrink-0 whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs leading-5',
                                      isLast
                                        ? 'border-foreground bg-foreground text-background'
                                        : 'bg-background text-foreground'
                                    )}
                                  >
                                    {segment}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>

                      <p className="mt-4 text-sm leading-6 text-muted-foreground">
                        {existingMembership
                          ? 'Saving replaces the current role set on this membership.'
                          : 'Selecting roles here creates a new membership for this user at the chosen entity.'}
                      </p>
                    </div>
                  ) : (
                    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-dashed p-4">
                      <p className="font-medium">No entity selected</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Choose the exact entity where this user should hold scoped roles.
                      </p>
                    </div>
                  )}
                </div>
              </section>

              <section className="flex min-h-0 h-full flex-col overflow-hidden rounded-xl border bg-background">
                <div className="border-b px-4 py-3">
                  <h3 className="font-medium">Membership roles</h3>
                </div>

                <div className="min-h-0 flex-1 overflow-auto bg-background">
                  {!canManageMembershipRoles ? (
                    <div className="px-4 py-6 text-sm text-muted-foreground">
                      Your account cannot manage membership-scoped roles from this workspace.
                    </div>
                  ) : !selectedEntity ? (
                    <div className="px-4 py-6 text-sm text-muted-foreground">
                      Choose an entity scope first to load the valid role set.
                    </div>
                  ) : rolesQuery.isPending ? (
                    <div className="px-4 py-6 text-sm text-muted-foreground">
                      Loading roles for this entity…
                    </div>
                  ) : rolesQuery.error ? (
                    <div className="px-4 py-6 text-sm text-destructive">
                      {getApiErrorMessage(
                        rolesQuery.error,
                        'The roles for the selected entity could not be loaded.'
                      )}
                    </div>
                  ) : availableRoles.length > 0 ? (
                    <div className="divide-y">
                      {availableRoles.map((role) => {
                        const checked = selectedRoleIds.includes(role.id)
                        const roleInputId = `membership-role-${role.id}`
                        const assignableTypes = formatAssignableTypes(role)

                        return (
                          <div
                            key={role.id}
                            className={cn(
                              'px-4 py-3 transition-colors',
                              checked ? 'bg-muted/30' : 'bg-background'
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <Checkbox
                                id={roleInputId}
                                checked={checked}
                                disabled={
                                  createMembershipMutation.isPending ||
                                  updateMembershipRolesMutation.isPending
                                }
                                onCheckedChange={(nextChecked) => {
                                  const nextRoleIds = nextChecked
                                    ? [...selectedRoleIds, role.id]
                                    : selectedRoleIds.filter(
                                        (selectedRoleId) => selectedRoleId !== role.id
                                      )

                                  setSelectedRoleIds(nextRoleIds)
                                }}
                                className="mt-1"
                              />

                              <div className="min-w-0 flex-1 space-y-1.5">
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

                                <p className="text-sm leading-5 text-muted-foreground">
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
                      No roles are available for the selected entity.
                    </div>
                  )}
                </div>

                {submitErrorMessage ? (
                  <div className="border-t px-4 py-3">
                    <FieldError>{submitErrorMessage}</FieldError>
                  </div>
                ) : null}
              </section>
            </div>

            <DialogFooter className="mt-0 shrink-0 !mx-0 !mb-0 rounded-b-[inherit] px-6 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  !canManageMembershipRoles ||
                  !selectedEntityId ||
                  selectedRoleIds.length === 0 ||
                  !isDirty ||
                  createMembershipMutation.isPending ||
                  updateMembershipRolesMutation.isPending
                }
              >
                {createMembershipMutation.isPending || updateMembershipRolesMutation.isPending
                  ? 'Saving roles...'
                  : existingMembership
                    ? 'Update roles'
                    : 'Create membership'}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
