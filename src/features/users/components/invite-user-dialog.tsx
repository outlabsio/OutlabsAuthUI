import { useEffect, useMemo, useRef, useState } from 'react'

import { useQuery } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { ChevronRight, Shield } from 'lucide-react'

import { AppFormField } from '@/components/app/app-form-field'
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
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { buildEntityOptions } from '@/features/entities/utils/build-entity-options'
import type { Entity } from '@/features/entities/types/entities.types'
import {
  getRolesForEntityQueryOptions,
  getRolesQueryOptions,
} from '@/features/roles/api/roles.query-options'
import {
  formatAssignableTypes,
  getRoleScopeSummary,
} from '@/features/roles/utils/role-display'
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
  entityHierarchyEnabled: boolean
  contextAwareRoles: boolean
  canInviteSuperusers: boolean
}

export function InviteUserDialog({
  open,
  onOpenChange,
  entities,
  entityHierarchyEnabled,
  contextAwareRoles,
  canInviteSuperusers,
}: InviteUserDialogProps) {
  const inviteMutation = useInviteUserMutation()
  const previousOpenRef = useRef(open)
  const previousEntityIdRef = useRef<string | null>(null)
  const [showSelectedRolesOnly, setShowSelectedRolesOnly] = useState(false)
  const form = useForm<InviteUserFormValues>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
      entityId: '',
      roleIds: [],
      isSuperuser: false,
    },
  })

  useEffect(() => {
    const wasOpen = previousOpenRef.current

    if (wasOpen && !open) {
      previousEntityIdRef.current = null
      setShowSelectedRolesOnly(false)
      form.reset()
      inviteMutation.reset()
    }

    previousOpenRef.current = open
  }, [form, inviteMutation, open])

  const roleIds = form.watch('roleIds')
  const entityId = form.watch('entityId')
  const submitError = inviteMutation.error
    ? getApiErrorMessage(inviteMutation.error, 'Unable to send the invitation.')
    : null
  const entityOptions = useMemo(() => buildEntityOptions(entities), [entities])
  const selectedEntity = entityHierarchyEnabled
    ? entityOptions.find((option) => option.id === entityId) ?? null
    : null
  const selectedEntityPath = selectedEntity?.pathLabel.split(' / ') ?? []
  const rolesRequireEntity = entityHierarchyEnabled && contextAwareRoles
  const genericRolesQuery = useQuery({
    ...getRolesQueryOptions({ limit: 100 }),
    enabled: open && !rolesRequireEntity,
  })
  const entityRolesQuery = useQuery({
    ...getRolesForEntityQueryOptions(selectedEntity?.id ?? '', { limit: 100 }),
    enabled: open && rolesRequireEntity && Boolean(selectedEntity?.id),
  })

  useEffect(() => {
    if (!rolesRequireEntity) {
      return
    }

    const nextEntityId = entityId || null

    if (
      previousEntityIdRef.current !== null &&
      previousEntityIdRef.current !== nextEntityId
    ) {
      form.setValue('roleIds', [], {
        shouldDirty: true,
        shouldValidate: true,
      })
    }

    previousEntityIdRef.current = nextEntityId
  }, [entityId, form, rolesRequireEntity])

  useEffect(() => {
    if (roleIds.length === 0 && showSelectedRolesOnly) {
      setShowSelectedRolesOnly(false)
    }
  }, [roleIds.length, showSelectedRolesOnly])

  const availableRoles = useMemo(
    () =>
      rolesRequireEntity
        ? entityRolesQuery.data?.items ?? []
        : genericRolesQuery.data?.items ?? [],
    [rolesRequireEntity, entityRolesQuery.data?.items, genericRolesQuery.data?.items]
  )
  const rolesError = rolesRequireEntity ? entityRolesQuery.error : genericRolesQuery.error
  const rolesPending = rolesRequireEntity
    ? Boolean(selectedEntity) && entityRolesQuery.isPending
    : genericRolesQuery.isPending
  const sortedRoles = useMemo(
    () =>
      [...availableRoles].sort((left, right) =>
        left.display_name.localeCompare(right.display_name)
      ),
    [availableRoles]
  )
  const visibleRoles = useMemo(
    () =>
      showSelectedRolesOnly
        ? sortedRoles.filter((role) => roleIds.includes(role.id))
        : sortedRoles,
    [roleIds, showSelectedRolesOnly, sortedRoles]
  )

  const emailField = form.register('email')
  const firstNameField = form.register('firstName')
  const lastNameField = form.register('lastName')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-hidden p-0 sm:max-w-4xl">
        <div className="flex max-h-[calc(100svh-2rem)] flex-col">
          <DialogHeader className="border-b px-6 py-5">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-2xl">Invite user</DialogTitle>
              <AppInfoPopover
                label="Explain invite user flow"
                title="Invite user"
              >
                {entityHierarchyEnabled
                  ? 'A usable email address is required. This flow creates the account invitation and can optionally attach an initial entity membership with scoped roles.'
                  : 'A usable email address is required. This flow creates the account invitation and can optionally attach direct account roles.'}
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
                  entity_id: entityHierarchyEnabled
                    ? values.entityId || undefined
                    : undefined,
                  role_ids:
                    (!rolesRequireEntity || values.entityId) &&
                    values.roleIds.length > 0
                      ? values.roleIds
                      : undefined,
                  is_superuser:
                    canInviteSuperusers && values.isSuperuser
                      ? true
                      : undefined,
                })
                onOpenChange(false)
              } catch {
                return
              }
            })}
          >
            <div className="grid min-h-0 flex-1 gap-6 overflow-hidden px-6 py-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.95fr)]">
              <div className="flex min-h-0 flex-col gap-5 pr-1">
                <AppFormField
                  label="Email"
                  htmlFor="invite-email"
                  errors={[form.formState.errors.email]}
                >
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="person@example.com"
                    autoComplete="email"
                    aria-invalid={Boolean(form.formState.errors.email)}
                    disabled={inviteMutation.isPending}
                    {...emailField}
                  />
                </AppFormField>

                <div className="grid gap-4 sm:grid-cols-2">
                  <AppFormField
                    label="First name"
                    htmlFor="invite-first-name"
                    errors={[form.formState.errors.firstName]}
                  >
                    <Input
                      id="invite-first-name"
                      placeholder="First name"
                      autoComplete="given-name"
                      disabled={inviteMutation.isPending}
                      {...firstNameField}
                    />
                  </AppFormField>
                  <AppFormField
                    label="Last name"
                    htmlFor="invite-last-name"
                    errors={[form.formState.errors.lastName]}
                  >
                    <Input
                      id="invite-last-name"
                      placeholder="Last name"
                      autoComplete="family-name"
                      disabled={inviteMutation.isPending}
                      {...lastNameField}
                    />
                  </AppFormField>
                </div>

                {canInviteSuperusers ? (
                  <Controller
                    name="isSuperuser"
                    control={form.control}
                    render={({ field }) => (
                      <section className="rounded-md border bg-muted/30 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex min-w-0 gap-3">
                            <Shield className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                            <div className="space-y-1">
                              <Label
                                id="invite-superuser-label"
                                htmlFor="invite-superuser"
                                className="font-medium"
                              >
                                Superuser access
                              </Label>
                              <p className="text-sm text-muted-foreground">
                                Platform-wide administrative access outside role
                                scope.
                              </p>
                            </div>
                          </div>
                          <Switch
                            id="invite-superuser"
                            checked={Boolean(field.value)}
                            onCheckedChange={field.onChange}
                            disabled={inviteMutation.isPending}
                            aria-labelledby="invite-superuser-label"
                            aria-label="Invite as superuser"
                          />
                        </div>
                      </section>
                    )}
                  />
                ) : null}

                {entityHierarchyEnabled ? (
                  <section className="flex min-h-0 flex-1 flex-col rounded-xl border p-4">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">Entity scope</h3>
                      <AppInfoPopover
                        label="Explain invite entity scope"
                        title="Entity scope"
                      >
                        Choose an entity when the invited user should start with a scoped membership.
                        Leave it empty only if the account should be invited first and assigned
                        later.
                      </AppInfoPopover>
                    </div>

                    <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
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
                        <div className="flex min-h-0 flex-1 flex-col rounded-xl border bg-muted/30 p-4">
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
                          {!selectedEntity.isTopLevel ? (
                            <div className="mt-4 text-sm text-muted-foreground">
                              Parent: {selectedEntity.parentPathLabel}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-dashed p-4">
                          <p className="font-medium">No entity selected</p>
                        </div>
                      )}
                    </div>
                  </section>
                ) : null}
              </div>

              <section className="flex min-h-0 h-full flex-col overflow-hidden rounded-xl border bg-background">
                <div className="border-b px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">Roles</h3>
                      <AppInfoPopover
                        label="Explain invite roles"
                        title="Roles"
                      >
                        {entityHierarchyEnabled
                          ? 'Selected roles are applied through the membership created for the chosen entity.'
                          : 'Selected roles are assigned directly to the account.'}
                      </AppInfoPopover>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{roleIds.length} selected</Badge>
                      {roleIds.length > 0 ? (
                        <div className="flex items-center gap-2">
                          <Switch
                            id="invite-selected-roles-only"
                            checked={showSelectedRolesOnly}
                            onCheckedChange={setShowSelectedRolesOnly}
                            aria-label="Show selected roles only"
                          />
                          <Label
                            htmlFor="invite-selected-roles-only"
                            className="text-xs font-medium text-muted-foreground"
                          >
                            Selected only
                          </Label>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto bg-background">
                  {rolesRequireEntity && !selectedEntity ? (
                    <div className="px-4 py-6 text-sm text-muted-foreground">
                      Choose an entity to load roles.
                    </div>
                  ) : rolesPending ? (
                    <div className="px-4 py-6 text-sm text-muted-foreground">
                      Loading roles for this entity…
                    </div>
                  ) : rolesError ? (
                    <div className="px-4 py-6 text-sm text-destructive">
                      {getApiErrorMessage(
                        rolesError,
                        'The roles for the selected entity could not be loaded.'
                      )}
                    </div>
                  ) : visibleRoles.length > 0 ? (
                    <div className="divide-y">
                      {visibleRoles.map((role) => {
                        const checked = roleIds.includes(role.id)
                        const roleInputId = `invite-role-${role.id}`
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
                                aria-label={role.display_name}
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

                                {role.description ? (
                                  <p className="text-sm leading-5 text-muted-foreground">
                                    {role.description}
                                  </p>
                                ) : null}

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
                      {showSelectedRolesOnly
                        ? 'No selected roles match the current filter.'
                        : selectedEntity
                          ? 'No roles are available for the selected entity.'
                          : 'No roles are available.'}
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

            <DialogFooter className="mt-0 shrink-0 !mx-0 !mb-0 rounded-b-[inherit] px-6 py-4">
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
