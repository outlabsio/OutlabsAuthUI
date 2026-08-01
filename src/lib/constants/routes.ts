export const routes = {
  home: '/',
  auth: {
    login: '/auth/login',
    forgotPassword: '/auth/forgot-password',
    magicLink: '/auth/magic-link',
    accessCode: '/auth/access-code',
    resetPassword: '/auth/reset-password',
    acceptInvite: '/auth/accept-invite',
    oauthCallback: '/auth/oauth/callback',
  },
  app: {
    account: '/app/account',
    dashboard: '/app/dashboard',
    apiKeys: '/app/api-keys',
    audit: '/app/audit',
    settings: '/app/settings',
    systemApiKeys: '/app/users/api-keys',
    users: '/app/users',
    userDetail: '/app/users/$userId',
    permissions: '/app/permissions',
    permissionDetail: '/app/permissions/$permissionId',
    roles: '/app/roles',
    roleDetail: '/app/roles/$roleId',
    entities: '/app/entities',
    entityDetail: '/app/entities/$entityId',
  },
} as const

