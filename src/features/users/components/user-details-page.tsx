import { useEffect, useMemo, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  ArrowLeft,
  Building2,
  Clock3,
  Mail,
} from 'lucide-react';

import { AppConfirmDialog } from '@/components/app/app-confirm-dialog';
import { AppPage } from '@/components/app/app-page';
import { AppStatusBadge } from '@/components/app/app-status-badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getAuthConfigQueryOptions } from '@/features/auth/api/auth.query-options';
import { useActorPermissions } from '@/features/auth/hooks/use-actor-permissions';
import { getEntitiesQueryOptions } from '@/features/entities/api/entities.query-options';
import { buildEntityOptions } from '@/features/entities/utils/build-entity-options';
import { getUserMembershipsQueryOptions } from '@/features/memberships/api/memberships.query-options';
import { useUpdateMembershipMutation } from '@/features/memberships/hooks/use-update-membership-mutation';
import { getRolesForEntityQueryOptions } from '@/features/roles/api/roles.query-options';
import type { Role } from '@/features/roles/types/roles.types';
import { DeleteUserDialog } from '@/features/users/components/delete-user-dialog';
import { DirectRoleAssignmentDialog } from '@/features/users/components/direct-role-assignment-dialog';
import { EditDirectRoleMembershipDialog } from '@/features/users/components/edit-direct-role-membership-dialog';
import { MembershipAccessDialog } from '@/features/users/components/membership-access-dialog';
import { PermissionCheckDialog } from '@/features/users/components/permission-check-dialog';
import { ResetUserPasswordDialog } from '@/features/users/components/reset-user-password-dialog';
import { UserDetailsAccessTab } from '@/features/users/components/user-details-access-tab';
import { UserDetailsHistoryTab } from '@/features/users/components/user-details-history-tab';
import { UserDetailsMainTab } from '@/features/users/components/user-details-main-tab';
import {
  getUserApiKeysQueryOptions,
  getUserAuditEventsQueryOptions,
  getUserMembershipHistoryQueryOptions,
  getUserPermissionsQueryOptions,
  getUserQueryOptions,
  getUserRoleMembershipsQueryOptions,
} from '@/features/users/api/users.query-options';
import { useRemoveRoleFromUserMutation } from '@/features/users/hooks/use-remove-role-from-user-mutation';
import { useResendInviteMutation } from '@/features/users/hooks/use-resend-invite-mutation';
import { useRestoreUserMutation } from '@/features/users/hooks/use-restore-user-mutation';
import { useRevokeUserApiKeyMutation } from '@/features/users/hooks/use-revoke-user-api-key-mutation';
import { useUpdateUserMutation } from '@/features/users/hooks/use-update-user-mutation';
import { useUpdateUserStatusMutation } from '@/features/users/hooks/use-update-user-status-mutation';
import { useUpdateUserSuperuserMutation } from '@/features/users/hooks/use-update-user-superuser-mutation';
import {
  type UpdateUserProfileFormValues,
  updateUserProfileSchema,
} from '@/features/users/schemas/update-user-profile.schema';
import {
  type UpdateUserStatusFormValues,
  updateUserStatusSchema,
} from '@/features/users/schemas/update-user-status.schema';
import type {
  UserDetailsTab,
  UserRoleMembership,
} from '@/features/users/types/users.types';
import {
  formatDateTime,
  formatToken,
  getStatusTone,
  getUserDisplayName,
  getUserInitials,
  groupPermissionsByResource,
  toDateTimeLocalValue,
} from '@/features/users/utils/user-details-display';
import { getApiErrorMessage } from '@/lib/api/errors';

