import path from 'node:path'

function ensureLeadingSlash(value: string) {
  return value.startsWith('/') ? value : `/${value}`
}

function normalizePath(value: string) {
  return value.startsWith('/') ? value : `/${value}`
}

export const e2eBaseURL =
  process.env.E2E_BASE_URL ?? 'http://localhost:3000'
export const e2eApiBaseURL =
  process.env.E2E_API_BASE_URL ?? 'http://localhost:8004'
export const e2eAuthApiPrefix = ensureLeadingSlash(
  process.env.E2E_AUTH_API_PREFIX ?? '/v1'
)
export const authStorageDir = path.join(process.cwd(), 'playwright', '.auth')

export const authPersonas = {
  admin: {
    label: 'Superuser',
    email: process.env.E2E_ADMIN_EMAIL ?? 'admin@acme.com',
    password: process.env.E2E_ADMIN_PASSWORD ?? 'Testpass1!',
    storageState: path.join(authStorageDir, 'admin.json'),
  },
  orgAdmin: {
    label: 'Root-scoped admin',
    email: 'org-admin@acme.com',
    password: 'Testpass1!',
    storageState: path.join(authStorageDir, 'org-admin.json'),
  },
  permissionAdmin: {
    label: 'Permission catalog admin',
    email: 'permissions-admin@acme.com',
    password: 'Testpass1!',
    storageState: path.join(authStorageDir, 'permission-admin.json'),
  },
  regionalAdmin: {
    label: 'West Coast scoped admin',
    email: 'regional-admin@acme.com',
    password: 'Testpass1!',
    storageState: path.join(authStorageDir, 'regional-admin.json'),
  },
  officeAdmin: {
    label: 'SF office scoped admin',
    email: 'manager@sf.acme.com',
    password: 'Testpass1!',
    storageState: path.join(authStorageDir, 'office-admin.json'),
  },
  eastAdmin: {
    label: 'East Coast scoped admin',
    email: 'east-admin@acme.com',
    password: 'Testpass1!',
    storageState: path.join(authStorageDir, 'east-admin.json'),
  },
  auditor: {
    label: 'Read-only auditor',
    email: 'auditor@acme.com',
    password: 'Testpass1!',
    storageState: path.join(authStorageDir, 'auditor.json'),
  },
  teamLead: {
    label: 'Operational team lead',
    email: 'lead@sf.acme.com',
    password: 'Testpass1!',
    storageState: path.join(authStorageDir, 'team-lead.json'),
  },
  agent: {
    label: 'Residential agent',
    email: 'agent@sf.acme.com',
    password: 'Testpass1!',
    storageState: path.join(authStorageDir, 'agent.json'),
  },
  commercialAgent: {
    label: 'Commercial agent',
    email: 'commercial@sf.acme.com',
    password: 'Testpass1!',
    storageState: path.join(authStorageDir, 'commercial-agent.json'),
  },
  summitAdmin: {
    label: 'Second root admin',
    email: 'summit-admin@summit.com',
    password: 'Testpass1!',
    storageState: path.join(authStorageDir, 'summit-admin.json'),
  },
} as const

export type AuthPersona = keyof typeof authPersonas

export function buildE2eAuthApiUrl(pathname: string) {
  const normalizedPath = normalizePath(pathname)
  const authPath = normalizedPath.startsWith(e2eAuthApiPrefix)
    ? normalizedPath
    : `${e2eAuthApiPrefix}${normalizedPath}`
  return `${e2eApiBaseURL}${authPath}`
}

export const requestedAuthPersonas: AuthPersona[] = (() => {
  const rawValue = process.env.E2E_PERSONAS?.trim()

  if (!rawValue) {
    return Object.keys(authPersonas) as AuthPersona[]
  }

  const selected = rawValue
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const personaKeys = Object.keys(authPersonas) as AuthPersona[]
  const invalid = selected.filter(
    (value) => !personaKeys.includes(value as AuthPersona)
  )

  if (invalid.length > 0) {
    throw new Error(`Unknown E2E personas: ${invalid.join(', ')}`)
  }

  return selected as AuthPersona[]
})()
