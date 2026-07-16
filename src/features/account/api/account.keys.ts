export const accountKeys = {
  all: ['account'] as const,
  changePassword: () => [...accountKeys.all, 'change-password'] as const,
  updateProfile: () => [...accountKeys.all, 'update-profile'] as const,
  requestPhoneVerification: () =>
    [...accountKeys.all, 'request-phone-verification'] as const,
  confirmPhoneVerification: () =>
    [...accountKeys.all, 'confirm-phone-verification'] as const,
}
