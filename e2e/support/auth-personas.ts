import path from 'node:path'

export const e2eBaseURL =
  process.env.E2E_BASE_URL ?? 'http://localhost:3000'
export const e2eApiBaseURL =
  process.env.E2E_API_BASE_URL ?? 'http://localhost:8004'
export const authStorageDir = path.join(process.cwd(), 'playwright', '.auth')

export const authPersonas = {
  admin: {
    label: 'Superuser',
    email: 'admin@acme.com',
    password: 'Testpass1!',
    storageState: path.join(authStorageDir, 'admin.json'),
  },
  orgAdmin: {
    label: 'Root-scoped admin',
    email: 'org-admin@acme.com',
    password: 'Testpass1!',
    storageState: path.join(authStorageDir, 'org-admin.json'),
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
} as const

export type AuthPersona = keyof typeof authPersonas
