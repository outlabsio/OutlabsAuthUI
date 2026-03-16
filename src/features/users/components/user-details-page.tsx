import { useEffect, useMemo, useState } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import {
  ArrowLeft,
  Building2,
  Clock3,
  KeyRound,
  Mail,
  Shield,
} from 'lucide-react'

import { AppPage } from '@/components/app/app-page'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
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
import { getAuthConfigQueryOptions } from '@/features/auth/api/auth.query-options'
import { useSessionQuery } from '@/features/auth/hooks/use-session-query'
import { getEntitiesQueryOptions } from '@/features/entities/api/entities.query-options'
import { buildEntityOptions } from '@/features/entities/utils/build-entity-options'
import { getUserMembershipsQueryOptions } from '@/features/memberships/api/memberships.query-options'
import { getRolesForEntityQueryOptions } from '@/features/roles/api/roles.query-options'
import {
  getRoleScopeSummary,
  formatRoleToken,
} from '@/features/roles/utils/role-display'
import type { Role } from '@/features/roles/types/roles.types'
import { DirectRoleAssignmentDialog } from '@/features/users/components/direct-role-assignment-dialog'
import { MembershipRoleDialog } from '@/features/users/components/membership-role-dialog'
import {
  getUserPermissionsQueryOptions,
  getUserQueryOptions,
  getUserRolesQueryOptions,
} from '@/features/users/api/users.query-options'
import { useUpdateUserMutation } from '@/features/users/hooks/use-update-user-mutation'
import { useUpdateUserStatusMutation } from '@/features/users/hooks/use-update-user-status-mutation'
import {
  type UpdateUserProfileFormValues,
  updateUserProfileSchema,
} from '@/features/users/schemas/update-user-profile.schema'
import {
  type UpdateUserStatusFormValues,
  updateUserStatusSchema,
} from '@/features/users/schemas/update-user-status.schema'
import type {
  User,
  UserPermissionSource,
  UserStatusUpdateValue,
  UserStatusValue,
} from '@/features/users/types/users.types'
import { getApiErrorMessage } from '@/lib/api/errors'
import { cn } from '@/lib/utils/cn'

type UserDetailsPageProps = {
  userId: string
  onBack: () => void
}

type DetailSectionProps = {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}

const statusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Banned', value: 'banned' },
] satisfies Array<{ label: string; value: UserStatusUpdateValue }>

function DetailSection({
  title,
  description,
  action,
  children,
  className,
}: DetailSectionProps) {
  return (
    <Card className={cn('gap-0 overflow-hidden border py-0 ring-0', className)}>
      <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </Card>
  )
}

function getUserDisplayName(user?: Pick<User, 'email' | 'first_name' | 'last_name'> | null) {
  if (!user) {
    return 'Unknown user'
  }

  const displayName = [user.first_name, user.last_name]
    .filter(Boolean)
    .join(' ')
    .trim()

  if (displayName) {
    return displayName
  }

  return user.email.split('@')[0] || 'Unknown user'
}

function getUserInitials(user?: Pick<User, 'email' | 'first_name' | 'last_name'> | null) {
  if (!user) {
    return 'U'
  }

  const initials = [user.first_name, user.last_name]
    .filter(Boolean)
    .map((value) => value?.charAt(0).toUpperCase())
    .join('')

  if (initials) {
    return initials.slice(0, 2)
  }

  return user.email.slice(0, 2).toUpperCase()
}

