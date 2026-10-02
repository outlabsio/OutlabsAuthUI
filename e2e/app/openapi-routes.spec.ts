import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareRoutes, extractClientRoutes, normalizeTemplatePath } from '../../scripts/lib/client-routes.mjs'
import { buildSnapshot, snapshotRoutes } from '../../scripts/lib/openapi-snapshot.mjs'
import { liveAuthConfig } from '../support/capabilities'
import { apiUrl, authApiPrefix, backendConfigured, backendUrl } from '../support/env'
import { expect, personaToken, test } from '../support/fixtures'

// The console's routes against the backend it runs with (F-135, F-088). The unit contract test
// pins them to the checked-in snapshot; this spec checks the live /openapi.json, so a backend
// release that renames a route, changes a method or flips a trailing slash fails here on both
// presets. Routes of surfaces the backend does not mount are skipped: the console gates them.

const root = fileURLToPath(new URL('../../', import.meta.url))
const snapshot = JSON.parse(readFileSync(path.join(root, 'openapi/outlabs-auth.openapi.json'), 'utf8'))
const snapshotByRoute = new Map(snapshotRoutes(snapshot).map(r => [`${r.method} ${normalizeTemplatePath(r.path)}`, r]))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    return statSync(full).isDirectory() ? sourceFiles(full) : [full]
  })
}

const clientRoutes = extractClientRoutes(sourceFiles(path.join(root, 'app'))
  .filter(file => /\.(ts|vue)$/.test(file) && !file.endsWith('.gen.ts'))
  .map(file => ({ file: path.relative(root, file).split(path.sep).join('/'), source: readFileSync(file, 'utf8') }))).routes

// Entity-scoped routes of shared surfaces exist only where the entities router is mounted.
const ENTITY_SCOPED_PATH = /^\/admin\/entities\//

async function liveContract() {
  const response = await fetch(backendUrl('/openapi.json'))
  if (!response.ok) return null
  const { snapshot: live } = buildSnapshot([{ preset: 'live', spec: await response.json() }], { prefix: authApiPrefix, version: 'live' })
  return snapshotRoutes(live)
}

test.describe('client routes against the live API', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('every mounted route the console calls exists with its method and trailing slash', async () => {
    const liveRoutes = await liveContract()
    test.skip(!liveRoutes, 'The backend does not publish /openapi.json.')
    const mounted = new Set((await liveAuthConfig())?.mounted_surfaces ?? [])
    const expected = clientRoutes.filter((route) => {
      const known = snapshotByRoute.get(`${route.method} ${route.path}`)
      if (!known) return false // outside the snapshot (optional routers); the unit test lists them
      if (ENTITY_SCOPED_PATH.test(route.path) && !mounted.has('entities')) return false
      return known.surfaces.every(surface => mounted.has(surface))
    })
    expect(expected.length).toBeGreaterThan(30)
    const problems = compareRoutes(expected, liveRoutes!).map(p => `${p.method} ${p.path} (${p.file}:${p.line}): ${p.problem}`)
    expect(problems).toEqual([])
  })

  test('no read the console makes is answered with a redirect', async () => {
    const liveRoutes = await liveContract()
    test.skip(!liveRoutes, 'The backend does not publish /openapi.json.')
    const live = new Set(liveRoutes!.map(r => `${r.method} ${normalizeTemplatePath(r.path)}`))
    const reads = [...new Set(clientRoutes
      .filter(r => r.method === 'GET' && !r.path.includes('{param}') && live.has(`GET ${r.path}`))
      .map(r => r.path))]
    expect(reads).toEqual(expect.arrayContaining(['/users/', '/roles/', '/permissions/', '/auth/config']))

    const token = personaToken('admin')
    const answers: string[] = []
    for (const route of reads) {
      const response = await fetch(apiUrl(route), { headers: { Authorization: `Bearer ${token}` }, redirect: 'manual' })
      if (response.status >= 300 && response.status < 400) answers.push(`GET ${route} -> ${response.status} ${response.headers.get('location') ?? ''}`)
    }
    expect(answers).toEqual([])
  })
})
