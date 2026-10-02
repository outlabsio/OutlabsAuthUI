import { readFileSync } from 'node:fs'
import { ACCESS_TOKEN_KEY, authStateDir } from './env'
import { readRunManifest } from './run-manifest'

// Personas, resolved in one place by the backend preset (GET /auth/config → `preset`).
// globalSetup signs each available persona in ONCE through the API and writes a Playwright
// storage state per persona (e2e/.auth/<file>.json); specs never log in to get a session.
//
// Credentials default to the example apps' seeds (outlabsAuth examples/*_rbac/reset_test_env.py)
// and can be overridden per persona with E2E_<PERSONA>_EMAIL / E2E_<PERSONA>_PASSWORD, e.g.
// E2E_ADMIN_EMAIL, E2E_AGENT_PASSWORD, E2E_ORG_ADMIN_EMAIL, E2E_WRITER_EMAIL.
//
// Add a persona by adding it to PERSONA_KEYS and the preset seed tables below; globalSetup
// picks it up automatically (each extra seeded persona costs one password login per run).
//
// Provisioned personas (PROVISIONED_PERSONAS) are not in either seed: globalSetup creates a
// run-marked account through the admin API every run (invite acceptance where the backend
// captures invites, so no password login; one login otherwise) and the run's cleanup removes it.

export type Preset = 'EnterpriseRBAC' | 'SimpleRBAC'

export const PERSONA_KEYS = [
  'admin',
  'agent',
  'orgAdmin',
  'writer',
  'summitAdmin',
  'auditor',
  'permissionsAdmin',
  'globalAdmin'
] as const
export type PersonaKey = (typeof PERSONA_KEYS)[number]

type PersonaSeed = { email: string, password: string, role: string }

const ENTERPRISE_PASSWORD = 'Testpass1!'
const SIMPLE_PASSWORD = 'Test123!!'

export const PRESET_PERSONAS: Record<Preset, Partial<Record<PersonaKey, PersonaSeed>>> = {
  EnterpriseRBAC: {
    admin: { email: 'admin@acme.com', password: ENTERPRISE_PASSWORD, role: 'superuser' },
    agent: { email: 'agent@sf.acme.com', password: ENTERPRISE_PASSWORD, role: 'low privilege (lead permissions only)' },
    orgAdmin: { email: 'org-admin@acme.com', password: ENTERPRISE_PASSWORD, role: 'delegated organization admin (not a superuser)' },
    summitAdmin: { email: 'summit-admin@summit.com', password: ENTERPRISE_PASSWORD, role: 'delegated admin of the second organization' },
    auditor: { email: 'auditor@acme.com', password: ENTERPRISE_PASSWORD, role: 'read-only organization auditor' },
    permissionsAdmin: { email: 'permissions-admin@acme.com', password: ENTERPRISE_PASSWORD, role: 'global permission-catalog admin (not a superuser)' }
  },
  SimpleRBAC: {
    admin: { email: 'admin@test.com', password: SIMPLE_PASSWORD, role: 'superuser' },
    agent: { email: 'writer@test.com', password: SIMPLE_PASSWORD, role: 'low privilege' },
    writer: { email: 'writer@test.com', password: SIMPLE_PASSWORD, role: 'low privilege (writer role)' }
  }
}

// Not seeded: globalSetup provisions these through the admin API (see the header).
//   globalAdmin — a non-superuser holding the seed's system-wide `admin` role directly. On
//                 EnterpriseRBAC the account belongs to the admin persona's organization (the
//                 "global admin inside an organization" case); on SimpleRBAC it is the
//                 non-superuser admin the seed lacks.
export const PROVISIONED_PERSONAS: Partial<Record<PersonaKey, { roleName: string, role: string }>> = {
  globalAdmin: { roleName: 'admin', role: 'non-superuser holding the system-wide admin role' }
}

export function isProvisionedPersona(key: PersonaKey): boolean {
  return key in PROVISIONED_PERSONAS
}

export function isKnownPreset(value: unknown): value is Preset {
  return value === 'EnterpriseRBAC' || value === 'SimpleRBAC'
}

function envKey(key: PersonaKey) {
  return key.replace(/[A-Z]/g, c => `_${c}`).toUpperCase()
}

function fileName(key: PersonaKey) {
  return key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)
}

export type ResolvedPersona = {
  key: PersonaKey
  email: string
  password: string
  // Available = the preset seeds it or the environment supplies credentials for it.
  available: boolean
  storageState: string
}

// The E2E_<PERSONA>_EMAIL / E2E_<PERSONA>_PASSWORD variables set in `env`: persona credentials
// that replace the reference seeds' (another backend's accounts). Empty on the reference seeds.
export function personaOverrides(env: NodeJS.ProcessEnv = process.env): string[] {
  return PERSONA_KEYS.flatMap(key => ['EMAIL', 'PASSWORD'].map(field => `E2E_${envKey(key)}_${field}`))
    .filter(name => Boolean(env[name]?.trim()))
}

// Resolve a persona for a preset (null = unknown/custom backend: env credentials only).
export function resolvePersona(key: PersonaKey, preset: Preset | null, env: NodeJS.ProcessEnv = process.env): ResolvedPersona {
  const seed = preset ? PRESET_PERSONAS[preset][key] : undefined
  const email = env[`E2E_${envKey(key)}_EMAIL`]?.trim() || seed?.email || ''
  const password = env[`E2E_${envKey(key)}_PASSWORD`] || seed?.password || ''
  return {
    key,
    email,
    password,
    // A provisioned persona is available on any known preset (globalSetup creates it).
    available: Boolean(email && password) || (Boolean(preset) && isProvisionedPersona(key)),
    storageState: personaState(key)
  }
}

// Absolute path of a persona's storage state. Always exists after globalSetup (an empty state
// for personas the backend does not have), so `test.use({ storageState: personaState(k) })`
// never breaks context creation; pair it with `requires({ personas: [k] })` to skip cleanly.
export function personaState(key: PersonaKey): string {
  return `${authStateDir}${fileName(key)}.json`
}

// The persona as resolved for THIS run's backend (preset read from the run manifest).
export function persona(key: PersonaKey): ResolvedPersona {
  const manifest = readRunManifest()
  const resolved = resolvePersona(key, manifest?.preset ?? null)
  const minted = manifest?.personas[key]
  return minted ? { ...resolved, email: minted.email, available: true } : { ...resolved, available: false }
}

// The persona's API access token, read from its minted storage state (no login).
export function personaToken(key: PersonaKey): string {
  const state = JSON.parse(readFileSync(personaState(key), 'utf8')) as {
    origins?: Array<{ localStorage?: Array<{ name: string, value: string }> }>
  }
  for (const origin of state.origins ?? []) {
    for (const item of origin.localStorage ?? []) {
      if (item.name === ACCESS_TOKEN_KEY && item.value) return item.value
    }
  }
  throw new Error(`No session minted for persona "${key}" (see e2e/.auth/run.json and the globalSetup log).`)
}

// Map an email back to a minted persona (lets legacy helpers reuse sessions instead of logging in).
export function personaByEmail(email: string): PersonaKey | null {
  const manifest = readRunManifest()
  if (!manifest) return null
  const needle = email.trim().toLowerCase()
  for (const key of PERSONA_KEYS) {
    if (manifest.personas[key]?.email.toLowerCase() === needle) return key
  }
  return null
}
