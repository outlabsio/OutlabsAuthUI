import type { UseQueryResult } from '@tanstack/react-query';

import { AppEmptyState } from '@/components/app/app-empty-state';
import { AppErrorState } from '@/components/app/app-error-state';
import { AppStatusBadge } from '@/components/app/app-status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ApiKey } from '@/features/api-keys/types/api-keys.types';
import type { EntityOption } from '@/features/entities/utils/build-entity-options';
import type { UserMembership } from '@/features/memberships/types/memberships.types';
import { useUpdateMembershipMutation } from '@/features/memberships/hooks/use-update-membership-mutation';
import {
  formatMembershipToken,
  getMembershipStatusTone,
} from '@/features/memberships/utils/membership-display';
import type { Role } from '@/features/roles/types/roles.types';
import {
  getRoleScopeSummary,
  formatRoleToken,
} from '@/features/roles/utils/role-display';
import { DetailSection } from '@/features/users/components/user-details-section';
import { UserSessionsPanel } from '@/features/users/components/user-sessions-panel';
import { useRemoveRoleFromUserMutation } from '@/features/users/hooks/use-remove-role-from-user-mutation';
import { useRevokeAllUserSessionsMutation } from '@/features/users/hooks/use-revoke-all-user-sessions-mutation';
import { useRevokeUserApiKeyMutation } from '@/features/users/hooks/use-revoke-user-api-key-mutation';
import { useRevokeUserSessionMutation } from '@/features/users/hooks/use-revoke-user-session-mutation';
import type { UserSession } from '@/features/users/types/user-session.types';
import type {
  UserPermissionSource,
  UserRoleMembership,
} from '@/features/users/types/users.types';
import {
  formatDateTime,
  formatToken,
} from '@/features/users/utils/user-details-display';
import { getApiErrorMessage } from '@/lib/api/errors';

type GroupedPermission = {
  resource: string;
  items: UserPermissionSource[];
};

type UserDetailsAccessTabProps = {
  userId: string;
  membershipRolesFeatureEnabled: boolean;
  canManageMembershipAccess: boolean;
  canRemoveMemberships: boolean;
  canAssignDirectRoles: boolean;
  canEditDirectRoleWindows: boolean;
  canRemoveDirectRoles: boolean;
  canReadUserApiKeys: boolean;
  canRevokeUserApiKeys: boolean;
  canReadUserSessions: boolean;
  canRevokeUserSessions: boolean;
  canCheckPermissions: boolean;
  entityById: Map<string, EntityOption>;
  membershipRoleById: Map<string, Role>;
  membershipsQuery: UseQueryResult<UserMembership[]>;
  directRoleMembershipsQuery: UseQueryResult<UserRoleMembership[]>;
  userApiKeysQuery: UseQueryResult<ApiKey[]>;
  userSessionsQuery: UseQueryResult<UserSession[]>;
  userPermissionsQuery: UseQueryResult<UserPermissionSource[]>;
  groupedPermissions: GroupedPermission[];
  updateMembershipMutation: ReturnType<typeof useUpdateMembershipMutation>;
  removeRoleMutation: ReturnType<typeof useRemoveRoleFromUserMutation>;
  revokeUserApiKeyMutation: ReturnType<typeof useRevokeUserApiKeyMutation>;
  revokeUserSessionMutation: ReturnType<typeof useRevokeUserSessionMutation>;
  revokeAllUserSessionsMutation: ReturnType<
    typeof useRevokeAllUserSessionsMutation
  >;
  removeRoleError: string | null;
  confirmingDirectRoleId: string | null;
  setConfirmingDirectRoleId: (
    value: string | null | ((current: string | null) => string | null),
  ) => void;
  confirmingApiKeyId: string | null;
  setConfirmingApiKeyId: (
    value: string | null | ((current: string | null) => string | null),
  ) => void;
  setMembershipAccessDialogState: (state: {
    open: boolean;
    entityId: string | null;
    lockEntity: boolean;
  }) => void;
  setDirectRoleDialogOpen: (open: boolean) => void;
  setEditingDirectRoleMembership: (membership: UserRoleMembership | null) => void;
  setPermissionCheckDialogOpen: (open: boolean) => void;
};

