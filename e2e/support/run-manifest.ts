import { existsSync, readFileSync } from 'node:fs'
import { runManifestPath } from './env'
import type { PersonaKey, Preset } from './personas'

// What globalSetup learned about the backend, shared with every worker through
// e2e/.auth/run.json (workers are separate processes; this is how they get the preset,
// capabilities and minted personas without re-querying or re-logging in).

export type AuthConfig = {
  library_version?: string
  api_contract_version?: string
  preset?: string
  features?: Record<string, boolean>
  auth_methods?: { password?: boolean, magic_link?: boolean, access_code?: boolean }
  mounted_surfaces?: string[]
}

export type CaptureKind = 'access-code' | 'magic-link' | 'invite' | 'reset-password' | 'phone-verify'

export type MintedPersona = {
  email: string
  userId: string
  source: 'login' | 'reused' | 'provisioned'
}

export type RunManifest = {
  runId: string
  startedAt: string
  apiBaseUrl: string
  appOrigin: string
  backend: boolean
  preset: Preset | null
  authConfig: AuthConfig | null
  capture: Partial<Record<CaptureKind, boolean>>
  personas: Partial<Record<PersonaKey, MintedPersona>>
  // Disposable = the backend exposes its development capture routes (never true in production).
  disposable: boolean
}

export function readRunManifest(): RunManifest | null {
  if (!existsSync(runManifestPath)) return null
  try {
    return JSON.parse(readFileSync(runManifestPath, 'utf8')) as RunManifest
  } catch {
    return null
  }
}
