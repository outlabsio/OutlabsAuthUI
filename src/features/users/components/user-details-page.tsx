import { useEffect, useMemo, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import {
  ArrowLeft,
  Building2,
  Clock3,
  KeyRound,
  Mail,
  Shield,
} from 'lucide-react';

import { AppDateTimePicker } from '@/components/app/app-date-time-picker';
import { AppInfoPopover } from '@/components/app/app-info-popover';
import { AppPage } from '@/components/app/app-page';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { getAuthConfigQueryOptions } from '@/features/auth/api/auth.query-options';
import { useSessionQuery } from '@/features/auth/hooks/use-session-query';
import { getEntitiesQueryOptions } from '@/features/entities/api/entities.query-options';
import { buildEntityOptions } from '@/features/entities/utils/build-entity-options';
import { getUserMembershipsQueryOptions } from '@/features/memberships/api/memberships.query-options';
import { useUpdateMembershipMutation } from '@/features/memberships/hooks/use-update-membership-mutation';
import {
  formatMembershipToken,
  getMembershipStatusVariant,
} from '@/features/memberships/utils/membership-display';
import { getRolesForEntityQueryOptions } from '@/features/roles/api/roles.query-options';
import {
  getRoleScopeSummary,
  formatRoleToken,
} from '@/features/roles/utils/role-display';
import type { Role } from '@/features/roles/types/roles.types';
import { DeleteUserDialog } from '@/features/users/components/delete-user-dialog';
import { DirectRoleAssignmentDialog } from '@/features/users/components/direct-role-assignment-dialog';
import { MembershipAccessDialog } from '@/features/users/components/membership-access-dialog';
import { ResetUserPasswordDialog } from '@/features/users/components/reset-user-password-dialog';
import {
  getUserAuditEventsQueryOptions,
  getUserMembershipHistoryQueryOptions,
  getUserPermissionsQueryOptions,
  getUserQueryOptions,
  getUserRoleMembershipsQueryOptions,
} from '@/features/users/api/users.query-options';
import { useRemoveRoleFromUserMutation } from '@/features/users/hooks/use-remove-role-from-user-mutation';
import { useResendInviteMutation } from '@/features/users/hooks/use-resend-invite-mutation';
import { useRestoreUserMutation } from '@/features/users/hooks/use-restore-user-mutation';
import { useUpdateUserMutation } from '@/features/users/hooks/use-update-user-mutation';
import { useUpdateUserStatusMutation } from '@/features/users/hooks/use-update-user-status-mutation';
import {
  type UpdateUserProfileFormValues,
  updateUserProfileSchema,
} from '@/features/users/schemas/update-user-profile.schema';
import {
  type UpdateUserStatusFormValues,
  updateUserStatusSchema,
} from '@/features/users/schemas/update-user-status.schema';
import type {
  User,
  UserAuditEvent,
  UserDetailsTab,
  UserMembershipHistoryEvent,
  UserPermissionSource,
  UserStatusUpdateValue,
  UserStatusValue,
} from '@/features/users/types/users.types';
import { getApiErrorMessage } from '@/lib/api/errors';
import { cn } from '@/lib/utils/cn';

type UserDetailsPageProps = {
  userId: string;
  initialTab?: UserDetailsTab;
  backLabel?: string;
  onBack: () => void;
  onDeleted: () => void;
};

type DetailSectionProps = {
  title: string;
  description?: string;
  info?: {
    label: string;
    title: string;
    content: React.ReactNode;
  };
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

type SectionPaginationActionProps = {
  itemLabel: string;
  total: number;
  page: number;
  pages: number;
  isPending: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

const statusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Banned', value: 'banned' },
] satisfies Array<{ label: string; value: UserStatusUpdateValue }>;

function DetailSection({
  title,
  description,
  info,
  action,
  children,
  className,
}: DetailSectionProps) {
  return (
    <Card className={cn('gap-0 overflow-hidden border py-0 ring-0', className)}>
      <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {info ? (
              <AppInfoPopover label={info.label} title={info.title}>
                {info.content}
              </AppInfoPopover>
            ) : null}
          </div>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </Card>
  );
}

function SectionPaginationAction({
  itemLabel,
  total,
  page,
  pages,
  isPending,
  onPrevious,
  onNext,
}: SectionPaginationActionProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="text-xs text-muted-foreground">
        {total} {itemLabel}
        {pages > 0 ? ` | Page ${page} of ${pages}` : ''}
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onPrevious}
        disabled={isPending || page <= 1}
      >
        Previous
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onNext}
        disabled={isPending || page >= pages}
      >
        Next
      </Button>
    </div>
  );
}