export function UserDetailsAccessTab({
  userId,
  membershipRolesFeatureEnabled,
  canManageMembershipAccess,
  canRemoveMemberships,
  canAssignDirectRoles,
  canEditDirectRoleWindows,
  canRemoveDirectRoles,
  canReadUserApiKeys,
  canRevokeUserApiKeys,
  canReadUserSessions,
  canRevokeUserSessions,
  canCheckPermissions,
  entityById,
  membershipRoleById,
  membershipsQuery,
  directRoleMembershipsQuery,
  userApiKeysQuery,
  userSessionsQuery,
  userPermissionsQuery,
  groupedPermissions,
  updateMembershipMutation,
  removeRoleMutation,
  revokeUserApiKeyMutation,
  revokeUserSessionMutation,
  revokeAllUserSessionsMutation,
  removeRoleError,
  confirmingDirectRoleId,
  setConfirmingDirectRoleId,
  confirmingApiKeyId,
  setConfirmingApiKeyId,
  setMembershipAccessDialogState,
  setDirectRoleDialogOpen,
  setEditingDirectRoleMembership,
  setPermissionCheckDialogOpen,
}: UserDetailsAccessTabProps) {
  return (
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
                  action={membershipRolesFeatureEnabled ? (
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
                  ) : undefined}
                >
                  {!membershipRolesFeatureEnabled ? (
                    <AppEmptyState
                      title="Entity memberships unavailable"
                      description="This backend does not advertise entity hierarchy support, so scoped memberships are not available on this user."
                      compact
                    />
                  ) : membershipsQuery.isError ? (
                    <AppErrorState>
                      {getApiErrorMessage(
                        membershipsQuery.error,
                        'The user memberships could not be loaded.',
                      )}
                    </AppErrorState>
                  ) : membershipsQuery.data && membershipsQuery.data.length > 0 ? (
                    <div className="space-y-3">
                      {updateMembershipMutation.error ? (
                        <AppErrorState compact>
                          {getApiErrorMessage(
                            updateMembershipMutation.error,
                            'The membership access could not be updated.',
                          )}
                        </AppErrorState>
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
                                  <AppStatusBadge
                                    tone={getMembershipStatusTone(
                                      membershipStatus,
                                    )}
                                  >
                                    {formatMembershipToken(membershipStatus)}
                                  </AppStatusBadge>
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
                    <AppEmptyState
                      title="No entity memberships"
                      description="This user does not currently belong to any entity memberships."
                      compact
                    />
                  )}
                </DetailSection>

                <DetailSection
                  title="Direct account roles"
                  info={{
                    label: 'Explain direct account roles section',
                    title: 'Direct account roles',
                    content: membershipRolesFeatureEnabled
                      ? 'Direct roles apply to the account itself, outside a single entity membership. Use memberships above when the access should stay scoped to one branch.'
                      : 'Direct roles apply to the account itself and are the access model for this backend.',
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
                    <AppErrorState>
                      {getApiErrorMessage(
                        directRoleMembershipsQuery.error,
                        'The direct role assignments could not be loaded.',
                      )}
                    </AppErrorState>
                  ) : directRoleMembershipsQuery.data &&
                    directRoleMembershipsQuery.data.length > 0 ? (
                    <div className="space-y-3">
                      {removeRoleError ? (
                        <AppErrorState compact>{removeRoleError}</AppErrorState>
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
                                {canEditDirectRoleWindows &&
                                membership.status === 'active' ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setEditingDirectRoleMembership(membership);
                                    }}
                                  >
                                    Edit window
                                  </Button>
                                ) : null}
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
                    <AppEmptyState
                      title="No direct roles"
                      description="No direct roles are currently assigned to this account."
                      compact
                    />
                  )}
                </DetailSection>

                {canReadUserSessions ? (
                  <UserSessionsPanel
                    canRevoke={canRevokeUserSessions}
                    sessionsQuery={userSessionsQuery}
                    isRevokingSession={revokeUserSessionMutation.isPending}
                    isRevokingAll={revokeAllUserSessionsMutation.isPending}
                    revokingSessionId={
                      revokeUserSessionMutation.variables?.sessionId ?? null
                    }
                    onRevokeSession={async (sessionId) => {
                      await revokeUserSessionMutation.mutateAsync({
                        userId,
                        sessionId,
                      })
                    }}
                    onRevokeAll={async () => {
                      await revokeAllUserSessionsMutation.mutateAsync({
                        userId,
                      })
                    }}
                  />
                ) : null}

                {canReadUserApiKeys ? (
                  <DetailSection
                    title="Personal API keys"
                    info={{
                      label: 'Explain personal API keys section',
                      title: 'Personal API keys',
                      content:
                        'These are personal keys owned by this account. Admins can review and revoke them here; key creation stays on the account self-service API keys page.',
                    }}
                  >
                    {userApiKeysQuery.isError ? (
                      <AppErrorState>
                        {getApiErrorMessage(
                          userApiKeysQuery.error,
                          'The personal API keys could not be loaded.',
                        )}
                      </AppErrorState>
                    ) : userApiKeysQuery.isPending ? (
                      <AppEmptyState title="Fetching personal API keys…" compact />
                    ) : userApiKeysQuery.data &&
                      userApiKeysQuery.data.length > 0 ? (
                      <div className="space-y-3">
                        {userApiKeysQuery.data.map((apiKey) => (
                          <div
                            key={apiKey.id}
                            className="rounded-lg border bg-muted/30 px-4 py-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="font-medium">{apiKey.name}</div>
                                  <Badge
                                    variant={
                                      apiKey.status === 'active'
                                        ? 'secondary'
                                        : apiKey.status === 'revoked'
                                          ? 'destructive'
                                          : 'outline'
                                    }
                                  >
                                    {formatToken(apiKey.status)}
                                  </Badge>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  Prefix {apiKey.prefix}
                                  {apiKey.scopes.length > 0
                                    ? ` · ${apiKey.scopes.length} scopes`
                                    : ' · unrestricted scopes'}
                                </div>
                              </div>
                              {canRevokeUserApiKeys &&
                              apiKey.status === 'active' ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={revokeUserApiKeyMutation.isPending}
                                  onClick={() => {
                                    setConfirmingApiKeyId((currentKeyId) =>
                                      currentKeyId === apiKey.id
                                        ? null
                                        : apiKey.id,
                                    );
                                  }}
                                >
                                  Revoke
                                </Button>
                              ) : null}
                            </div>
                            <div className="mt-3 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                              <div className="rounded-lg border bg-background/70 px-3 py-2">
                                <div className="font-medium text-foreground">
                                  Created
                                </div>
                                <div className="mt-1">
                                  {formatDateTime(apiKey.created_at, 'Unknown')}
                                </div>
                              </div>
                              <div className="rounded-lg border bg-background/70 px-3 py-2">
                                <div className="font-medium text-foreground">
                                  Last used
                                </div>
                                <div className="mt-1">
                                  {formatDateTime(apiKey.last_used_at, 'Never')}
                                </div>
                              </div>
                              <div className="rounded-lg border bg-background/70 px-3 py-2">
                                <div className="font-medium text-foreground">
                                  Expires
                                </div>
                                <div className="mt-1">
                                  {formatDateTime(apiKey.expires_at, 'Never')}
                                </div>
                              </div>
                            </div>
                            {confirmingApiKeyId === apiKey.id ? (
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/80 px-3 py-2">
                                <span className="text-sm text-muted-foreground">
                                  Revoke this personal API key immediately?
                                </span>
                                <div className="flex items-center gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={revokeUserApiKeyMutation.isPending}
                                    onClick={() => {
                                      setConfirmingApiKeyId(null);
                                    }}
                                  >
                                    Keep key
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="destructive"
                                    disabled={revokeUserApiKeyMutation.isPending}
                                    onClick={async () => {
                                      try {
                                        await revokeUserApiKeyMutation.mutateAsync(
                                          {
                                            userId,
                                            keyId: apiKey.id,
                                          },
                                        );
                                        setConfirmingApiKeyId(null);
                                      } catch {
                                        return;
                                      }
                                    }}
                                  >
                                    {revokeUserApiKeyMutation.isPending &&
                                    revokeUserApiKeyMutation.variables
                                      ?.keyId === apiKey.id
                                      ? 'Revoking…'
                                      : 'Confirm revoke'}
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <AppEmptyState
                        title="No personal API keys"
                        description="This account has no personal API keys."
                        compact
                      />
                    )}
                  </DetailSection>
                ) : null}
              </div>

              <DetailSection
                title="Permissions"
                info={{
                  label: 'Explain permissions section',
                  title: 'Permissions',
                  content:
                    'This is the resolved permission set after direct roles, memberships, inheritance, and other grant paths are combined. Use Check permissions to evaluate specific names in global or entity context.',
                }}
                action={
                  canCheckPermissions ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setPermissionCheckDialogOpen(true);
                      }}
                    >
                      Check permissions
                    </Button>
                  ) : undefined
                }
              >
                {userPermissionsQuery.isError ? (
                  <AppErrorState>
                    {getApiErrorMessage(
                      userPermissionsQuery.error,
                      'The effective permission set could not be loaded.',
                    )}
                  </AppErrorState>
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
                  <AppEmptyState
                    title="No effective permissions"
                    description="No effective permissions are currently resolved for this user."
                    compact
                  />
                )}
              </DetailSection>
            </div>
  );
}
