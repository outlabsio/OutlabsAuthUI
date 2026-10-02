import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

// The architecture and styling guardrails (eslint.config.mjs, eslint-rules/console.mjs) are
// pinned by the fixtures in eslint-fixtures/ (see its README): each fixture is linted as if it
// lived at its mirrored app/ path, and every guardrail report must match an `expect-error`
// marker on its line, and every marker a report.

const root = fileURLToPath(new URL('../../', import.meta.url))
const fixturesRoot = join(root, 'eslint-fixtures')

const GUARDRAIL_RULES = [
  'no-restricted-globals',
  'no-restricted-properties',
  '@typescript-eslint/no-restricted-imports',
  'console/no-raw-tailwind',
  'console/ui-allowlist',
  'vue/no-restricted-static-attribute',
  'vue/no-restricted-v-bind',
  'vue/no-restricted-block'
]

function listFixtures(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listFixtures(path)
    return /\.(vue|ts)$/.test(entry.name) ? [path] : []
  })
}

/** Line number (1-based) -> rule ids its `expect-error:` marker lists. */
function expectedReports(source: string): Map<number, string[]> {
  const expected = new Map<number, string[]>()
  source.split('\n').forEach((line, index) => {
    const marker = /expect-error:\s*([^*\n]+?)\s*(?:-->|\*\/|$)/.exec(line)
    if (marker?.[1]) expected.set(index + 1, marker[1].split(',').map(rule => rule.trim()).filter(Boolean))
  })
  return expected
}

const fixtures = listFixtures(fixturesRoot).map(path => ({
  path,
  // eslint-fixtures/app/pages/x.vue is linted as app/pages/x.vue.
  lintAs: relative(fixturesRoot, path).split(sep).join('/')
}))

let eslint: ESLint
const firedRules = new Set<string>()

beforeAll(() => {
  eslint = new ESLint({ cwd: root })
})

describe('lint guardrails', () => {
  it('has fixtures', () => {
    expect(fixtures.length).toBeGreaterThan(0)
  })

  it.each(fixtures)('$lintAs reports exactly its marked lines', async ({ path, lintAs }) => {
    const source = readFileSync(path, 'utf8')
    const [result] = await eslint.lintText(source, { filePath: join(root, lintAs) })
    expect(result, 'ESLint returned no result').toBeDefined()

    const fatal = result!.messages.filter(message => message.fatal)
    expect(fatal.map(message => `${message.line}: ${message.message}`), 'parse errors').toEqual([])

    const actual = new Map<number, Set<string>>()
    for (const message of result!.messages) {
      if (!message.ruleId || !GUARDRAIL_RULES.includes(message.ruleId)) continue
      firedRules.add(message.ruleId)
      if (!actual.has(message.line)) actual.set(message.line, new Set())
      actual.get(message.line)!.add(message.ruleId)
    }

    const expected = expectedReports(source)
    const lines = [...new Set([...expected.keys(), ...actual.keys()])].sort((a, b) => a - b)
    const describeLines = (map: Map<number, Iterable<string>>) =>
      lines.filter(line => map.has(line)).map(line => `${line}: ${[...map.get(line)!].sort().join(', ')}`)
    expect(describeLines(actual), `guardrail reports in ${lintAs}`).toEqual(describeLines(expected))
  })

  it('every guardrail rule is pinned by at least one fixture', () => {
    expect([...firedRules].sort()).toEqual([...GUARDRAIL_RULES].sort())
  })
})
