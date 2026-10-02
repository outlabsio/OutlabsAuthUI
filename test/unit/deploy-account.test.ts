import { spawnSync } from 'node:child_process'
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkWhoamiAccount } from '../../scripts/lib/cloudflare-account.mjs'

// The deploy script's Cloudflare account guard (scripts/deploy-with-env.sh). It used to read
// `wrangler whoami --format json`, a flag wrangler rejects, with stderr discarded and an empty
// fallback, so the check never ran. It now reads `whoami --json`, checks every account the token
// reaches and fails closed.

const nuxtRoot = fileURLToPath(new URL('../../', import.meta.url))
const EXPECTED = '0123456789abcdef0123456789abcdef'
const OTHER = 'fedcba9876543210fedcba9876543210'

function whoami(accounts: Array<{ id: string, name: string }>, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({ loggedIn: true, authType: 'User API Token', email: 'deployer@example.com', accounts, tokenPermissions: [], ...overrides })
}

describe('checkWhoamiAccount', () => {
  it('accepts a token that reaches the account, wherever it is in the list', () => {
    expect(checkWhoamiAccount(whoami([{ id: OTHER, name: 'Other' }, { id: EXPECTED, name: 'Console' }]), EXPECTED))
      .toEqual({ ok: true, accountName: 'Console' })
  })

  it('refuses a token that cannot reach the account and names the ones it can', () => {
    const result = checkWhoamiAccount(whoami([{ id: OTHER, name: 'Other' }]), EXPECTED)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(new RegExp(`account mismatch: the token cannot reach ${EXPECTED} \\(it reaches: ${OTHER}\\)`))
  })

  it('fails closed on output it cannot read, a token that is not logged in, or no account to check', () => {
    expect(checkWhoamiAccount('', EXPECTED).ok).toBe(false)
    expect(checkWhoamiAccount('✘ [ERROR] Unknown argument: format', EXPECTED).ok).toBe(false)
    expect(checkWhoamiAccount(JSON.stringify({ loggedIn: false }), EXPECTED).ok).toBe(false)
    expect(checkWhoamiAccount(whoami([], { accounts: undefined }), EXPECTED).ok).toBe(false)
    expect(checkWhoamiAccount(whoami([]), EXPECTED).ok).toBe(false)
    expect(checkWhoamiAccount(whoami([{ id: EXPECTED, name: 'Console' }]), '  ').ok).toBe(false)
  })
})

