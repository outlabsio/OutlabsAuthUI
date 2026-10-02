import { personaToken } from './personas'

// The admin persona's access token, minted once per run by globalSetup (no login here).
// Kept for existing specs; new code uses the `api` fixture or `personaToken(key)`.
export function adminAccessToken(): string {
  return personaToken('admin')
}
