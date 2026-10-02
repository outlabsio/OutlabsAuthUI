import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { prepareArtifact, verifyArtifact } from '../../scripts/lib/artifact.mjs'
import { pinDeploymentPolicy, validateDeploymentConfig } from '../../scripts/lib/deployment-config.mjs'
import { GATE_KIND, GATE_VERSION, REQUIRED_STEPS } from '../../scripts/lib/release-gate.mjs'
import { cspHash } from '../../scripts/lib/static-site.mjs'

const nuxtRoot = fileURLToPath(new URL('../../', import.meta.url))

const headersTemplate = '/*\n  Content-Security-Policy: default-src \'self\'; script-src \'self\'; img-src \'self\' data:; connect-src \'self\'\n  X-Frame-Options: DENY\n'
const bootScript = 'window.__NUXT__={};window.__NUXT__.config={public:{},app:{}}'
const shell = (config = bootScript) => `<html><head><script>document.documentElement.classList.add("light")</script></head><body><script>${config}</script></body></html>`

describe('artifact preparation', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'artifact-'))
    await mkdir(path.join(dir, 'app/users'), { recursive: true })
    await writeFile(path.join(dir, 'index.html'), shell())
    await writeFile(path.join(dir, 'app/users/index.html'), shell())
    await writeFile(path.join(dir, '200.html'), shell())
    await writeFile(path.join(dir, 'app-config.json'), '{"apiBaseUrl":"http://localhost:8004"}')
    await writeFile(path.join(dir, '_headers'), headersTemplate)
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('writes every inline-script hash into script-src and drops files that must not ship', async () => {
    const { removed, hashes } = await prepareArtifact(dir)
    expect(removed).toEqual(['200.html', 'app-config.json'])
    expect(hashes).toHaveLength(2)
    const headers = await readFile(path.join(dir, '_headers'), 'utf8')
    expect(headers).toContain(`script-src 'self' ${hashes.join(' ')};`)
    expect(headers).toContain(cspHash(bootScript))
    expect(await verifyArtifact(dir)).toEqual([])
    // Idempotent.
    await prepareArtifact(dir)
    expect(await readFile(path.join(dir, '_headers'), 'utf8')).toBe(headers)
  })

  it('refuses a build with deployment config baked into the HTML', async () => {
    await writeFile(path.join(dir, 'index.html'), shell('window.__NUXT__={};window.__NUXT__.config={public:{apiBaseUrl:"http://localhost:8004"}}'))
    await expect(prepareArtifact(dir)).rejects.toThrow(/apiBaseUrl/)
  })

  it('refuses unsafe-inline in the committed policy', async () => {
    await writeFile(path.join(dir, '_headers'), headersTemplate.replace('script-src \'self\'', 'script-src \'self\' \'unsafe-inline\''))
    await expect(prepareArtifact(dir)).rejects.toThrow(/unsafe-inline/)
  })

  it('flags an artifact whose HTML changed after hashing', async () => {
    await prepareArtifact(dir)
    await writeFile(path.join(dir, 'index.html'), shell().replace('light', 'dark'))
    expect((await verifyArtifact(dir)).join('\n')).toMatch(/missing 1 inline-script hash/)
    expect(existsSync(path.join(dir, '200.html'))).toBe(false)
  })
})

describe('deployment config', () => {
  const base = { apiBaseUrl: 'https://auth.example.com', authApiPrefix: '/v1', frontendProfileKey: 'console' }

  it('accepts a public https API', () => {
    const { config, errors, warnings } = validateDeploymentConfig(base)
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    expect(config?.apiBaseUrl).toBe('https://auth.example.com')
  })

  it('refuses a loopback API unless staging locally', () => {
    const local = { ...base, apiBaseUrl: 'http://localhost:8101' }
    expect(validateDeploymentConfig(local).errors.join()).toMatch(/local or non-https/)
    expect(validateDeploymentConfig(local, { local: true }).errors).toEqual([])
    expect(validateDeploymentConfig({ ...base, apiBaseUrl: 'https://127.0.0.1' }).errors).toHaveLength(1)
  })

  it('surfaces the runtime schema errors and a missing profile key', () => {
    expect(validateDeploymentConfig({ apiBaseUrl: 'http://auth.example.com', authApiPrefix: '/v1' }).errors.join()).toMatch(/https/)
    expect(validateDeploymentConfig([]).errors).toEqual(['app-config.json must contain a JSON object'])
    expect(validateDeploymentConfig({ apiBaseUrl: base.apiBaseUrl, authApiPrefix: '/v1' }).warnings.join()).toMatch(/frontendProfileKey/)
  })

  it('checks the logo URL form', () => {
    expect(validateDeploymentConfig({ ...base, authLogoUrl: 'http://cdn.example.com/logo.svg' }).errors.join()).toMatch(/authLogoUrl/)
    expect(validateDeploymentConfig({ ...base, authLogoUrl: 'brand/logo.svg' }).errors.join()).toMatch(/authLogoUrl/)
    expect(validateDeploymentConfig({ ...base, authLogoUrl: '/brand/logo.svg' }).errors).toEqual([])
    expect(validateDeploymentConfig({ ...base, authLogoDarkUrl: 'http://cdn.example.com/dark.svg' }).errors.join()).toMatch(/authLogoDarkUrl/)
    expect(validateDeploymentConfig({ ...base, authLogoDarkUrl: '/brand/dark.svg' }).errors).toEqual([])
  })

  it('adds a hosted dark logo origin to img-src', () => {
    const { config } = validateDeploymentConfig({
      ...base,
      authLogoUrl: 'https://cdn.example.com/brand/logo.svg',
      authLogoDarkUrl: 'https://assets.example.com/brand/logo-dark.svg'
    })
    const pinned = pinDeploymentPolicy('img-src \'self\' data:; connect-src \'self\'', { config: config! })
    expect(pinned).toBe('img-src \'self\' data: https://cdn.example.com https://assets.example.com; connect-src \'self\' https://auth.example.com')
  })

  it('pins connect-src to the API and img-src to a hosted logo, idempotently', () => {
    const { config } = validateDeploymentConfig({ ...base, authLogoUrl: 'https://cdn.example.com/brand/logo.svg' })
    const policy = 'default-src \'self\'; img-src \'self\' data:; connect-src \'self\''
    const pinned = pinDeploymentPolicy(policy, { config: config!, extraConnectSrc: ['https://status.example.com'] })
    expect(pinned).toBe('default-src \'self\'; img-src \'self\' data: https://cdn.example.com; connect-src \'self\' https://auth.example.com https://status.example.com')
    expect(pinDeploymentPolicy(pinned, { config: config! })).toBe('default-src \'self\'; img-src \'self\' data: https://cdn.example.com; connect-src \'self\' https://auth.example.com')
  })
})

