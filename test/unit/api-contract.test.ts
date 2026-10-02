import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ROUTES_OUTSIDE_SNAPSHOT,
  compareRoutes,
  extractClientRoutes,
  resolvePathExpression
} from '../../scripts/lib/client-routes.mjs'
import { buildSnapshot, renderApiTypes, snapshotRoutes } from '../../scripts/lib/openapi-snapshot.mjs'

// The API contract (F-135, F-088): every route the console calls must exist in the checked-in
// OpenAPI snapshot of the outlabs-auth release it targets, with the same method and the same
// trailing-slash form (the API answers the other form with a 307 redirect, which can drop the
// request body and breaks behind proxies). The generated wire types must match the snapshot.

const root = fileURLToPath(new URL('../../', import.meta.url))
const snapshot = JSON.parse(readFileSync(path.join(root, 'openapi/outlabs-auth.openapi.json'), 'utf8'))
const apiRoutes = snapshotRoutes(snapshot)

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    return statSync(full).isDirectory() ? sourceFiles(full) : [full]
  })
}

const appFiles = sourceFiles(path.join(root, 'app'))
  .filter(file => /\.(ts|vue)$/.test(file) && !file.endsWith('.gen.ts'))
  .map(file => ({ file: path.relative(root, file).split(path.sep).join('/'), source: readFileSync(file, 'utf8') }))
const { routes: clientRoutes, unresolved } = extractClientRoutes(appFiles)

// Surfaces only EnterpriseRBAC mounts, and entity-scoped routes of shared surfaces (entity-scoped
// service accounts): the console gates every call to them on isEnterprise / hasSurface /
// hasMemberships, so they need not exist on SimpleRBAC.
const ENTERPRISE_ONLY_SURFACES = new Set(['entities', 'memberships', 'config', 'api_key_admin', 'audit'])
const ENTITY_SCOPED_PATH = /^\/admin\/entities\//

describe('client routes against the OpenAPI snapshot', () => {
  it('resolves every path the console builds', () => {
    expect(unresolved).toEqual([])
    expect(clientRoutes.length).toBeGreaterThan(80)
  })

  it('calls only routes the API has, with the right method and trailing slash', () => {
    const problems = compareRoutes(clientRoutes, apiRoutes).map(p => `${p.method} ${p.path} (${p.file}:${p.line}): ${p.problem}`)
    expect(problems).toEqual([])
  })

  it('keeps the list of routes outside the snapshot current', () => {
    const called = new Set(clientRoutes.map(r => `${r.method} ${r.path}`))
    for (const route of Object.keys(ROUTES_OUTSIDE_SNAPSHOT)) expect(called, route).toContain(route)
  })

  it('only calls enterprise-only surfaces for routes both presets lack', () => {
    const byKey = new Map(apiRoutes.map(r => [`${r.method} ${r.path.replace(/\{[^}]+\}/g, '{param}')}`, r]))
    const missingOnSimple: string[] = []
    for (const route of clientRoutes) {
      const api = byKey.get(`${route.method} ${route.path}`)
      if (!api || api.presets.includes('SimpleRBAC')) continue
      if (ENTITY_SCOPED_PATH.test(route.path)) continue
      if (!api.surfaces.every(surface => ENTERPRISE_ONLY_SURFACES.has(surface))) missingOnSimple.push(`${route.method} ${route.path}`)
    }
    expect([...new Set(missingOnSimple)]).toEqual([])
  })

  it('catches a trailing-slash drift, an unknown method and an unknown route', () => {
    const { routes } = extractClientRoutes([{
      file: 'x.ts',
      source: [
        'apiClient.get<ApiKey[]>(\'/api-keys\', { signal })',
        'apiClient.put<Role>(`/roles/${roleId}`, { body })',
        'apiClient.get(`/nope/${id}?x=1`)'
      ].join('\n')
    }])
    expect(compareRoutes(routes, apiRoutes).map(p => p.problem)).toEqual([
      'trailing slash: the API route is /api-keys/',
      'the API route accepts DELETE, GET, PATCH only',
      'no such API route'
    ])
  })

  it('resolves template paths, query strings and computed prefixes', () => {
    expect(resolvePathExpression('`/users/${userId}/role-memberships${params.includeInactive ? \'?include_inactive=true\' : \'\'}`'))
      .toEqual(['/users/{param}/role-memberships'])
    expect(resolvePathExpression('`/users/?${buildUsersQueryString(filters)}`')).toEqual(['/users/'])
    expect(resolvePathExpression('withFrontendProfileQuery(`/oauth/${provider}/authorize`)')).toEqual(['/oauth/{param}/authorize'])
    expect(resolvePathExpression('`${principalsBase(scope)}/${principalId}/api-keys`')).toEqual([
      '/admin/entities/{param}/integration-principals/{param}/api-keys',
      '/admin/system/integration-principals/{param}/api-keys'
    ])
    expect(resolvePathExpression('somePath')).toBeNull()
  })
})

describe('OpenAPI snapshot', () => {
  it('describes the targeted library release and its routes only', () => {
    expect(snapshot.info.version).toBe('0.1.0a34')
    for (const route of apiRoutes) {
      expect(route.surfaces.length, `${route.method} ${route.path}`).toBeGreaterThan(0)
      expect(route.path.startsWith('/v1')).toBe(false)
    }
  })

  it('drops host routes and the schemas only they use', () => {
    const { snapshot: built } = buildSnapshot([{
      preset: 'EnterpriseRBAC',
      spec: {
        paths: {
          '/v1/users/': { get: { 'x-outlabs-auth-surface': ['users'], 'tags': ['users'], 'responses': { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/UserResponse' } } } } } } },
          '/v1/leads': { get: { responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/LeadResponse' } } } } } } },
          '/health': { get: { responses: {} } }
        },
        components: { schemas: { UserResponse: { type: 'object' }, LeadResponse: { type: 'object' } } }
      }
    }], { version: '9.9.9' })
    expect(Object.keys(built.paths)).toEqual(['/users/'])
    expect(Object.keys(built.components.schemas)).toEqual(['UserResponse'])
    expect(built.paths['/users/']?.get?.tags).toBeUndefined()
    expect(built.paths['/users/']?.['x-outlabs-auth-presets']).toEqual(['EnterpriseRBAC'])
  })

  it('matches the generated wire types (run `bun run gen:api-types` after a refresh)', async () => {
    const committed = readFileSync(path.join(root, 'app/types/api.gen.ts'), 'utf8')
    expect(await renderApiTypes(snapshot)).toBe(committed)
  }, 30_000)
})
