import { type ApiClient, ApiRequestError } from './api-client'
import { type PersonaKey, PERSONA_KEYS } from './personas'
import { type NamedRecord, selectCleanupTargets } from './test-data'

// Destructive test-data cleanup, run from globalTeardown after every run (guest-only runs too).
//
// Safety model:
//   1. Opt-in: nothing is deleted unless E2E_ALLOW_DESTRUCTIVE_CLEANUP=1 (the release check sets it).
//   2. Disposable backends only: the backend must expose its development capture routes,
//      which the example apps mount only outside production.
//   3. Scoped to this run: only records carrying this run's marker (test-data.ts), so runs that
//      share a backend never remove each other's data.
// Failures are collected and thrown at the end, so a broken cleanup fails the run visibly.

type Row = NamedRecord & { id: string, status?: string | null, parent_entity_id?: string | null }

type ListedKind = {
  surface: string
  path: string
  query?: Record<string, string>
}

const LISTED: Record<string, ListedKind> = {
  permissions: { surface: 'permissions', path: '/permissions/' },
  roles: { surface: 'roles', path: '/roles/' },
  serviceAccounts: { surface: 'integration_principals', path: '/admin/system/integration-principals', query: { status: 'active' } },
  users: { surface: 'users', path: '/users/' },
  entities: { surface: 'entities', path: '/entities/' }
}

async function listPersonalKeys(client: ApiClient): Promise<Row[]> {
  return client.get<Row[]>('/api-keys/')
}

export type CleanupReport = {
  removed: Record<string, number>
  failures: string[]
}

export async function cleanupRun(options: {
  runId: string
  surfaces: string[]
  admin: ApiClient
  personaClients: Partial<Record<PersonaKey, ApiClient>>
}): Promise<CleanupReport> {
  const { runId, admin, personaClients } = options
  const mounted = new Set(options.surfaces)
  const report: CleanupReport = { removed: {}, failures: [] }

  const remove = async (kind: string, client: ApiClient, path: string) => {
    try {
      await client.delete(path, { allow: [404] })
      report.removed[kind] = (report.removed[kind] ?? 0) + 1
    } catch (error) {
      report.failures.push(error instanceof ApiRequestError ? error.message : `DELETE ${path}: ${String(error)}`)
    }
  }

  const targets = async (kind: string): Promise<Row[]> => {
    const spec = LISTED[kind]!
    if (!mounted.has(spec.surface)) return []
    try {
      return selectCleanupTargets(await admin.listAll<Row>(spec.path, spec.query), runId)
    } catch (error) {
      report.failures.push(`list ${spec.path}: ${error instanceof Error ? error.message : String(error)}`)
      return []
    }
  }

  // Personal API keys first (revoking live credentials matters most), per minted persona.
  if (mounted.has('api_keys')) {
    for (const key of PERSONA_KEYS) {
      const client = personaClients[key]
      if (!client) continue
      try {
        const keys = selectCleanupTargets(await listPersonalKeys(client), runId)
        for (const row of keys) await remove('api_keys', client, `/api-keys/${row.id}`)
      } catch (error) {
        report.failures.push(`list /api-keys/ as ${key}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  for (const row of await targets('permissions')) await remove('permissions', admin, `/permissions/${row.id}`)
  for (const row of await targets('roles')) await remove('roles', admin, `/roles/${row.id}`)
  for (const row of await targets('serviceAccounts')) await remove('service_accounts', admin, `/admin/system/integration-principals/${row.id}`)
  for (const row of await targets('users')) await remove('users', admin, `/users/${row.id}`)

  // Entities: archive their active service accounts first (they block the delete), then remove
  // deepest-first so a parent goes after its children.
  const entities = await targets('entities')
  for (const entity of entities) {
    try {
      const accounts = await admin.listAll<Row>(`/admin/entities/${entity.id}/integration-principals`, { status: 'active' })
      for (const account of accounts) {
        await remove('entity_service_accounts', admin, `/admin/entities/${entity.id}/integration-principals/${account.id}`)
      }
    } catch (error) {
      report.failures.push(`list service accounts of entity ${entity.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const byId = new Map(entities.map(e => [e.id, e]))
  const depth = (entity: Row) => {
    let d = 0
    let current: Row | undefined = entity
    while (current?.parent_entity_id && byId.has(current.parent_entity_id)) {
      d++
      current = byId.get(current.parent_entity_id)
    }
    return d
  }
  for (const entity of [...entities].sort((a, b) => depth(b) - depth(a))) {
    await remove('entities', admin, `/entities/${entity.id}`)
  }

  return report
}
