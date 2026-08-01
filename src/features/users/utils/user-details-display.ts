import type { AppStatusTone } from '@/components/app/app-status';
import {
  formatMembershipToken,
} from '@/features/memberships/utils/membership-display';
import type {
  User,
  UserAuditEvent,
  UserMembershipHistoryEvent,
  UserPermissionSource,
  UserStatusValue,
} from '@/features/users/types/users.types';

export function getUserDisplayName(
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

export function getUserInitials(
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

export function formatDateTime(value?: string | null, fallback = 'Never') {
  if (!value) {
    return fallback;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatToken(value?: string | null, fallback = 'General') {
  if (!value) {
    return fallback;
  }

  return value
    .split(/[_:-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getStatusTone(status: UserStatusValue): AppStatusTone {
  switch (status) {
    case 'active':
      return 'success';
    case 'suspended':
      return 'warning';
    case 'banned':
      return 'error';
    case 'invited':
      return 'info';
    case 'deleted':
    default:
      return status === 'deleted' ? 'error' : 'neutral';
  }
}

export function toDateTimeLocalValue(value?: string | null) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function getStringValue(record: unknown, key: string) {
  const resolvedRecord = asRecord(record);
  const value = resolvedRecord?.[key];

  return typeof value === 'string' && value.trim() ? value : null;
}

export function getStringArrayValue(record: unknown, key: string) {
  const resolvedRecord = asRecord(record);
  const value = resolvedRecord?.[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

export function getBooleanValue(record: unknown, key: string) {
  const resolvedRecord = asRecord(record);
  const value = resolvedRecord?.[key];

  return typeof value === 'boolean' ? value : null;
}

export function getAuditEventSummary(event: UserAuditEvent) {
  const beforeStatus = getStringValue(event.before, 'status');
  const afterStatus = getStringValue(event.after, 'status');
  const beforeSuperuser = getBooleanValue(event.before, 'is_superuser');
  const afterSuperuser = getBooleanValue(event.after, 'is_superuser');
  const entityDisplayName =
    getStringValue(event.metadata, 'entity_display_name') ??
    getStringValue(event.metadata, 'entity_name');
  const changedFields = getStringArrayValue(event.metadata, 'changed_fields');

  if (beforeStatus && afterStatus && beforeStatus !== afterStatus) {
    return `${formatToken(beforeStatus)} -> ${formatToken(afterStatus)}`;
  }

  if (
    beforeSuperuser !== null &&
    afterSuperuser !== null &&
    beforeSuperuser !== afterSuperuser
  ) {
    return afterSuperuser ? 'Superuser granted' : 'Superuser revoked';
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

export function getAuditEventTone(event: UserAuditEvent): AppStatusTone {
  const afterStatus = getStringValue(event.after, 'status');
  const afterSuperuser = getBooleanValue(event.after, 'is_superuser');

  switch (afterStatus) {
    case 'active':
      return 'success';
    case 'suspended':
      return 'warning';
    case 'banned':
    case 'deleted':
    case 'revoked':
      return 'error';
    default:
      if (afterSuperuser === true) {
        return 'success';
      }

      if (afterSuperuser === false) {
        return 'warning';
      }

      return 'neutral';
  }
}

export function getMembershipHistorySummary(event: UserMembershipHistoryEvent) {
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

export function groupPermissionsByResource(permissionSources: UserPermissionSource[]) {
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
