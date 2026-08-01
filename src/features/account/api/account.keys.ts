export const accountKeys = {
  all: ['account'] as const,
  changePassword: () => [...accountKeys.all, 'change-password'] as const,
  updateProfile: () => [...accountKeys.all, 'update-profile'] as const,
  requestPhoneVerification: () =>
    [...accountKeys.all, 'request-phone-verification'] as const,
  confirmPhoneVerification: () =>
    [...accountKeys.all, 'confirm-phone-verification'] as const,
  sessions: () => [...accountKeys.all, 'sessions'] as const,
  revokeSession: () => [...accountKeys.all, 'revoke-session'] as const,
  revokeAllSessions: () => [...accountKeys.all, 'revoke-all-sessions'] as const,
  socialAccounts: () => [...accountKeys.all, 'social-accounts'] as const,
  unlinkSocialAccount: () => [...accountKeys.all, 'unlink-social-account'] as const,
  startOAuthAssociate: () => [...accountKeys.all, 'start-oauth-associate'] as const,
}