function getUserDisplayName(
  user?: Pick<User, 'email' | 'first_name' | 'last_name'> | null,
) {
  if (!user) {
    return 'Unknown user';
  }

  const displayName = [user.first_name, user.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  if (displayName) {
    return displayName;
  }

  return user.email.split('@')[0] || 'Unknown user';
}

function getUserInitials(
  user?: Pick<User, 'email' | 'first_name' | 'last_name'> | null,
) {
  if (!user) {
    return 'U';
  }

  const initials = [user.first_name, user.last_name]
    .filter(Boolean)
    .map((value) => value?.charAt(0).toUpperCase())
    .join('');

  if (initials) {
    return initials.slice(0, 2);
  }

  return user.email.slice(0, 2).toUpperCase();
}

function formatDateTime(value?: string | null, fallback = 'Never') {
  if (!value) {
    return fallback;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatToken(value?: string | null, fallback = 'General') {
  if (!value) {
    return fallback;
  }

  return value
    .split(/[_:-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getStatusVariant(status: UserStatusValue) {
  switch (status) {
    case 'active':
      return 'secondary';
    case 'suspended':
    case 'banned':
      return 'destructive';
    case 'invited':
    case 'deleted':
    default:
      return 'outline';
  }
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getStringValue(record: unknown, key: string) {
  const resolvedRecord = asRecord(record);
  const value = resolvedRecord?.[key];

  return typeof value === 'string' && value.trim() ? value : null;
}

function getStringArrayValue(record: unknown, key: string) {
  const resolvedRecord = asRecord(record);
  const value = resolvedRecord?.[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function getAuditEventSummary(event: UserAuditEvent) {
  const beforeStatus = getStringValue(event.before, 'status');
  const afterStatus = getStringValue(event.after, 'status');
  const entityDisplayName =
    getStringValue(event.metadata, 'entity_display_name') ??
    getStringValue(event.metadata, 'entity_name');
  const changedFields = getStringArrayValue(event.metadata, 'changed_fields');

  if (beforeStatus && afterStatus && beforeStatus !== afterStatus) {
    return `${formatToken(beforeStatus)} -> ${formatToken(afterStatus)}`;
  }

  if (entityDisplayName) {
    return entityDisplayName;
  }

  if (changedFields.length > 0) {
    return `Changed ${changedFields.map((field) => formatToken(field)).join(', ')}`;
  }

  if (event.reason) {
    return event.reason;
  }

  return formatToken(event.event_type.split('.').at(-1) ?? event.event_type);
}

function getAuditEventBadgeVariant(event: UserAuditEvent) {
  const afterStatus = getStringValue(event.after, 'status');

  switch (afterStatus) {
    case 'active':
      return 'secondary';
    case 'suspended':
    case 'banned':
    case 'deleted':
    case 'revoked':
      return 'destructive';
    default:
      return 'outline';
  }
}

function getMembershipHistorySummary(event: UserMembershipHistoryEvent) {
  if (event.previous_status && event.previous_status !== event.status) {
    return `${formatMembershipToken(event.previous_status)} -> ${formatMembershipToken(event.status)}`;
  }

  if (event.reason) {
    return event.reason;
  }

  if (event.role_names.length > 0) {
    return event.role_names.join(', ');
  }

  return formatMembershipToken(event.status);
}

function groupPermissionsByResource(permissionSources: UserPermissionSource[]) {
  const groups = new Map<string, UserPermissionSource[]>();

  for (const permissionSource of permissionSources) {
    const key = permissionSource.permission.resource ?? 'general';
    const existing = groups.get(key) ?? [];
    existing.push(permissionSource);
    groups.set(key, existing);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([resource, items]) => ({
      resource,
      items: items.sort((left, right) =>
        left.permission.display_name.localeCompare(
          right.permission.display_name,
        ),
      ),
    }));
}

function hasAnyPermission(permissionNames: Set<string>, candidates: string[]) {
  return candidates.some((candidate) => permissionNames.has(candidate));
}

export function UserDetailsPage({
  userId,
  initialTab,
  backLabel = 'Back to users',
  onBack,
  onDeleted,
}: UserDetailsPageProps) {
  const [activeDetailsTab, setActiveDetailsTab] =
    useState<UserDetailsTab>(initialTab ?? 'details');
  const [auditEventsPage, setAuditEventsPage] = useState(1);
  const [membershipHistoryPage, setMembershipHistoryPage] = useState(1);
  const sessionQuery = useSessionQuery();
  const authConfigQuery = useQuery(getAuthConfigQueryOptions());
  const entitiesQuery = useQuery(getEntitiesQueryOptions());
  const userQuery = useQuery(getUserQueryOptions(userId));
  const auditEventsQuery = useQuery(
    getUserAuditEventsQueryOptions(userId, {
      page: auditEventsPage,
      limit: 6,
    }),
  );
  const membershipHistoryQuery = useQuery(
    getUserMembershipHistoryQueryOptions(userId, {
      page: membershipHistoryPage,
      limit: 6,
    }),
  );
  const directRoleMembershipsQuery = useQuery(
    getUserRoleMembershipsQueryOptions(userId, { includeInactive: true }),
  );
  const userPermissionsQuery = useQuery(getUserPermissionsQueryOptions(userId));
  const membershipsQuery = useQuery(
    getUserMembershipsQueryOptions(userId, { includeInactive: true }),
  );
  const actorPermissionsQuery = useQuery({
    ...getUserPermissionsQueryOptions(sessionQuery.data?.id ?? ''),
    enabled: Boolean(sessionQuery.data?.id),
  });
  const updateUserMutation = useUpdateUserMutation();
  const updateUserStatusMutation = useUpdateUserStatusMutation();
  const updateMembershipMutation = useUpdateMembershipMutation();
  const resendInviteMutation = useResendInviteMutation();
  const restoreUserMutation = useRestoreUserMutation();
  const removeRoleMutation = useRemoveRoleFromUserMutation();
  const [directRoleDialogOpen, setDirectRoleDialogOpen] = useState(false);
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [deleteUserDialogOpen, setDeleteUserDialogOpen] = useState(false);
  const [confirmingDirectRoleId, setConfirmingDirectRoleId] = useState<
    string | null
  >(null);
  const [membershipAccessDialogState, setMembershipAccessDialogState] =
    useState<{
      open: boolean;
      entityId: string | null;
      lockEntity: boolean;
    }>({
      open: false,
      entityId: null,
      lockEntity: false,
    });
  const profileForm = useForm<UpdateUserProfileFormValues>({
    resolver: zodResolver(updateUserProfileSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
    },
  });
  const statusForm = useForm<UpdateUserStatusFormValues>({
    resolver: zodResolver(updateUserStatusSchema),
    defaultValues: {
      status: undefined,
      suspendedUntil: '',
      reason: '',
    },
  });

  const user = userQuery.data;
  const entityOptions = useMemo(
    () => buildEntityOptions(entitiesQuery.data?.items ?? []),
    [entitiesQuery.data?.items],
  );
  const entityById = useMemo(
    () => new Map(entityOptions.map((entity) => [entity.id, entity])),
    [entityOptions],
  );
  const actorPermissionNames = useMemo(
    () =>
      new Set(
        (actorPermissionsQuery.data ?? []).map((item) => item.permission.name),
      ),
    [actorPermissionsQuery.data],
  );
  const pageError = userQuery.error ?? authConfigQuery.error;
  const membershipRolesFeatureEnabled =
    authConfigQuery.data?.features.entity_hierarchy ?? false;
  const userStatusFeatureEnabled =
    authConfigQuery.data?.features.user_status ?? true;
  const activityTrackingFeatureEnabled =
    authConfigQuery.data?.features.activity_tracking ?? true;
  const directRolesFeatureEnabled = true;
  const isActorSuperuser = sessionQuery.data?.is_superuser === true;
  const canReadScopedRoleCatalog = actorPermissionsQuery.isSuccess
    ? isActorSuperuser ||
      hasAnyPermission(actorPermissionNames, ['role:read', 'role:read_tree'])
    : isActorSuperuser;
  const canAssignDirectRoles = actorPermissionsQuery.isSuccess
    ? isActorSuperuser ||
      (directRolesFeatureEnabled &&
        actorPermissionNames.has('user:update') &&
        hasAnyPermission(actorPermissionNames, ['role:read', 'role:read_tree']))
    : isActorSuperuser && directRolesFeatureEnabled;
  const canUpdateUsers = actorPermissionsQuery.isSuccess
    ? isActorSuperuser || actorPermissionNames.has('user:update')
    : isActorSuperuser;
  const canDeleteUsers = actorPermissionsQuery.isSuccess
    ? isActorSuperuser || actorPermissionNames.has('user:delete')
    : isActorSuperuser;
  const canRemoveDirectRoles = canUpdateUsers;
  const canManageMembershipAccess = actorPermissionsQuery.isSuccess
    ? isActorSuperuser ||
      (membershipRolesFeatureEnabled &&
        (hasAnyPermission(actorPermissionNames, [
          'membership:create',
          'membership:create_tree',
        ]) ||
          hasAnyPermission(actorPermissionNames, [
            'membership:update',
            'membership:update_tree',
          ])))
    : isActorSuperuser && membershipRolesFeatureEnabled;
  const canRemoveMemberships = actorPermissionsQuery.isSuccess
    ? isActorSuperuser ||
      (membershipRolesFeatureEnabled &&
        hasAnyPermission(actorPermissionNames, [
          'membership:delete',
          'membership:delete_tree',
        ]))
    : isActorSuperuser && membershipRolesFeatureEnabled;
  const membershipRoleQueries = useQueries({
    queries: (membershipsQuery.data ?? []).map((membership) => ({
      ...getRolesForEntityQueryOptions(membership.entity_id, { limit: 100 }),
      enabled: Boolean(membership.entity_id) && canReadScopedRoleCatalog,
    })),
  });
  const membershipRoleById = new Map<string, Role>();

  for (const membership of directRoleMembershipsQuery.data ?? []) {
    membershipRoleById.set(membership.role.id, membership.role);
  }

  for (const query of membershipRoleQueries) {
    for (const role of query.data?.items ?? []) {
      membershipRoleById.set(role.id, role);
    }
  }

  const groupedPermissions = useMemo(
    () => groupPermissionsByResource(userPermissionsQuery.data ?? []),
    [userPermissionsQuery.data],
  );
  const canResetPassword = canUpdateUsers && user?.status !== 'deleted';
  const canResendInvite =
    (authConfigQuery.data?.features.invitations ?? false) &&
    user?.status === 'invited' &&
    canUpdateUsers;
  const canRestoreUser = canUpdateUsers && user?.status === 'deleted';
  const canDeleteThisUser =
    canDeleteUsers &&
    sessionQuery.data?.id !== userId &&
    user?.status !== 'deleted';
  const watchedStatus = statusForm.watch('status');
  const profileError = updateUserMutation.error
    ? getApiErrorMessage(
        updateUserMutation.error,
        'Unable to update this user.',
      )
    : null;
  const statusError = updateUserStatusMutation.error
    ? getApiErrorMessage(
        updateUserStatusMutation.error,
        'Unable to update account status.',
      )
    : null;
  const resendInviteError = resendInviteMutation.error
    ? getApiErrorMessage(
        resendInviteMutation.error,
        'Unable to resend the invitation.',
      )
    : null;
  const restoreUserError = restoreUserMutation.error
    ? getApiErrorMessage(
        restoreUserMutation.error,
        'Unable to restore this user.',
      )
    : null;
  const removeRoleError = removeRoleMutation.error
    ? getApiErrorMessage(
        removeRoleMutation.error,
        'Unable to remove the direct role.',
      )
    : null;

  useEffect(() => {
    setActiveDetailsTab(initialTab ?? 'details');
    setAuditEventsPage(1);
    setMembershipHistoryPage(1);
  }, [initialTab, userId]);

  useEffect(() => {
    if (!user) {
      return;
    }

    profileForm.reset({
      firstName: user.first_name ?? '',
      lastName: user.last_name ?? '',
      email: user.email,
    });
    statusForm.reset({
      status:
        user.status === 'invited' || user.status === 'deleted'
          ? undefined
          : user.status,
      suspendedUntil: toDateTimeLocalValue(user.suspended_until),
      reason: '',
    });
  }, [profileForm, statusForm, user]);

  if (userQuery.isPending) {
    return (
      <AppPage
        title="Loading user"
        shellAction={
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft className="size-4" />
            {backLabel}
          </Button>
        }
      >
        <div className="flex min-h-[40svh] items-center justify-center text-sm text-muted-foreground">
          Loading user details…
        </div>
      </AppPage>
    );
  }

  if (!user || pageError) {
    return (
      <AppPage
        title="User not available"
        shellAction={
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft className="size-4" />
            {backLabel}
          </Button>
        }
      >
        <div className="max-w-xl rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {getApiErrorMessage(
            pageError,
            'The selected user could not be loaded.',
          )}
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage
      className="gap-5"
      title={getUserDisplayName(user)}
      shellAction={
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4" />
          {backLabel}
        </Button>
      }
    >
      <Card className="overflow-hidden border py-0 ring-0">
        <div className="flex flex-col gap-6 px-6 py-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <Avatar size="lg" className="size-14">
              <AvatarImage
                src={user.avatar_url ?? undefined}
                alt={getUserDisplayName(user)}
              />
              <AvatarFallback className="text-base font-medium">
                {getUserInitials(user)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={getStatusVariant(user.status)}>
                  {formatToken(user.status)}
                </Badge>
                {user.email_verified ? (
                  <Badge variant="outline">Verified</Badge>
                ) : null}
                {user.is_superuser ? (
                  <Badge variant="outline">Superuser</Badge>
                ) : null}
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
              <div className="text-[0.8rem] text-muted-foreground">
                Memberships
              </div>
              <div className="mt-1 text-lg font-semibold">
                {membershipsQuery.data?.length ?? 0}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
              <div className="text-[0.8rem] text-muted-foreground">
                Direct roles
              </div>
              <div className="mt-1 text-lg font-semibold">
                {directRoleMembershipsQuery.data?.filter(
                  (membership) => membership.status === 'active',
                ).length ?? 0}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
              <div className="text-[0.8rem] text-muted-foreground">
                Permissions
              </div>
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

      <Tabs
        value={activeDetailsTab}
        onValueChange={(value) => {
          if (
            value === 'details' ||
            value === 'access' ||
            value === 'history'
          ) {
            setActiveDetailsTab(value);
          }
        }}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="details">Main details</TabsTrigger>
          <TabsTrigger value="access">Memberships and access</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="pt-1">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
              <div className="space-y-6">
                <DetailSection
                  title="Profile"
                  info={{
                    label: 'Explain profile section',
                    title: 'Profile',
                    content:
                      'These fields describe the person or service account itself. They do not explain scoped access; roles and memberships do that elsewhere on the page.',
                  }}
                  action={
                    <Button
                      type="submit"
                      size="sm"
                      form="user-profile-form"
                      disabled={
                        !canUpdateUsers ||
                        updateUserMutation.isPending ||
                        !profileForm.formState.isDirty
                      }
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
                        });
                      } catch {
                        return;
                      }
                    })}
                  >
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="user-detail-first-name">First name</Label>
                        <Input
                          id="user-detail-first-name"
                          placeholder="First name"
                          disabled={!canUpdateUsers || updateUserMutation.isPending}
                          {...profileForm.register('firstName')}
                        />
                        <FieldError
                          errors={[profileForm.formState.errors.firstName]}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="user-detail-last-name">Last name</Label>
                        <Input
                          id="user-detail-last-name"
                          placeholder="Last name"
                          disabled={!canUpdateUsers || updateUserMutation.isPending}
                          {...profileForm.register('lastName')}
                        />
                        <FieldError
                          errors={[profileForm.formState.errors.lastName]}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="user-detail-email">Email</Label>
                      <Input
                        id="user-detail-email"
                        type="email"
                        placeholder="person@example.com"
                        disabled={!canUpdateUsers || updateUserMutation.isPending}
                        {...profileForm.register('email')}
                      />
                      <FieldError errors={[profileForm.formState.errors.email]} />
                    </div>
                    {!canUpdateUsers ? (
                      <div className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                        Your account can view this profile, but it cannot update user
                        details.
                      </div>
                    ) : null}
                    {profileError ? (
                      <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        {profileError}
                      </div>
                    ) : null}
                  </form>
                </DetailSection>

                {userStatusFeatureEnabled ? (
                  <DetailSection
                    title="Account status"
                    info={{
                      label: 'Explain account status section',
                      title: 'Account status',
                      content:
                        'Status controls whether the account can be used right now. Suspension windows and invite resend actions also live here because they affect account availability.',
                    }}
                    action={
                      <div className="flex flex-wrap items-center gap-2">
                        {canResendInvite ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={resendInviteMutation.isPending}
                            onClick={() => {
                              void resendInviteMutation.mutateAsync(userId);
                            }}
                          >
                            {resendInviteMutation.isPending
                              ? 'Sending…'
                              : 'Resend invite'}
                          </Button>
                        ) : null}
                        {canRestoreUser ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={restoreUserMutation.isPending}
                            onClick={() => {
                              void restoreUserMutation.mutateAsync({ userId });
                            }}
                          >
                            {restoreUserMutation.isPending
                              ? 'Restoring…'
                              : 'Restore user'}
                          </Button>
                        ) : (
                          <Button
                            type="submit"
                            size="sm"
                            form="user-status-form"
                            disabled={
                              !canUpdateUsers ||
                              user.status === 'deleted' ||
                              updateUserStatusMutation.isPending ||
                              !statusForm.formState.isDirty
                            }
                          >
                            {updateUserStatusMutation.isPending
                              ? 'Updating…'
                              : 'Update status'}
                          </Button>
                        )}
                      </div>
                    }
                  >
                    <form
                      id="user-status-form"
                      className="space-y-4"
                      onSubmit={statusForm.handleSubmit(async (values) => {
                        if (user.status === 'deleted') {
                          return;
                        }

                        if (!values.status) {
                          return;
                        }

                        try {
                          await updateUserStatusMutation.mutateAsync({
                            userId,
                            status: values.status,
                            suspended_until:
                              values.status === 'suspended' &&
                              values.suspendedUntil
                                ? new Date(values.suspendedUntil).toISOString()
                                : undefined,
                            reason: values.reason?.trim() || undefined,
                          });
                        } catch {
                          return;
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
                              value={field.value ?? null}
                              onValueChange={(value) => {
                                field.onChange(value ?? undefined);
                              }}
                              disabled={
                                !canUpdateUsers || user.status === 'deleted'
                              }
                            >
                              <SelectTrigger
                                id="user-detail-status"
                                className="w-full"
                                aria-label="Change account status"
                              >
                                <SelectValue placeholder="Select a new status" />
                              </SelectTrigger>
                              <SelectContent
                                align="start"
                                alignItemWithTrigger={false}
                              >
                                <SelectGroup>
                                  {statusOptions.map((option) => (
                                    <SelectItem
                                      key={option.value}
                                      value={option.value}
                                    >
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
                          <Label htmlFor="user-detail-suspended-until">
                            Suspend until
                          </Label>
                          <Controller
                            control={statusForm.control}
                            name="suspendedUntil"
                            render={({ field }) => (
                              <AppDateTimePicker
                                id="user-detail-suspended-until"
                                value={field.value ?? ''}
                                onChange={field.onChange}
                                disabled={
                                  !canUpdateUsers ||
                                  user.status === 'deleted' ||
                                  updateUserStatusMutation.isPending
                                }
                                placeholder="Pick a suspension end"
                              />
                            )}
                          />
                          <FieldError
                            errors={[statusForm.formState.errors.suspendedUntil]}
                          />
                        </div>
                      ) : null}
                      <div className="space-y-2">
                        <Label htmlFor="user-detail-status-reason">Reason</Label>
                        <Textarea
                          id="user-detail-status-reason"
                          placeholder="Optional note for the audit trail"
                          disabled={
                            !canUpdateUsers ||
                            user.status === 'deleted' ||
                            updateUserStatusMutation.isPending
                          }
                          {...statusForm.register('reason')}
                        />
                        <FieldError errors={[statusForm.formState.errors.reason]} />
                      </div>
                      {user.status === 'deleted' ? (
                        <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                          Deleted users cannot change status here. Restore is
                          identity-only, so memberships, direct roles, refresh
                          tokens, and API keys stay revoked until you grant access
                          again.
                        </div>
                      ) : null}
                      {!canUpdateUsers ? (
                        <div className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                          Your account can view this status, but it cannot change
                          account access.
                        </div>
                      ) : null}
                      {statusError ? (
                        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                          {statusError}
                        </div>
                      ) : null}
                      {resendInviteError ? (
                        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                          {resendInviteError}
                        </div>
                      ) : null}
                      {restoreUserError ? (
                        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                          {restoreUserError}
                        </div>
                      ) : null}
                    </form>
                  </DetailSection>
                ) : null}

                <DetailSection
                  title="Danger zone"
                  info={{
                    label: 'Explain danger zone section',
                    title: 'Danger zone',
                    content:
                      'Deleting a user is an administrative cleanup action. It should only be used when the account should leave active auth flows entirely.',
                  }}
                  action={
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={!canDeleteThisUser}
                      onClick={() => {
                        setDeleteUserDialogOpen(true);
                      }}
                    >
                      Delete user
                    </Button>
                  }
                >
                  <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {sessionQuery.data?.id === userId
                      ? 'You cannot delete your own account from this screen.'
                      : user.status === 'deleted'
                        ? 'This account is already deleted. The identity is retained so you can review history and restore it later if needed.'
                        : 'Deleting the account soft-removes access, preserves historical records, and takes the user out of active sign-in flows.'}
                  </div>
                </DetailSection>
              </div>

              <div className="space-y-6">
                {activityTrackingFeatureEnabled ? (
                  <DetailSection
                    title="Activity and lifecycle"
                    info={{
                      label: 'Explain activity and lifecycle section',
                      title: 'Activity and lifecycle',
                      content:
                        'These timestamps come from the auth system and help with audit reviews, troubleshooting, and confirming whether an account is still in active use.',
                    }}
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
                ) : null}

                <DetailSection
                  title="Security"
                  info={{
                    label: 'Explain security section',
                    title: 'Security',
                    content:
                      'This section focuses on credentials and temporary lockouts. Use it when you need to recover access or confirm whether the account is currently blocked.',
                  }}
                  action={
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!canResetPassword}
                      onClick={() => {
                        setResetPasswordDialogOpen(true);
                      }}
                    >
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
                        {formatDateTime(
                          user.last_password_change,
                          'No password has been set yet',
                        )}
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
            </div>
        </TabsContent>

        <TabsContent value="access" className="pt-1">
            <div className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                <DetailSection
                  title="Entity memberships"
                  info={{
                    label: 'Explain entity memberships section',
                    title: 'Entity memberships',
                    content:
                      'Memberships attach the user to specific entities. They are the place to review local roles, time windows, and whether access comes from one branch of the hierarchy.',
                  }}
                  action={
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!canManageMembershipAccess}
                      onClick={() => {
                        setMembershipAccessDialogState({
                          open: true,
                          entityId: null,
                          lockEntity: false,
                        });
                      }}
                    >
                      Assign entity
                    </Button>
                  }
                >
                  {membershipsQuery.isError ? (
                    <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-6 text-sm text-destructive">
                      {getApiErrorMessage(
                        membershipsQuery.error,
                        'The user memberships could not be loaded.',
                      )}
                    </div>
                  ) : membershipsQuery.data && membershipsQuery.data.length > 0 ? (
                    <div className="space-y-3">
                      {updateMembershipMutation.error ? (
                        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                          {getApiErrorMessage(
                            updateMembershipMutation.error,
                            'The membership access could not be updated.',
                          )}
                        </div>
                      ) : null}
                      {membershipsQuery.data.map((membership) => {
                        const entity = entityById.get(membership.entity_id);
                        const membershipStatus =
                          membership.effective_status || membership.status;
                        const membershipRoles = membership.role_ids
                          .map((roleId) => membershipRoleById.get(roleId))
                          .filter((role): role is Role => Boolean(role));
                        const isRestoringMembership =
                          updateMembershipMutation.isPending &&
                          updateMembershipMutation.variables?.entityId ===
                            membership.entity_id;

                        return (
                          <div
                            key={membership.id}
                            className="rounded-lg border bg-muted/30 px-4 py-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="font-medium">
                                    {entity?.title ?? membership.entity_id}
                                  </div>
                                  <Badge
                                    variant={getMembershipStatusVariant(
                                      membershipStatus,
                                    )}
                                  >
                                    {formatMembershipToken(membershipStatus)}
                                  </Badge>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {entity?.pathLabel ?? 'Entity path unavailable'}
                                </div>
                              </div>
                              {membership.status === 'revoked' ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={
                                    !canManageMembershipAccess ||
                                    isRestoringMembership
                                  }
                                  onClick={async () => {
                                    try {
                                      await updateMembershipMutation.mutateAsync({
                                        userId,
                                        entityId: membership.entity_id,
                                        status: 'active',
                                        reason: null,
                                      });
                                    } catch {
                                      return;
                                    }
                                  }}
                                >
                                  {isRestoringMembership
                                    ? 'Restoring…'
                                    : 'Restore access'}
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={
                                    !(
                                      canManageMembershipAccess ||
                                      canRemoveMemberships
                                    )
                                  }
                                  onClick={() => {
                                    setMembershipAccessDialogState({
                                      open: true,
                                      entityId: membership.entity_id,
                                      lockEntity: true,
                                    });
                                  }}
                                >
                                  Manage access
                                </Button>
                              )}
                            </div>
                            <div className="mt-3 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                              <div className="rounded-lg border bg-background/70 px-3 py-2">
                                <div className="font-medium text-foreground">
                                  Joined
                                </div>
                                <div className="mt-1">
                                  {formatDateTime(membership.joined_at, 'Unknown')}
                                </div>
                              </div>
                              <div className="rounded-lg border bg-background/70 px-3 py-2">
                                <div className="font-medium text-foreground">
                                  Window
                                </div>
                                <div className="mt-1">
                                  {membership.valid_from || membership.valid_until
                                    ? `${formatDateTime(membership.valid_from, 'Now')} -> ${formatDateTime(
                                        membership.valid_until,
                                        'Open ended',
                                      )}`
                                    : 'Always on'}
                                </div>
                              </div>
                              <div className="rounded-lg border bg-background/70 px-3 py-2">
                                <div className="font-medium text-foreground">
                                  Current access
                                </div>
                                <div className="mt-1">
                                  {membership.can_grant_permissions
                                    ? 'Grants permissions now'
                                    : 'Does not currently grant permissions'}
                                </div>
                              </div>
                            </div>
                            {membership.revocation_reason ? (
                              <div className="mt-3 rounded-lg border bg-background/70 px-3 py-2 text-sm text-muted-foreground">
                                {membership.revocation_reason}
                              </div>
                            ) : null}
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
                        );
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
                  info={{
                    label: 'Explain direct account roles section',
                    title: 'Direct account roles',
                    content:
                      'Direct roles apply to the account itself, outside a single entity membership. Use memberships above when the access should stay scoped to one branch.',
                  }}
                  action={
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!canAssignDirectRoles}
                      onClick={() => {
                        setDirectRoleDialogOpen(true);
                      }}
                    >
                      Assign direct role
                    </Button>
                  }
                >
                  {directRoleMembershipsQuery.isError ? (
                    <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-6 text-sm text-destructive">
                      {getApiErrorMessage(
                        directRoleMembershipsQuery.error,
                        'The direct role assignments could not be loaded.',
                      )}
                    </div>
                  ) : directRoleMembershipsQuery.data &&
                    directRoleMembershipsQuery.data.length > 0 ? (
                    <div className="space-y-3">
                      {removeRoleError ? (
                        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                          {removeRoleError}
                        </div>
                      ) : null}
                      {directRoleMembershipsQuery.data.map((membership) => {
                        const role = membership.role;

                        return (
                          <div
                            key={membership.id}
                            className="rounded-lg border bg-muted/30 px-4 py-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="font-medium">
                                    {role.display_name}
                                  </div>
                                  <Badge
                                    variant={
                                      membership.status === 'active' &&
                                      membership.can_grant_permissions
                                        ? 'secondary'
                                        : membership.status === 'revoked'
                                          ? 'destructive'
                                          : 'outline'
                                    }
                                  >
                                    {formatToken(membership.status)}
                                  </Badge>
                                </div>
                                {role.description ? (
                                  <div className="text-sm text-muted-foreground">
                                    {role.description}
                                  </div>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap justify-end gap-2">
                                {role.is_global ? (
                                  <Badge variant="outline">Global</Badge>
                                ) : null}
                                {role.status !== 'active' ? (
                                  <Badge variant="outline">
                                    Role {formatToken(role.status)}
                                  </Badge>
                                ) : null}
                                <Badge variant="outline">
                                  {role.permissions.length} permissions
                                </Badge>
                                {canRemoveDirectRoles &&
                                membership.status === 'active' ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    disabled={removeRoleMutation.isPending}
                                    onClick={() => {
                                      setConfirmingDirectRoleId((currentRoleId) =>
                                        currentRoleId === membership.role_id
                                          ? null
                                          : membership.role_id,
                                      );
                                    }}
                                  >
                                    Remove
                                  </Button>
                                ) : null}
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
                            <div className="mt-3 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                              <div className="rounded-lg border bg-background/70 px-3 py-2">
                                <div className="font-medium text-foreground">
                                  Assigned
                                </div>
                                <div className="mt-1">
                                  {formatDateTime(membership.assigned_at, 'Unknown')}
                                </div>
                              </div>
                              <div className="rounded-lg border bg-background/70 px-3 py-2">
                                <div className="font-medium text-foreground">
                                  Window
                                </div>
                                <div className="mt-1">
                                  {membership.valid_from || membership.valid_until
                                    ? `${formatDateTime(membership.valid_from, 'Now')} -> ${formatDateTime(
                                        membership.valid_until,
                                        'Open ended',
                                      )}`
                                    : 'Always on'}
                                </div>
                              </div>
                              <div className="rounded-lg border bg-background/70 px-3 py-2">
                                <div className="font-medium text-foreground">
                                  Current access
                                </div>
                                <div className="mt-1">
                                  {membership.can_grant_permissions
                                    ? 'Grants permissions now'
                                    : role.status !== 'active'
                                      ? `Blocked by ${formatToken(role.status).toLowerCase()} role definition`
                                      : 'Does not currently grant permissions'}
                                </div>
                              </div>
                            </div>
                            {membership.revocation_reason ? (
                              <div className="mt-3 rounded-lg border bg-background/70 px-3 py-2 text-sm text-muted-foreground">
                                {membership.revocation_reason}
                              </div>
                            ) : null}
                            {confirmingDirectRoleId === membership.role_id ? (
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/80 px-3 py-2">
                                <span className="text-sm text-muted-foreground">
                                  Remove this direct role from the account?
                                </span>
                                <div className="flex items-center gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={removeRoleMutation.isPending}
                                    onClick={() => {
                                      setConfirmingDirectRoleId(null);
                                    }}
                                  >
                                    Keep role
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="destructive"
                                    disabled={removeRoleMutation.isPending}
                                    onClick={async () => {
                                      try {
                                        await removeRoleMutation.mutateAsync({
                                          userId,
                                          roleId: membership.role_id,
                                        });
                                        setConfirmingDirectRoleId(null);
                                      } catch {
                                        return;
                                      }
                                    }}
                                  >
                                    {removeRoleMutation.isPending &&
                                    removeRoleMutation.variables?.roleId ===
                                      membership.role_id
                                      ? 'Removing…'
                                      : 'Confirm remove'}
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
                      No direct roles are currently assigned to this account.
                    </div>
                  )}
                </DetailSection>
              </div>

              <DetailSection
                title="Permissions"
                info={{
                  label: 'Explain permissions section',
                  title: 'Permissions',
                  content:
                    'This is the resolved permission set after direct roles, memberships, inheritance, and other grant paths are combined.',
                }}
              >
                {userPermissionsQuery.isError ? (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-6 text-sm text-destructive">
                    {getApiErrorMessage(
                      userPermissionsQuery.error,
                      'The effective permission set could not be loaded.',
                    )}
                  </div>
                ) : groupedPermissions.length > 0 ? (
                  <div className="space-y-4">
                    {groupedPermissions.map((group) => (
                      <div
                        key={group.resource}
                        className="rounded-lg border bg-muted/30 px-4 py-3"
                      >
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="font-medium">
                            {formatToken(group.resource)}
                          </div>
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
            </div>
        </TabsContent>

        <TabsContent value="history" className="pt-1">
            <div className="grid gap-6 xl:grid-cols-2">
              <DetailSection
                title="Audit timeline"
                description="Recent cross-domain account events from the retained user audit stream."
                action={
                  <SectionPaginationAction
                    itemLabel="events"
                    total={auditEventsQuery.data?.total ?? 0}
                    page={auditEventsQuery.data?.page ?? auditEventsPage}
                    pages={auditEventsQuery.data?.pages ?? 0}
                    isPending={auditEventsQuery.isPending}
                    onPrevious={() => {
                      setAuditEventsPage((currentPage) =>
                        Math.max(1, currentPage - 1),
                      );
                    }}
                    onNext={() => {
                      setAuditEventsPage((currentPage) => currentPage + 1);
                    }}
                  />
                }
              >
                {auditEventsQuery.isError ? (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-6 text-sm text-destructive">
                    {getApiErrorMessage(
                      auditEventsQuery.error,
                      'The user audit timeline could not be loaded.',
                    )}
                  </div>
                ) : auditEventsQuery.data?.items.length ? (
                  <div className="space-y-3">
                    {auditEventsQuery.data.items.map((event) => {
                      const afterStatus = getStringValue(event.after, 'status');

                      return (
                        <div
                          key={event.id}
                          className="rounded-lg border bg-muted/30 px-4 py-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="font-medium">
                                {formatToken(
                                  event.event_type.split('.').at(-1) ??
                                    event.event_type,
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatDateTime(event.occurred_at, 'Unknown')}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline">
                                {formatToken(event.event_category)}
                              </Badge>
                              {afterStatus ? (
                                <Badge variant={getAuditEventBadgeVariant(event)}>
                                  {formatToken(afterStatus)}
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                          <div className="mt-3 text-sm text-muted-foreground">
                            {getAuditEventSummary(event)}
                          </div>
                          {event.reason &&
                          event.reason !== getAuditEventSummary(event) ? (
                            <div className="mt-3 rounded-lg border bg-background/70 px-3 py-2 text-sm text-muted-foreground">
                              {event.reason}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
                    No audit events are currently available for this account.
                  </div>
                )}
              </DetailSection>

              <DetailSection
                title="Membership history"
                description="Append-only membership lifecycle history for this retained identity."
                action={
                  <SectionPaginationAction
                    itemLabel="history events"
                    total={membershipHistoryQuery.data?.total ?? 0}
                    page={
                      membershipHistoryQuery.data?.page ?? membershipHistoryPage
                    }
                    pages={membershipHistoryQuery.data?.pages ?? 0}
                    isPending={membershipHistoryQuery.isPending}
                    onPrevious={() => {
                      setMembershipHistoryPage((currentPage) =>
                        Math.max(1, currentPage - 1),
                      );
                    }}
                    onNext={() => {
                      setMembershipHistoryPage((currentPage) => currentPage + 1);
                    }}
                  />
                }
              >
                {membershipHistoryQuery.isError ? (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-6 text-sm text-destructive">
                    {getApiErrorMessage(
                      membershipHistoryQuery.error,
                      'The membership history could not be loaded.',
                    )}
                  </div>
                ) : membershipHistoryQuery.data?.items.length ? (
                  <div className="space-y-3">
                    {membershipHistoryQuery.data.items.map((event) => (
                      <div
                        key={event.id}
                        className="rounded-lg border bg-muted/30 px-4 py-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="font-medium">
                              {event.entity_display_name ??
                                event.entity_path.at(-1) ??
                                event.entity_id}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatDateTime(event.event_at, 'Unknown')}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge
                              variant={getMembershipStatusVariant(event.status)}
                            >
                              {formatMembershipToken(event.status)}
                            </Badge>
                            <Badge variant="outline">
                              {formatToken(event.event_type)}
                            </Badge>
                          </div>
                        </div>
                        <div className="mt-3 text-sm text-muted-foreground">
                          {getMembershipHistorySummary(event)}
                        </div>
                        {event.entity_path.length > 0 ? (
                          <div className="mt-3 text-xs text-muted-foreground">
                            {event.entity_path.join(' / ')}
                          </div>
                        ) : null}
                        {event.role_names.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {event.role_names.map((roleName) => (
                              <Badge
                                key={`${event.id}-${roleName}`}
                                variant="outline"
                              >
                                {roleName}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
                    No membership history is currently available for this account.
                  </div>
                )}
              </DetailSection>
            </div>
        </TabsContent>
      </Tabs>

      <DirectRoleAssignmentDialog
        open={directRoleDialogOpen}
        onOpenChange={setDirectRoleDialogOpen}
        userId={userId}
        assignedRoles={(directRoleMembershipsQuery.data ?? [])
          .filter((membership) => membership.status === 'active')
          .map((membership) => membership.role)}
        canAssignDirectRoles={canAssignDirectRoles}
      />

      <ResetUserPasswordDialog
        open={resetPasswordDialogOpen}
        onOpenChange={setResetPasswordDialogOpen}
        userId={userId}
        userEmail={user.email}
      />

      <DeleteUserDialog
        open={deleteUserDialogOpen}
        onOpenChange={setDeleteUserDialogOpen}
        userId={userId}
        userEmail={user.email}
        onDeleted={onDeleted}
      />

      <MembershipAccessDialog
        open={membershipAccessDialogState.open}
        onOpenChange={(nextOpen) => {
          setMembershipAccessDialogState((currentState) => ({
            ...currentState,
            open: nextOpen,
          }));
        }}
        userId={userId}
        entities={entitiesQuery.data?.items ?? []}
        memberships={membershipsQuery.data ?? []}
        initialEntityId={membershipAccessDialogState.entityId}
        lockEntity={membershipAccessDialogState.lockEntity}
        canManageMembershipAccess={canManageMembershipAccess}
        canRemoveMemberships={canRemoveMemberships}
      />
    </AppPage>
  );
}