// --require-release-gate (passed by scripts/deploy-with-env.sh), run in a throwaway git repository
// with a minimal artifact: the preflight reads HEAD and the tree from git and the record from
// .release/gate.json. Which records it accepts is pinned in release-gate.test.ts.
describe('deploy-preflight --require-release-gate', () => {
  let repo: string
  let head: string

  // A passing record for `sha`, finished just now (release-gate.test.ts covers the variants).
  const passingRecord = (sha: string) => ({
    kind: GATE_KIND,
    version: GATE_VERSION,
    head_sha: sha,
    clean: true,
    passed: true,
    finished_at: new Date().toISOString(),
    backends: {
      enterprise: { preset: 'EnterpriseRBAC', library_version: '0.1.0a34', api_contract_version: 'outlabs-auth.api/v1' },
      simple: { preset: 'SimpleRBAC', library_version: '0.1.0a34', api_contract_version: 'outlabs-auth.api/v1' }
    },
    steps: REQUIRED_STEPS.map(name => ({ name, ok: true })),
    e2e: {
      enterprise: { ok: true, passed: 506, failed: 0, flaky: 0, skipped: 10 },
      simple: { ok: true, passed: 327, failed: 0, flaky: 0, skipped: 189 }
    }
  })

  const git = (...args: string[]) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' }).stdout.trim()

  beforeAll(async () => {
    repo = await mkdtemp(path.join(tmpdir(), 'release-gate-'))
    await mkdir(path.join(repo, 'artifact'), { recursive: true })
    await writeFile(path.join(repo, 'artifact/index.html'), '<html><body><script>window.__NUXT__={};window.__NUXT__.config={public:{},app:{}}</script></body></html>')
    await writeFile(path.join(repo, 'artifact/_headers'), '/*\n  Content-Security-Policy: default-src \'self\'; script-src \'self\'; connect-src \'self\'\n')
    await prepareArtifact(path.join(repo, 'artifact'))
    await writeFile(path.join(repo, 'app-config.json'), '{"apiBaseUrl":"http://localhost:8004","authApiPrefix":"/v1","frontendProfileKey":"console"}\n')
    await writeFile(path.join(repo, '.gitignore'), 'artifact/\n.release/\n')
    git('init', '-q')
    git('add', '.')
    git('-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-q', '-m', 'init')
    head = git('rev-parse', 'HEAD')
  })

  afterAll(async () => {
    await rm(repo, { recursive: true, force: true })
  })

  async function preflight(record: unknown) {
    await mkdir(path.join(repo, '.release'), { recursive: true })
    if (record !== undefined) await writeFile(path.join(repo, '.release/gate.json'), JSON.stringify(record))
    else await rm(path.join(repo, '.release/gate.json'), { force: true })
    const result = spawnSync(process.execPath, [
      path.join(nuxtRoot, 'scripts/deploy-preflight.mjs'),
      '--local', '--config', 'app-config.json', '--dir', 'artifact', '--require-release-gate'
    ], { cwd: repo, encoding: 'utf8' })
    return { status: result.status, stdout: result.stdout, stderr: result.stderr }
  }

  it('accepts a passing record for HEAD, warning that HEAD is on no remote branch', async () => {
    const run = await preflight(passingRecord(head))
    expect(run.stderr).toContain('is on no remote branch')
    expect(run.stdout).toContain(`release check passed at ${head.slice(0, 12)}`)
    expect(run.status).toBe(0)
  })

  it('refuses a record for another commit, a missing record and a dirty tree', async () => {
    const other = await preflight(passingRecord('b'.repeat(40)))
    expect(other.status).toBe(1)
    expect(other.stderr).toContain(`the release check ran at bbbbbbbbbbbb, but HEAD is ${head.slice(0, 12)}`)

    const missing = await preflight(undefined)
    expect(missing.status).toBe(1)
    expect(missing.stderr).toContain('no release record at .release/gate.json')

    await writeFile(path.join(repo, 'untracked.vue'), '<template />\n')
    const dirty = await preflight(passingRecord(head))
    await rm(path.join(repo, 'untracked.vue'))
    expect(dirty.status).toBe(1)
    expect(dirty.stderr).toContain('the working tree has 1 uncommitted path(s)')
    expect(dirty.stdout).not.toContain('release check passed')
  })
})
