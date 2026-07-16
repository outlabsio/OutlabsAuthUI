import { Controller, type UseFormReturn } from 'react-hook-form';
import { KeyRound, Shield } from 'lucide-react';

import { AppDateTimePicker } from '@/components/app/app-date-time-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { DetailSection } from '@/features/users/components/user-details-section';
import { useResendInviteMutation } from '@/features/users/hooks/use-resend-invite-mutation';
import { useRestoreUserMutation } from '@/features/users/hooks/use-restore-user-mutation';
import { useUpdateUserMutation } from '@/features/users/hooks/use-update-user-mutation';
import { useUpdateUserStatusMutation } from '@/features/users/hooks/use-update-user-status-mutation';
import { useUpdateUserSuperuserMutation } from '@/features/users/hooks/use-update-user-superuser-mutation';
import type { UpdateUserProfileFormValues } from '@/features/users/schemas/update-user-profile.schema';
import type { UpdateUserStatusFormValues } from '@/features/users/schemas/update-user-status.schema';
import type {
  User,
  UserStatusUpdateValue,
} from '@/features/users/types/users.types';
import { formatDateTime } from '@/features/users/utils/user-details-display';

const statusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Banned', value: 'banned' },
] satisfies Array<{ label: string; value: UserStatusUpdateValue }>;

type UserDetailsMainTabProps = {
  userId: string;
  user: User;
  sessionUserId?: string | null;
  isSuperuserActor: boolean;
  isSelfUser: boolean;
  canUpdateUsers: boolean;
  canResendInvite: boolean;
  canRestoreUser: boolean;
  canDeleteThisUser: boolean;
  canResetPassword: boolean;
  canChangeSuperuserAccess: boolean;
  userStatusFeatureEnabled: boolean;
  activityTrackingFeatureEnabled: boolean;
  profileForm: UseFormReturn<UpdateUserProfileFormValues>;
  statusForm: UseFormReturn<UpdateUserStatusFormValues>;
  watchedStatus: UpdateUserStatusFormValues['status'];
  updateUserMutation: ReturnType<typeof useUpdateUserMutation>;
  updateUserStatusMutation: ReturnType<typeof useUpdateUserStatusMutation>;
  resendInviteMutation: ReturnType<typeof useResendInviteMutation>;
  restoreUserMutation: ReturnType<typeof useRestoreUserMutation>;
  updateUserSuperuserMutation: ReturnType<typeof useUpdateUserSuperuserMutation>;
  profileError: string | null;
  statusError: string | null;
  resendInviteError: string | null;
  restoreUserError: string | null;
  superuserAccessError: string | null;
  onOpenSuperuserConfirm: () => void;
  onOpenDeleteUser: () => void;
  onOpenResetPassword: () => void;
};

export function UserDetailsMainTab({
  userId,
  user,
  sessionUserId,
  isSuperuserActor,
  isSelfUser,
  canUpdateUsers,
  canResendInvite,
  canRestoreUser,
  canDeleteThisUser,
  canResetPassword,
  canChangeSuperuserAccess,
  userStatusFeatureEnabled,
  activityTrackingFeatureEnabled,
  profileForm,
  statusForm,
  watchedStatus,
  updateUserMutation,
  updateUserStatusMutation,
  resendInviteMutation,
  restoreUserMutation,
  updateUserSuperuserMutation,
  profileError,
  statusError,
  resendInviteError,
  restoreUserError,
  superuserAccessError,
  onOpenSuperuserConfirm,
  onOpenDeleteUser,
  onOpenResetPassword,
}: UserDetailsMainTabProps) {
  return (
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
                          phone: values.phone.trim() ? values.phone.trim() : null,
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
                    <div className="space-y-2">
                      <Label htmlFor="user-detail-phone">WhatsApp phone</Label>
                      <Input
                        id="user-detail-phone"
                        type="tel"
                        placeholder="+15551234567"
                        disabled={!canUpdateUsers || updateUserMutation.isPending}
                        {...profileForm.register('phone')}
                      />
                      <p className="text-xs text-muted-foreground">
                        Optional E.164 delivery number for access codes.
                        {user.phone
                          ? user.phone_verified
                            ? ' Currently verified.'
                            : ' Currently unverified.'
                          : ''}
                      </p>
                      <FieldError errors={[profileForm.formState.errors.phone]} />
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
                  title="Superuser access"
                  info={{
                    label: 'Explain superuser access section',
                    title: 'Superuser access',
                    content:
                      'Superuser access is a platform-wide account flag, not a role. Only current superusers can grant or revoke it.',
                  }}
                  action={
                    <Button
                      type="button"
                      size="sm"
                      variant={user.is_superuser ? 'destructive' : 'outline'}
                      disabled={
                        !canChangeSuperuserAccess ||
                        updateUserSuperuserMutation.isPending
                      }
                      onClick={() => {
                        onOpenSuperuserConfirm();
                      }}
                    >
                      {user.is_superuser ? 'Remove superuser' : 'Grant superuser'}
                    </Button>
                  }
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <Shield className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <div className="space-y-1">
                          <div className="text-sm font-medium">
                            Current access
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {user.is_superuser
                              ? 'Platform-wide administrative access is active.'
                              : 'This account follows roles, memberships, and regular permissions.'}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={user.is_superuser ? 'secondary' : 'outline'}
                      >
                        {user.is_superuser ? 'Superuser' : 'Standard user'}
                      </Badge>
                    </div>

                    {!isSuperuserActor ? (
                      <div className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                        Your account can view this flag, but only superusers can
                        change it.
                      </div>
                    ) : null}
                    {isSelfUser && user.is_superuser ? (
                      <div className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                        You cannot revoke your own superuser access from this
                        screen.
                      </div>
                    ) : null}
                    {user.status === 'deleted' ? (
                      <div className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                        Restore this user before changing superuser access.
                      </div>
                    ) : null}
                    {superuserAccessError ? (
                      <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        {superuserAccessError}
                      </div>
                    ) : null}
                  </div>
                </DetailSection>

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
                        onOpenDeleteUser();
                      }}
                    >
                      Delete user
                    </Button>
                  }
                >
                  <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {sessionUserId === userId
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
                        onOpenResetPassword();
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
  );
}
