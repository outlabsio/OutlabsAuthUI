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
    dashboard: '/app/dashboard',
    users: '/app/users',
    userDetail: '/app/users/$userId',
    entities: '/app/entities',
    entityDetail: '/app/entities/$entityId',
  },
} as const
