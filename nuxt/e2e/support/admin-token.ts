import { readFileSync } from 'node:fs'

// The admin access token minted once by auth.setup.ts and persisted in the storageState file.
// API-seeding tests reuse it instead of logging in again — repeated logins hammer the login
// endpoint's rate limiter (429), which then breaks unrelated auth flows in the same run.
export function adminAccessToken(): string {
  const state = JSON.parse(readFileSync('e2e/.auth/admin.json', 'utf8')) as {
    origins?: Array<{ localStorage?: Array<{ name: string, value: string }> }>
  }
  for (const origin of state.origins ?? []) {
    for (const item of origin.localStorage ?? []) {
      if (item.name === 'outlabs-auth.access-token') return item.value
    }
  }
  throw new Error('admin access token not found in e2e/.auth/admin.json')
}
