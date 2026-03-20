export const accountKeys = {
  all: ['account'] as const,
  changePassword: () => [...accountKeys.all, 'change-password'] as const,
  updateProfile: () => [...accountKeys.all, 'update-profile'] as const,
}