function formatDateTime(value?: string | null, fallback = 'Never') {
  if (!value) {
    return fallback
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatToken(value?: string | null, fallback = 'General') {
  if (!value) {
    return fallback
  }

  return value
    .split(/[_:-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getStatusVariant(status: UserStatusValue) {
  switch (status) {
    case 'active':
      return 'secondary'
    case 'suspended':
    case 'banned':
      return 'destructive'
    case 'invited':
    case 'deleted':
    default:
      return 'outline'
  }
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16)
}

function groupPermissionsByResource(permissionSources: UserPermissionSource[]) {
  const groups = new Map<string, UserPermissionSource[]>()

  for (const permissionSource of permissionSources) {
    const key = permissionSource.permission.resource ?? 'general'
    const existing = groups.get(key) ?? []
    existing.push(permissionSource)
    groups.set(key, existing)
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([resource, items]) => ({
      resource,
      items: items.sort((left, right) =>
        left.permission.display_name.localeCompare(right.permission.display_name)
      ),
    }))
}

export function UserDetailsPage({
  userId,
  onBack,
}: UserDetailsPageProps) {
  const sessionQuery = useSessionQuery()
  const authConfigQuery = useQuery(getAuthConfigQueryOptions())
  const entitiesQuery = useQuery(getEntitiesQueryOptions())
  const userQuery = useQuery(getUserQueryOptions(userId))
  const directRolesQuery = useQuery(getUserRolesQueryOptions(userId))
  const userPermissionsQuery = useQuery(getUserPermissionsQueryOptions(userId))
  const membershipsQuery = useQuery(getUserMembershipsQueryOptions(userId))
  const actorPermissionsQuery = useQuery({
    ...getUserPermissionsQueryOptions(sessionQuery.data?.id ?? ''),
    enabled: Boolean(sessionQuery.data?.id),
  })
  const updateUserMutation = useUpdateUserMutation()
  const updateUserStatusMutation = useUpdateUserStatusMutation()
  const [directRoleDialogOpen, setDirectRoleDialogOpen] = useState(false)
  const [membershipDialogState, setMembershipDialogState] = useState<{
    open: boolean
    entityId: string | null
    lockEntity: boolean
  }>({
    open: false,
    entityId: null,
    lockEntity: false,
  })
  const profileForm = useForm<UpdateUserProfileFormValues>({
    resolver: zodResolver(updateUserProfileSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
    },
  })
  const statusForm = useForm<UpdateUserStatusFormValues>({
    resolver: zodResolver(updateUserStatusSchema),
    defaultValues: {
      status: undefined,
      suspendedUntil: '',
      reason: '',
    },
  })

  const user = userQuery.data
  const entityOptions = useMemo(
    () => buildEntityOptions(entitiesQuery.data?.items ?? []),
    [entitiesQuery.data?.items]
  )
  const entityById = useMemo(
    () => new Map(entityOptions.map((entity) => [entity.id, entity])),
    [entityOptions]
  )
  const actorPermissionNames = useMemo(
    () =>
      new Set((actorPermissionsQuery.data ?? []).map((item) => item.permission.name)),
    [actorPermissionsQuery.data]
  )
  const pageError = userQuery.error ?? authConfigQuery.error
  const membershipRolesFeatureEnabled = authConfigQuery.data?.features.entity_hierarchy ?? false
  const directRolesFeatureEnabled = true
  const isActorSuperuser = sessionQuery.data?.is_superuser === true
  const canReadScopedRoleCatalog = actorPermissionsQuery.isSuccess
    ? isActorSuperuser || actorPermissionNames.has('role:read_tree')
    : membershipRolesFeatureEnabled
  const canAssignDirectRoles = actorPermissionsQuery.isSuccess
    ? isActorSuperuser ||
      (directRolesFeatureEnabled &&
        actorPermissionNames.has('user:update') &&
        actorPermissionNames.has('role:read'))
    : directRolesFeatureEnabled
  const canManageMembershipRoles = actorPermissionsQuery.isSuccess
    ? isActorSuperuser ||
      (membershipRolesFeatureEnabled &&
        (actorPermissionNames.has('membership:create') ||
          actorPermissionNames.has('membership:update')))
    : membershipRolesFeatureEnabled
  const membershipRoleQueries = useQueries({
    queries: (membershipsQuery.data ?? []).map((membership) => ({
      ...getRolesForEntityQueryOptions(membership.entity_id, { limit: 100 }),
      enabled: Boolean(membership.entity_id) && canReadScopedRoleCatalog,
    })),
  })
  const membershipRoleById = new Map<string, Role>()

  for (const role of directRolesQuery.data ?? []) {
    membershipRoleById.set(role.id, role)
  }

  for (const query of membershipRoleQueries) {
    for (const role of query.data?.items ?? []) {
      membershipRoleById.set(role.id, role)
    }
  }

  const groupedPermissions = useMemo(
    () => groupPermissionsByResource(userPermissionsQuery.data ?? []),
    [userPermissionsQuery.data]
  )
  const watchedStatus = statusForm.watch('status')
  const profileError = updateUserMutation.error
    ? getApiErrorMessage(updateUserMutation.error, 'Unable to update this user.')
    : null
  const statusError = updateUserStatusMutation.error
    ? getApiErrorMessage(updateUserStatusMutation.error, 'Unable to update account status.')
    : null

  useEffect(() => {
    if (!user) {
      return
    }

    profileForm.reset({
      firstName: user.first_name ?? '',
      lastName: user.last_name ?? '',
      email: user.email,
    })
    statusForm.reset({
      status:
        user.status === 'invited' || user.status === 'deleted'
          ? undefined
          : user.status,
      suspendedUntil: toDateTimeLocalValue(user.suspended_until),
      reason: '',
    })
  }, [profileForm, statusForm, user])

  if (userQuery.isPending) {
    return (
      <AppPage
        title="Loading user"
        action={
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft className="size-4" />
            Back to users
          </Button>
        }
      >
        <div className="flex min-h-[40svh] items-center justify-center text-sm text-muted-foreground">
          Loading user details…
        </div>
      </AppPage>
    )
  }

  if (!user || pageError) {
    return (
      <AppPage
        title="User not available"
        action={
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft className="size-4" />
            Back to users
          </Button>
        }
      >
        <div className="max-w-xl rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {getApiErrorMessage(pageError, 'The selected user could not be loaded.')}
        </div>
      </AppPage>
    )
  }

  return (
    <AppPage
      className="gap-5"
      title={getUserDisplayName(user)}
      description={user.email}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft className="size-4" />
            Back to users
          </Button>
        </div>
      }
    >
      <Card className="overflow-hidden border py-0 ring-0">
        <div className="flex flex-col gap-6 px-6 py-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <Avatar size="lg" className="size-14">
              <AvatarImage src={user.avatar_url ?? undefined} alt={getUserDisplayName(user)} />
              <AvatarFallback className="text-base font-medium">
                {getUserInitials(user)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={getStatusVariant(user.status)}>{formatToken(user.status)}</Badge>
                {user.email_verified ? <Badge variant="outline">Verified</Badge> : null}
                {user.is_superuser ? <Badge variant="outline">Superuser</Badge> : null}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-3.5" />
                  {user.email}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="size-3.5" />
                  {user.root_entity_name ?? 'No root entity'}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="size-3.5" />
                  Last login {formatDateTime(user.last_login, 'Never')}
                </span>
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
              <div className="text-[0.8rem] text-muted-foreground">Memberships</div>
              <div className="mt-1 text-lg font-semibold">
                {membershipsQuery.data?.length ?? 0}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
              <div className="text-[0.8rem] text-muted-foreground">Direct roles</div>
              <div className="mt-1 text-lg font-semibold">
                {directRolesQuery.data?.length ?? 0}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
              <div className="text-[0.8rem] text-muted-foreground">Permissions</div>
              <div className="mt-1 text-lg font-semibold">
                {userPermissionsQuery.data?.length ?? 0}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
              <div className="text-[0.8rem] text-muted-foreground">Created</div>
              <div className="mt-1 text-lg font-semibold">
                {formatDateTime(user.created_at, 'Unknown')}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <div className="space-y-6">
          <DetailSection
            title="Profile"
            description="Update the basic account information that appears across the workspace."
            action={
              <Button
                type="submit"
                size="sm"
                form="user-profile-form"
                disabled={updateUserMutation.isPending || !profileForm.formState.isDirty}
              >
                {updateUserMutation.isPending ? 'Saving…' : 'Save profile'}
              </Button>
            }
          >
            <form
              id="user-profile-form"
              className="space-y-4"
              onSubmit={profileForm.handleSubmit(async (values) => {
                try {
                  await updateUserMutation.mutateAsync({
                    userId,
                    email: values.email.trim(),
                    first_name: values.firstName.trim() || undefined,
                    last_name: values.lastName.trim() || undefined,
                  })
                } catch {
                  return
                }
              })}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="user-detail-first-name">First name</Label>
                  <Input
                    id="user-detail-first-name"
                    placeholder="First name"
                    disabled={updateUserMutation.isPending}
                    {...profileForm.register('firstName')}
                  />
                  <FieldError errors={[profileForm.formState.errors.firstName]} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user-detail-last-name">Last name</Label>
                  <Input
                    id="user-detail-last-name"
                    placeholder="Last name"
                    disabled={updateUserMutation.isPending}
                    {...profileForm.register('lastName')}
                  />
                  <FieldError errors={[profileForm.formState.errors.lastName]} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-detail-email">Email</Label>
                <Input
                  id="user-detail-email"
                  type="email"
                  placeholder="person@example.com"
                  disabled={updateUserMutation.isPending}
                  {...profileForm.register('email')}
                />
                <FieldError errors={[profileForm.formState.errors.email]} />
              </div>
              {profileError ? (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {profileError}
                </div>
              ) : null}
            </form>
          </DetailSection>

          <DetailSection
            title="Account status"
            description="Change account access now, or suspend access until a specific date."
            action={
              <Button
                type="submit"
                size="sm"
                form="user-status-form"
                disabled={
                  updateUserStatusMutation.isPending || !statusForm.formState.isDirty
                }
              >
                {updateUserStatusMutation.isPending ? 'Updating…' : 'Update status'}
              </Button>
            }
          >
            <form
              id="user-status-form"
              className="space-y-4"
              onSubmit={statusForm.handleSubmit(async (values) => {
                if (!values.status) {
                  return
                }

                try {
                  await updateUserStatusMutation.mutateAsync({
                    userId,
                    status: values.status,
                    suspended_until:
                      values.status === 'suspended' && values.suspendedUntil
                        ? new Date(values.suspendedUntil).toISOString()
                        : undefined,
                    reason: values.reason?.trim() || undefined,
                  })
                } catch {
                  return
                }
              })}
            >
              <div className="space-y-2">
                <Label htmlFor="user-detail-status">Next status</Label>
                <Controller
                  control={statusForm.control}
                  name="status"
                  render={({ field }) => (
                    <Select
                      items={statusOptions}
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value ?? undefined)
                      }}
                    >
                      <SelectTrigger
                        id="user-detail-status"
                        className="w-full"
                        aria-label="Change account status"
                      >
                        <SelectValue placeholder="Select a new status" />
                      </SelectTrigger>
                      <SelectContent align="start" alignItemWithTrigger={false}>
                        <SelectGroup>
                          {statusOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[statusForm.formState.errors.status]} />
              </div>
              {watchedStatus === 'suspended' ? (
                <div className="space-y-2">
                  <Label htmlFor="user-detail-suspended-until">Suspend until</Label>
                  <Input
                    id="user-detail-suspended-until"
                    type="datetime-local"
                    disabled={updateUserStatusMutation.isPending}
                    {...statusForm.register('suspendedUntil')}
                  />
                  <FieldError errors={[statusForm.formState.errors.suspendedUntil]} />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="user-detail-status-reason">Reason</Label>
                <Textarea
                  id="user-detail-status-reason"
                  placeholder="Optional note for the audit trail"
                  disabled={updateUserStatusMutation.isPending}
                  {...statusForm.register('reason')}
                />
                <FieldError errors={[statusForm.formState.errors.reason]} />
              </div>
              {statusError ? (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {statusError}
                </div>
              ) : null}
            </form>
          </DetailSection>

          <DetailSection
            title="Activity and lifecycle"
            description="Operational timestamps and account lifecycle signals from the auth system."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border bg-muted/30 px-4 py-3">
                <div className="text-sm font-medium">Created</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {formatDateTime(user.created_at, 'Unknown')}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/30 px-4 py-3">
                <div className="text-sm font-medium">Updated</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {formatDateTime(user.updated_at, 'Unknown')}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/30 px-4 py-3">
                <div className="text-sm font-medium">Last login</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {formatDateTime(user.last_login, 'No sign-in yet')}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/30 px-4 py-3">
                <div className="text-sm font-medium">Last activity</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {formatDateTime(user.last_activity, 'No recent activity')}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/30 px-4 py-3">
                <div className="text-sm font-medium">Suspended until</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {formatDateTime(user.suspended_until, 'Not suspended')}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/30 px-4 py-3">
                <div className="text-sm font-medium">Deleted at</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {formatDateTime(user.deleted_at, 'Active account')}
                </div>
              </div>
            </div>
          </DetailSection>

          <DetailSection
            title="Security"
            description="Password reset and credential recovery live here in the next pass."
            action={
              <Button type="button" size="sm" variant="outline" disabled>
                Reset password
              </Button>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border bg-muted/40 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <KeyRound className="size-4 text-muted-foreground" />
                  Last password change
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {formatDateTime(user.last_password_change, 'No password has been set yet')}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/40 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Shield className="size-4 text-muted-foreground" />
                  Locked until
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {formatDateTime(user.locked_until, 'No active lock')}
                </p>
              </div>
            </div>
          </DetailSection>
        </div>

        <div className="space-y-6">
          <DetailSection
            title="Entity memberships"
            description="Scoped roles live on memberships. Add a new membership or update the role set on an existing one."
            action={
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canManageMembershipRoles}
                onClick={() => {
                  setMembershipDialogState({
                    open: true,
                    entityId: null,
                    lockEntity: false,
                  })
                }}
              >
                Add membership roles
              </Button>
            }
          >
            {membershipsQuery.isError ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-6 text-sm text-destructive">
                {getApiErrorMessage(
                  membershipsQuery.error,
                  'The user memberships could not be loaded.'
                )}
              </div>
            ) : membershipsQuery.data && membershipsQuery.data.length > 0 ? (
              <div className="space-y-3">
                {membershipsQuery.data.map((membership) => {
                  const entity = entityById.get(membership.entity_id)
                  const membershipRoles = membership.role_ids
                    .map((roleId) => membershipRoleById.get(roleId))
                    .filter((role): role is Role => Boolean(role))

                  return (
                    <div
                      key={membership.id}
                      className="rounded-lg border bg-muted/30 px-4 py-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="font-medium">{entity?.title ?? membership.entity_id}</div>
                          <div className="text-sm text-muted-foreground">
                            {entity?.pathLabel ?? 'Entity path unavailable'}
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={!canManageMembershipRoles}
                          onClick={() => {
                            setMembershipDialogState({
                              open: true,
                              entityId: membership.entity_id,
                              lockEntity: true,
                            })
                          }}
                        >
                          Manage roles
                        </Button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {membershipRoles.length > 0 ? (
                          membershipRoles.map((role) => (
                            <Badge key={role.id} variant="outline">
                              {role.display_name}
                            </Badge>
                          ))
                        ) : membership.role_ids.length > 0 ? (
                          membership.role_ids.map((roleId) => (
                            <Badge key={roleId} variant="outline">
                              {roleId}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            No scoped roles assigned yet.
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
                This user does not currently belong to any entity memberships.
              </div>
            )}
          </DetailSection>

          <DetailSection
            title="Direct account roles"
            description="These roles are assigned straight to the account. Scoped entity roles are managed through memberships above."
            action={
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canAssignDirectRoles}
                onClick={() => {
                  setDirectRoleDialogOpen(true)
                }}
              >
                Assign direct role
              </Button>
            }
          >
            {directRolesQuery.isError ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-6 text-sm text-destructive">
                {getApiErrorMessage(
                  directRolesQuery.error,
                  'The direct role assignments could not be loaded.'
                )}
              </div>
            ) : directRolesQuery.data && directRolesQuery.data.length > 0 ? (
              <div className="space-y-3">
                {directRolesQuery.data.map((role) => (
                  <div key={role.id} className="rounded-lg border bg-muted/30 px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="font-medium">{role.display_name}</div>
                        <div className="text-sm text-muted-foreground">
                          {role.description || role.name}
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        {role.is_global ? <Badge variant="outline">Global</Badge> : null}
                        <Badge variant="outline">{role.permissions.length} permissions</Badge>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1">
                        {getRoleScopeSummary(role)}
                      </span>
                      {role.assignable_at_types.length > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1">
                          Assignable at{' '}
                          {role.assignable_at_types
                            .map((type) => formatRoleToken(type))
                            .join(', ')}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
                No direct roles are currently assigned to this account.
              </div>
            )}
          </DetailSection>
        </div>
      </div>

      <DetailSection
        title="Permissions"
        description="Effective permissions resolved from the current role set."
      >
        {userPermissionsQuery.isError ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-6 text-sm text-destructive">
            {getApiErrorMessage(
              userPermissionsQuery.error,
              'The effective permission set could not be loaded.'
            )}
          </div>
        ) : groupedPermissions.length > 0 ? (
          <div className="space-y-4">
            {groupedPermissions.map((group) => (
              <div key={group.resource} className="rounded-lg border bg-muted/30 px-4 py-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="font-medium">{formatToken(group.resource)}</div>
                  <Badge variant="outline">{group.items.length}</Badge>
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((item) => (
                    <div
                      key={item.permission.id}
                      className="rounded-md border bg-background/80 px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium">
                            {item.permission.display_name}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {item.permission.name}
                          </div>
                        </div>
                        <Badge variant="outline">
                          {formatToken(item.permission.action, 'Access')}
                        </Badge>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        Via {item.source_name ?? formatToken(item.source)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
            No effective permissions are currently resolved for this user.
          </div>
        )}
      </DetailSection>

      <DirectRoleAssignmentDialog
        open={directRoleDialogOpen}
        onOpenChange={setDirectRoleDialogOpen}
        userId={userId}
        assignedRoles={directRolesQuery.data ?? []}
        canAssignDirectRoles={canAssignDirectRoles}
      />

      <MembershipRoleDialog
        open={membershipDialogState.open}
        onOpenChange={(nextOpen) => {
          setMembershipDialogState((currentState) => ({
            ...currentState,
            open: nextOpen,
          }))
        }}
        userId={userId}
        entities={entitiesQuery.data?.items ?? []}
        memberships={membershipsQuery.data ?? []}
        initialEntityId={membershipDialogState.entityId}
        lockEntity={membershipDialogState.lockEntity}
        canManageMembershipRoles={canManageMembershipRoles}
      />
    </AppPage>
  )
}
