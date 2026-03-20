export const routes = {
  home: '/',
  auth: {
    login: '/auth/login',
    register: '/auth/register',
    forgotPassword: '/auth/forgot-password',
    resetPassword: '/auth/reset-password',
    acceptInvite: '/auth/accept-invite',
  },
  app: {
    account: '/app/account',
    dashboard: '/app/dashboard',
    apiKeys: '/app/api-keys',
    settings: '/app/settings',
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
