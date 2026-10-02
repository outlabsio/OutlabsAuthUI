import type { ResponseBody, Schemas } from '~/types/wire'

// The actor's own account. Response shapes derive from the generated wire types (types/wire.ts).

export type UserSession = ResponseBody<Schemas['UserSessionResponse']>

export type UpdateCurrentUserInput = {
  email?: string
  first_name?: string
  last_name?: string
  phone?: string | null
}

export type ChangeCurrentUserPasswordInput = {
  current_password: string
  new_password: string
}

// A linked OAuth/social account (GET /users/me/social-accounts — SocialAccountResponse).
export type SocialAccount = ResponseBody<Schemas['SocialAccountResponse']>
