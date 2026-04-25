export const authKeys = {
  all: ['auth'] as const,
  acceptInvite: () => [...authKeys.all, 'accept-invite'] as const,
  config: () => [...authKeys.all, 'config'] as const,
  forgotPassword: () => [...authKeys.all, 'forgot-password'] as const,
  login: () => [...authKeys.all, 'login'] as const,
  magicLinkRequest: () => [...authKeys.all, 'magic-link-request'] as const,
  magicLinkVerify: () => [...authKeys.all, 'magic-link-verify'] as const,
  myPermissions: () => [...authKeys.all, 'my-permissions'] as const,
  resetPassword: () => [...authKeys.all, 'reset-password'] as const,
  session: () => [...authKeys.all, 'session'] as const,
}
