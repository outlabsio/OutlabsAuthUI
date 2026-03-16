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

export function getMembershipStatusVariant(status?: string | null) {
  switch (status) {
    case 'active':
      return 'secondary' as const
    case 'suspended':
    case 'revoked':
      return 'destructive' as const
    case 'expired':
    case 'pending':
    case 'rejected':
    default:
      return 'outline' as const
  }
}
