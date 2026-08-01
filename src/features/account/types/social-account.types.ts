export type SocialAccount = {
  id: string
  provider: string
  provider_user_id: string
  email: string
  email_verified: boolean
  display_name?: string | null
  avatar_url?: string | null
  linked_at: string
  last_used_at?: string | null
}
