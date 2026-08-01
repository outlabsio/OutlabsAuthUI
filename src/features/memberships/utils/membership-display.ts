import type { AppStatusTone } from '@/components/app/app-status'

export function formatMembershipToken(value?: string | null, fallback = 'Unknown') {
  if (!value) {
    return fallback
  }

  return value
    .split(/[_:-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function getMembershipStatusTone(status?: string | null): AppStatusTone {
  switch (status) {
    case 'active':
      return 'success'
    case 'pending':
      return 'info'
    case 'expired':
      return 'warning'
    case 'suspended':
    case 'revoked':
    case 'rejected':
      return 'error'
    default:
      return 'neutral'
  }
}