// The script itself, run from a copy (so no local .env.deploy is read) with `bunx` and `bun`
// stubbed: the stubbed whoami prints FAKE_WHOAMI and exits FAKE_WHOAMI_STATUS, and the stubbed
// `bun run generate` exits FAKE_GENERATE_STATUS (42 by default, which shows the script got past
// the account guard to the build). With a successful build, a stub preflight logs its arguments
// and exits 43, so the release-gate wiring is visible without building or deploying anything.
describe('deploy-with-env.sh account guard', () => {
  let dir: string
  let bin: string
  let calls: string

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'deploy-guard-'))
    bin = path.join(dir, 'bin')
    calls = path.join(dir, 'calls.log')
    await mkdir(path.join(dir, 'scripts/lib'), { recursive: true })
    await mkdir(bin)
    for (const file of ['scripts/deploy-with-env.sh', 'scripts/check-cloudflare-account.mjs', 'scripts/lib/cloudflare-account.mjs']) {
      await copyFile(path.join(nuxtRoot, file), path.join(dir, file))
    }
    await writeFile(path.join(dir, 'app-config.json'), '{}\n')
    await writeFile(path.join(bin, 'bunx'), [
      '#!/bin/bash',
      `echo "bunx $*" >> "${calls}"`,
      'if [ "$1 $2" = "wrangler whoami" ]; then printf \'%s\' "$FAKE_WHOAMI"; exit "${FAKE_WHOAMI_STATUS:-0}"; fi',
      'exit 0',
      ''
    ].join('\n'))
    await writeFile(path.join(bin, 'bun'), `#!/bin/bash\necho "bun $*" >> "${calls}"\necho GENERATE-STUB\nexit "\${FAKE_GENERATE_STATUS:-42}"\n`)
    await writeFile(path.join(dir, 'scripts/deploy-preflight.mjs'), [
      'import { appendFileSync } from \'node:fs\'',
      `appendFileSync(${JSON.stringify(calls)}, \`preflight \${process.argv.slice(2).join(' ')}\\n\`)`,
      'process.exit(43)',
      ''
    ].join('\n'))
    await chmod(path.join(bin, 'bunx'), 0o755)
    await chmod(path.join(bin, 'bun'), 0o755)
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  async function deploy(args: string[], env: Record<string, string>) {
    await writeFile(calls, '')
    const result = spawnSync('bash', [path.join(dir, 'scripts/deploy-with-env.sh'), '--config', 'app-config.json', ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: { PATH: `${bin}${path.delimiter}${process.env.PATH}`, HOME: dir, CLOUDFLARE_API_TOKEN: 'test-token', ...env }
    })
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, calls: (await readFile(calls, 'utf8')).trim().split('\n').filter(Boolean) }
  }

  it('builds once whoami --json lists the account', async () => {
    const run = await deploy(['--env', 'production'], { CLOUDFLARE_ACCOUNT_ID: EXPECTED, FAKE_WHOAMI: whoami([{ id: OTHER, name: 'Other' }, { id: EXPECTED, name: 'Console' }]) })
    expect(run.calls).toEqual(['bunx wrangler whoami --json', 'bun run generate'])
    expect(run.stdout).toContain(`Token verified for account ${EXPECTED} (Console).`)
    expect(run.status).toBe(42)
  })

  it('stops before building when the token cannot reach the account', async () => {
    const run = await deploy(['--env', 'production'], { CLOUDFLARE_ACCOUNT_ID: EXPECTED, FAKE_WHOAMI: whoami([{ id: OTHER, name: 'Other' }]) })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('account mismatch')
    expect(run.calls).toEqual(['bunx wrangler whoami --json'])
  })

  it('stops when whoami fails or prints something else', async () => {
    const failed = await deploy(['--env', 'production'], { CLOUDFLARE_ACCOUNT_ID: EXPECTED, FAKE_WHOAMI: '', FAKE_WHOAMI_STATUS: '1' })
    expect(failed.status).toBe(1)
    expect(failed.stderr).toContain('\'wrangler whoami --json\' failed')
    expect(failed.calls).toEqual(['bunx wrangler whoami --json'])

    const unreadable = await deploy(['--env', 'production'], { CLOUDFLARE_ACCOUNT_ID: EXPECTED, FAKE_WHOAMI: 'not json' })
    expect(unreadable.status).toBe(1)
    expect(unreadable.stderr).toContain('could not read the output')
    expect(unreadable.calls).toEqual(['bunx wrangler whoami --json'])
  })

  it('requires CLOUDFLARE_ACCOUNT_ID with --env', async () => {
    const run = await deploy(['--env', 'production'], {})
    expect(run.status).toBe(2)
    expect(run.stderr).toContain('CLOUDFLARE_ACCOUNT_ID is required with --env')
    expect(run.calls).toEqual([])
  })

  it('requires a passing release check for HEAD after the build', async () => {
    const run = await deploy(['--env', 'production'], { CLOUDFLARE_ACCOUNT_ID: EXPECTED, FAKE_WHOAMI: whoami([{ id: EXPECTED, name: 'Console' }]), FAKE_GENERATE_STATUS: '0' })
    expect(run.calls).toEqual(['bunx wrangler whoami --json', 'bun run generate', 'preflight --config app-config.json --require-release-gate'])
    expect(run.status).toBe(43)
  })

  it('DEPLOY_SKIP_RELEASE_GATE=1 drops only the release-gate requirement, loudly', async () => {
    const run = await deploy(['--env', 'production'], { CLOUDFLARE_ACCOUNT_ID: EXPECTED, FAKE_WHOAMI: whoami([{ id: EXPECTED, name: 'Console' }]), FAKE_GENERATE_STATUS: '0', DEPLOY_SKIP_RELEASE_GATE: '1' })
    expect(run.stderr).toContain('DEPLOY_SKIP_RELEASE_GATE=1')
    expect(run.calls).toEqual(['bunx wrangler whoami --json', 'bun run generate', 'preflight --config app-config.json'])
    expect(run.status).toBe(43)
  })

  it('says so when a workers.dev preview skips the check', async () => {
    const run = await deploy([], {})
    expect(run.stderr).toContain('the token\'s account was NOT checked')
    expect(run.calls).toEqual(['bun run generate'])
    expect(run.status).toBe(42)
  })
})
