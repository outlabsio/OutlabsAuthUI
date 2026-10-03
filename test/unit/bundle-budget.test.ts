import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkBundleBudget, describeBundle, measureJavaScript, parseBudget } from '../../scripts/lib/bundle-budget.mjs'

// The shipped-JavaScript budget (PRODUCTION.md section 6): release:check measures every .js file
// under .output/public/_nuxt and fails past bundle-budget.json's baseline plus its allowance.

let dir: string | null = null

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
  dir = null
})

async function buildAssets(files: Record<string, string>) {
  dir = await mkdtemp(path.join(tmpdir(), 'bundle-budget-'))
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, name)), { recursive: true })
    await writeFile(path.join(dir, name), content)
  }
  return dir
}

describe('measureJavaScript', () => {
  it('counts every .js file, nested ones included, and nothing else', async () => {
    const assets = await buildAssets({
      'a.js': 'x'.repeat(100),
      'builds/meta/b.js': 'y'.repeat(50),
      'entry.css': 'z'.repeat(1000),
      'builds/latest.json': '{}'
    })
    const measured = measureJavaScript(assets)
    expect(measured.files).toBe(2)
    expect(measured.rawBytes).toBe(150)
    expect(measured.gzipBytes).toBeGreaterThan(0)
  })
})

describe('parseBudget', () => {
  it('reads the baseline and the allowance', () => {
    expect(parseBudget({ javascript: { baselineBytes: 1000, allowedGrowth: 0.1 } })).toEqual({ baselineBytes: 1000, allowedGrowth: 0.1 })
  })

  it('refuses a missing or nonsensical budget', () => {
    expect(() => parseBudget({})).toThrow(/baselineBytes/)
    expect(() => parseBudget({ javascript: { baselineBytes: 0, allowedGrowth: 0.1 } })).toThrow(/baselineBytes/)
    expect(() => parseBudget({ javascript: { baselineBytes: 10.5, allowedGrowth: 0.1 } })).toThrow(/baselineBytes/)
    expect(() => parseBudget({ javascript: { baselineBytes: 1000 } })).toThrow(/allowedGrowth/)
    expect(() => parseBudget({ javascript: { baselineBytes: 1000, allowedGrowth: 2 } })).toThrow(/allowedGrowth/)
  })
})

describe('checkBundleBudget', () => {
  const budget = { baselineBytes: 1_000_000, allowedGrowth: 0.1 }

  it('passes up to the baseline plus the allowance, and fails one byte past it', () => {
    expect(checkBundleBudget({ files: 10, rawBytes: 1_100_000, gzipBytes: 1 }, budget)).toMatchObject({ ok: true, limitBytes: 1_100_000 })
    expect(checkBundleBudget({ files: 10, rawBytes: 1_100_001, gzipBytes: 1 }, budget).ok).toBe(false)
  })

  it('passes a smaller bundle, and fails a build with no JavaScript at all', () => {
    expect(checkBundleBudget({ files: 10, rawBytes: 900_000, gzipBytes: 1 }, budget).ok).toBe(true)
    expect(checkBundleBudget({ files: 0, rawBytes: 0, gzipBytes: 0 }, budget).ok).toBe(false)
  })

  it('describes the size against the baseline and the limit', () => {
    const measured = { files: 201, rawBytes: 1_050_000, gzipBytes: 350_000 }
    expect(describeBundle(measured, budget, checkBundleBudget(measured, budget)))
      .toBe('1.05 MB JavaScript in 201 files (+5.0% on the 1.00 MB baseline, limit 1.10 MB; about 350 KB gzip)')
  })
})
