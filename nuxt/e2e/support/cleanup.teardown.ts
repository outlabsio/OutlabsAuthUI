import { backendConfigured, test } from './fixtures'

// Test-data cleanup. Every resource the suites create is uniformly pw/PW-prefixed
// (pw-api-, pw-root-, pw-child-, pw-gov-, pw-esc-, pw-sa-, pw-mk-, pwabac…, "PW API …");
// seed data (acme-realty, ESC/Gov roots, admin@acme.com, seed roles/permissions) never is.
// This purges the pw/PW set via the API so the UI shows only properly-named data.
//
// Runs two ways:
//   - automatically as the `setup` project's teardown (every full `test:e2e` run self-cleans);
//   - on demand via `npm run test:e2e:clean` (playwright test --project=cleanup).

const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://localhost:8004'
const apiPrefix = process.env.E2E_AUTH_API_PREFIX ?? '/v1'
const base = `${apiBaseUrl}${apiPrefix}`
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@test.com'
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'Test123!!'

// Names/slugs the tests use. `pw-` / `pwabac` for machine names, `PW ` for display names.
const TEST_NAME = /^pw[-a-z]/i
const TEST_DISPLAY = /^PW /

type Row = Record<string, string | null | undefined> & { id: string }

test.describe('e2e test-data cleanup', () => {
  test.skip(!backendConfigured, 'No E2E backend configured (set E2E_API_BASE_URL).')

  test('purge pw/PW-prefixed test data', async () => {
    const loginRes = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword })
    })
    if (!loginRes.ok) throw new Error(`cleanup login failed: ${loginRes.status}`)
    const token = (await loginRes.json() as { access_token: string }).access_token
    const headers = { Authorization: `Bearer ${token}` }

    // List every page of an endpoint. Returns either a bare array or a { items } envelope;
    // these list endpoints cap limit at 100, so paginate (and dedupe / stop when a page brings
    // nothing new, in case an endpoint ignores pagination).
    const listAll = async (path: string): Promise<Row[]> => {
      const out: Row[] = []
      const seen = new Set<string>()
      const sep = path.includes('?') ? '&' : '?'
      for (let page = 1; page <= 100; page++) {
        const res = await fetch(`${base}${path}${sep}limit=100&page=${page}`, { headers })
        if (!res.ok) break
        const data = await res.json() as Row[] | { items?: Row[] }
        const rows = Array.isArray(data) ? data : (data.items ?? [])
        const fresh = rows.filter(r => r.id && !seen.has(r.id))
        for (const r of fresh) seen.add(r.id)
        out.push(...fresh)
        if (rows.length < 100 || fresh.length === 0) break
      }
      return out
    }
    const del = async (path: string): Promise<boolean> => (await fetch(`${base}${path}`, { method: 'DELETE', headers })).ok

    const summary: Record<string, number> = {}
    const bump = (k: string) => {
      summary[k] = (summary[k] ?? 0) + 1
    }

    // Permissions (pwabac…) and roles (pw…).
    for (const p of await listAll('/permissions/')) {
      if (TEST_NAME.test(p.name ?? '') && await del(`/permissions/${p.id}`)) bump('permissions')
    }
    for (const r of await listAll('/roles/')) {
      if (TEST_NAME.test(r.name ?? '') && await del(`/roles/${r.id}`)) bump('roles')
    }

    // Platform-global service accounts (pw-sa-, pw-role-sa-). Only the active ones — DELETE
    // archives rather than hard-deletes, so listing all statuses would re-process dead rows every run.
    for (const sa of await listAll('/admin/system/integration-principals?status=active')) {
      if (TEST_NAME.test(sa.name ?? sa.slug ?? '') && await del(`/admin/system/integration-principals/${sa.id}`)) bump('service_accounts')
    }

    // Users (pw…). Most user tests self-clean their roundtrip user; this catches strays.
    for (const u of await listAll('/users/')) {
      if (TEST_NAME.test(u.email ?? '') && await del(`/users/${u.id}`)) bump('users')
    }

    // Entities (pw-… / "PW …"). Archive any entity-scoped service accounts first (they'd block
    // the delete), then remove entities deepest-first so a parent goes after its children.
    const entities = (await listAll('/entities/')).filter(
      e => TEST_NAME.test(e.slug ?? '') || TEST_DISPLAY.test(e.display_name ?? '')
    )
    for (const e of entities) {
      for (const sa of await listAll(`/admin/entities/${e.id}/integration-principals?status=active`)) {
        if (await del(`/admin/entities/${e.id}/integration-principals/${sa.id}`)) bump('entity_service_accounts')
      }
    }
    const byId = new Map(entities.map(e => [e.id, e]))
    const depth = (e: Row) => {
      let d = 0
      let cur: Row | undefined = e
      while (cur?.parent_entity_id && byId.get(cur.parent_entity_id)) {
        d++
        cur = byId.get(cur.parent_entity_id)
      }
      return d
    }
    for (const e of [...entities].sort((a, b) => depth(b) - depth(a))) {
      if (await del(`/entities/${e.id}`)) bump('entities')
    }

    console.log('[cleanup] purged test data:', JSON.stringify(summary))
  })
})