type UserDetailsPageProps = {
  userId: string;
  initialTab?: UserDetailsTab;
  backLabel?: string;
  onBack: () => void;
  onDeleted: () => void;
};

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
  const actorPermissions = useActorPermissions();
  const sessionUser = actorPermissions.sessionUser;
  const authConfigQuery = useQuery(getAuthConfigQueryOptions());
  const membershipRolesFeatureEnabled =
    authConfigQuery.data?.features.entity_hierarchy === true;
  const userStatusFeatureEnabled =
    authConfigQuery.data?.features.user_status === true;
  const activityTrackingFeatureEnabled =
    authConfigQuery.data?.features.activity_tracking === true;
  const entitiesQuery = useQuery({
    ...getEntitiesQueryOptions(),
    enabled: membershipRolesFeatureEnabled,
  });
  const userQuery = useQuery(getUserQueryOptions(userId));
  const auditEventsQuery = useQuery({
    ...getUserAuditEventsQueryOptions(userId, {
      page: auditEventsPage,
      limit: 6,
    }),
    enabled: activityTrackingFeatureEnabled,
  });
  const membershipHistoryQuery = useQuery({
    ...getUserMembershipHistoryQueryOptions(userId, {
      page: membershipHistoryPage,
      limit: 6,
    }),
    enabled: membershipRolesFeatureEnabled,
  });
  const directRoleMembershipsQuery = useQuery(
    getUserRoleMembershipsQueryOptions(userId, { includeInactive: true }),
  );
  const userPermissionsQuery = useQuery(getUserPermissionsQueryOptions(userId));
  const membershipsQuery = useQuery({
    ...getUserMembershipsQueryOptions(userId, { includeInactive: true }),
    enabled: membershipRolesFeatureEnabled,
  });
  const personalApiKeysFeatureEnabled =
    authConfigQuery.data?.features.api_keys === true;
  const userApiKeysQuery = useQuery({
    ...getUserApiKeysQueryOptions(userId),
    enabled:
      personalApiKeysFeatureEnabled &&
      activeDetailsTab === 'access' &&
      Boolean(sessionUser?.id),
  });
  const updateUserMutation = useUpdateUserMutation();
  const updateUserStatusMutation = useUpdateUserStatusMutation();
  const updateUserSuperuserMutation = useUpdateUserSuperuserMutation();
  const updateMembershipMutation = useUpdateMembershipMutation();
  const resendInviteMutation = useResendInviteMutation();
  const restoreUserMutation = useRestoreUserMutation();
  const removeRoleMutation = useRemoveRoleFromUserMutation();
  const revokeUserApiKeyMutation = useRevokeUserApiKeyMutation();
  const [directRoleDialogOpen, setDirectRoleDialogOpen] = useState(false);
  const [editingDirectRoleMembership, setEditingDirectRoleMembership] =
    useState<UserRoleMembership | null>(null);
  const [confirmingApiKeyId, setConfirmingApiKeyId] = useState<string | null>(
    null,
  );
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [deleteUserDialogOpen, setDeleteUserDialogOpen] = useState(false);
  const [superuserConfirmOpen, setSuperuserConfirmOpen] = useState(false);
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
  const [permissionCheckDialogOpen, setPermissionCheckDialogOpen] =
    useState(false);
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
  const pageError = userQuery.error ?? authConfigQuery.error;
  const directRolesFeatureEnabled = true;
  const canReadScopedRoleCatalog = actorPermissions.allows([
    'role:read',
    'role:read_tree',
  ]);
  const canAssignDirectRoles =
    directRolesFeatureEnabled &&
    actorPermissions.allows(['user:update']) &&
    actorPermissions.allows(['role:read', 'role:read_tree']);
  const canUpdateUsers = actorPermissions.allows(['user:update']);
  const canDeleteUsers = actorPermissions.allows(['user:delete']);
  const canRemoveDirectRoles = canUpdateUsers;
  const canEditDirectRoleWindows = canUpdateUsers;
  const canReadUserApiKeys =
    personalApiKeysFeatureEnabled && actorPermissions.allows(['user:read']);
  const canRevokeUserApiKeys = canReadUserApiKeys && canUpdateUsers;
  const canManageMembershipAccess =
    membershipRolesFeatureEnabled &&
    (actorPermissions.allows([
      'membership:create',
      'membership:create_tree',
    ]) ||
      actorPermissions.allows([
        'membership:update',
        'membership:update_tree',
      ]));
  const canRemoveMemberships =
    membershipRolesFeatureEnabled &&
    actorPermissions.allows(['membership:delete', 'membership:delete_tree']);
  const canCheckPermissions = actorPermissions.allows(['permission:check']);
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
    sessionUser?.id !== userId &&
    user?.status !== 'deleted';
  const isSelfUser = sessionUser?.id === userId;
  const canManageSuperuserAccess =
    actorPermissions.isSuperuser && user?.status !== 'deleted';
  const canChangeSuperuserAccess =
    canManageSuperuserAccess && !(isSelfUser && user?.is_superuser);
  const nextSuperuserValue = !(user?.is_superuser ?? false);
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
  const superuserAccessError = updateUserSuperuserMutation.error
    ? getApiErrorMessage(
        updateUserSuperuserMutation.error,
        'Unable to update superuser access.',
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

  if (userQuery.isPending || authConfigQuery.isPending) {
    return (
      <AppPage
        title="Loading user"
        padded
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
        padded
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
      padded
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
                <AppStatusBadge tone={getStatusTone(user.status)}>
                  {formatToken(user.status)}
                </AppStatusBadge>
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
          <UserDetailsMainTab
            userId={userId}
            user={user}
            sessionUserId={sessionUser?.id}
            isSuperuserActor={actorPermissions.isSuperuser}
            isSelfUser={isSelfUser}
            canUpdateUsers={canUpdateUsers}
            canResendInvite={canResendInvite}
            canRestoreUser={canRestoreUser}
            canDeleteThisUser={canDeleteThisUser}
            canResetPassword={canResetPassword}
            canChangeSuperuserAccess={canChangeSuperuserAccess}
            userStatusFeatureEnabled={userStatusFeatureEnabled}
            activityTrackingFeatureEnabled={activityTrackingFeatureEnabled}
            profileForm={profileForm}
            statusForm={statusForm}
            watchedStatus={watchedStatus}
            updateUserMutation={updateUserMutation}
            updateUserStatusMutation={updateUserStatusMutation}
            resendInviteMutation={resendInviteMutation}
            restoreUserMutation={restoreUserMutation}
            updateUserSuperuserMutation={updateUserSuperuserMutation}
            profileError={profileError}
            statusError={statusError}
            resendInviteError={resendInviteError}
            restoreUserError={restoreUserError}
            superuserAccessError={superuserAccessError}
            onOpenSuperuserConfirm={() => setSuperuserConfirmOpen(true)}
            onOpenDeleteUser={() => setDeleteUserDialogOpen(true)}
            onOpenResetPassword={() => setResetPasswordDialogOpen(true)}
          />
        </TabsContent>

        <TabsContent value="access" className="pt-1">
          <UserDetailsAccessTab
            userId={userId}
            membershipRolesFeatureEnabled={membershipRolesFeatureEnabled}
            canManageMembershipAccess={canManageMembershipAccess}
            canRemoveMemberships={canRemoveMemberships}
            canAssignDirectRoles={canAssignDirectRoles}
            canEditDirectRoleWindows={canEditDirectRoleWindows}
            canRemoveDirectRoles={canRemoveDirectRoles}
            canReadUserApiKeys={canReadUserApiKeys}
            canRevokeUserApiKeys={canRevokeUserApiKeys}
            canCheckPermissions={canCheckPermissions}
            entityById={entityById}
            membershipRoleById={membershipRoleById}
            membershipsQuery={membershipsQuery}
            directRoleMembershipsQuery={directRoleMembershipsQuery}
            userApiKeysQuery={userApiKeysQuery}
            userPermissionsQuery={userPermissionsQuery}
            groupedPermissions={groupedPermissions}
            updateMembershipMutation={updateMembershipMutation}
            removeRoleMutation={removeRoleMutation}
            revokeUserApiKeyMutation={revokeUserApiKeyMutation}
            removeRoleError={removeRoleError}
            confirmingDirectRoleId={confirmingDirectRoleId}
            setConfirmingDirectRoleId={setConfirmingDirectRoleId}
            confirmingApiKeyId={confirmingApiKeyId}
            setConfirmingApiKeyId={setConfirmingApiKeyId}
            setMembershipAccessDialogState={setMembershipAccessDialogState}
            setDirectRoleDialogOpen={setDirectRoleDialogOpen}
            setEditingDirectRoleMembership={setEditingDirectRoleMembership}
            setPermissionCheckDialogOpen={setPermissionCheckDialogOpen}
          />
        </TabsContent>

        <TabsContent value="history" className="pt-1">
          <UserDetailsHistoryTab
            activityTrackingFeatureEnabled={activityTrackingFeatureEnabled}
            membershipRolesFeatureEnabled={membershipRolesFeatureEnabled}
            auditEventsPage={auditEventsPage}
            membershipHistoryPage={membershipHistoryPage}
            auditEventsQuery={auditEventsQuery}
            membershipHistoryQuery={membershipHistoryQuery}
            setAuditEventsPage={setAuditEventsPage}
            setMembershipHistoryPage={setMembershipHistoryPage}
          />
        </TabsContent>
      </Tabs>

      <AppConfirmDialog
        open={superuserConfirmOpen}
        onOpenChange={setSuperuserConfirmOpen}
        title={
          nextSuperuserValue
            ? 'Grant superuser access'
            : 'Remove superuser access'
        }
        description={
          nextSuperuserValue
            ? `Grant platform-wide superuser access to ${user.email}.`
            : `Remove platform-wide superuser access from ${user.email}.`
        }
        confirmLabel={
          nextSuperuserValue ? 'Grant superuser' : 'Remove superuser'
        }
        confirmLabelPending={
          nextSuperuserValue ? 'Granting…' : 'Removing…'
        }
        confirmVariant={nextSuperuserValue ? 'default' : 'destructive'}
        confirmDisabled={!canChangeSuperuserAccess}
        isPending={updateUserSuperuserMutation.isPending}
        errorMessage={superuserAccessError}
        onConfirm={async () => {
          await updateUserSuperuserMutation.mutateAsync({
            userId,
            is_superuser: nextSuperuserValue,
            reason: nextSuperuserValue
              ? 'Granted from admin UI'
              : 'Revoked from admin UI',
          });
          setSuperuserConfirmOpen(false);
        }}
      />

      <DirectRoleAssignmentDialog
        open={directRoleDialogOpen}
        onOpenChange={setDirectRoleDialogOpen}
        userId={userId}
        assignedRoles={(directRoleMembershipsQuery.data ?? [])
          .filter((membership) => membership.status === 'active')
          .map((membership) => membership.role)}
        canAssignDirectRoles={canAssignDirectRoles}
      />

      <EditDirectRoleMembershipDialog
        open={editingDirectRoleMembership != null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setEditingDirectRoleMembership(null);
          }
        }}
        userId={userId}
        membership={editingDirectRoleMembership}
        canEdit={canEditDirectRoleWindows}
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

      {membershipRolesFeatureEnabled ? (
        <MembershipAccessDialog
          key={`${membershipAccessDialogState.entityId ?? 'none'}:${membershipAccessDialogState.lockEntity ? 'locked' : 'free'}`}
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
      ) : null}

      {canCheckPermissions ? (
        <PermissionCheckDialog
          open={permissionCheckDialogOpen}
          onOpenChange={setPermissionCheckDialogOpen}
          userId={userId}
          userLabel={user.email}
          entities={entitiesQuery.data?.items ?? []}
          entityHierarchyEnabled={membershipRolesFeatureEnabled}
        />
      ) : null}
    </AppPage>
  );
}
