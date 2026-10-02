// Preparing and verifying the deployable artifact (.output/public). prepareArtifact() runs
// after every `nuxt generate` (scripts/csp-hashes.mjs); verifyArtifact() is re-run by the
// deploy preflight so a stale or hand-edited output is refused before it ships.

import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  bakedDeploymentKeys,
  cspHash,
  extractInlineScripts,
  findUnhashableInlineCode,
  listFiles,
  parseCsp,
  parseHeadersFile,
  readCspFromHeaders,
  readInlineNuxtConfig,
  rewriteCspInHeaders,
  setCspDirective
} from './static-site.mjs'

// Generated or copied files that must never ship:
// - 200.html / 404.html: nitro's SPA fallbacks; the Workers asset server falls back to
//   index.html itself, so these are dead weight.
// - app-config.template.json: a documentation sample.
// - app-config.json: a developer's local config copied from public/; each deployment's
//   config is staged explicitly by scripts/deploy-preflight.mjs.
export const EXCLUDED_OUTPUT_FILES = ['200.html', '404.html', 'app-config.template.json', 'app-config.json']

const FORBIDDEN_SCRIPT_SOURCES = new Set(['\'unsafe-inline\'', '\'unsafe-eval\'', '*', 'data:', 'http:', 'https:'])

export class ArtifactError extends Error {
  constructor(problems) {
    super(problems.join('\n'))
    this.name = 'ArtifactError'
    this.problems = problems
  }
}

/** Scan every HTML file: inline-script hashes, unhashable inline code and baked config. */
export async function scanHtml(dir) {
  const htmlFiles = (await listFiles(dir)).filter(file => file.endsWith('.html'))
  const hashes = new Set()
  const problems = []
  for (const file of htmlFiles) {
    const html = await readFile(path.join(dir, file), 'utf8')
    for (const script of extractInlineScripts(html)) hashes.add(cspHash(script.content))
    for (const issue of findUnhashableInlineCode(html)) problems.push(`${file}: ${issue} cannot be allowed by a CSP hash`)
    const baked = bakedDeploymentKeys(readInlineNuxtConfig(html))
    if (baked.length) {
      problems.push(`${file}: build-time runtime config carries deployment values (${baked.join(', ')}); `
        + 'deployment settings belong in app-config.json only')
    }
  }
  return { htmlFiles, hashes: [...hashes].sort(), problems }
}

function scriptSrcWithHashes(policy, hashes) {
  const current = parseCsp(policy).get('script-src') ?? []
  const forbidden = current.filter(source => FORBIDDEN_SCRIPT_SOURCES.has(source.toLowerCase()))
  if (forbidden.length) throw new ArtifactError([`script-src must not contain ${forbidden.join(', ')}`])
  const kept = current.filter(source => !/^'sha(256|384|512)-/i.test(source) && source !== '\'self\'')
  return setCspDirective(policy, 'script-src', ['\'self\'', ...kept, ...hashes])
}

/**
 * Post-generate step: drop files that must not ship, refuse builds with baked config or
 * unhashable inline code, and write the inline-script hashes into script-src.
 */
export async function prepareArtifact(dir) {
  if (!existsSync(path.join(dir, 'index.html'))) {
    throw new ArtifactError([`${dir}/index.html not found; run \`nuxt generate\` first`])
  }
  const removed = []
  for (const file of EXCLUDED_OUTPUT_FILES) {
    const full = path.join(dir, file)
    if (existsSync(full)) {
      await rm(full)
      removed.push(file)
    }
  }

  const { htmlFiles, hashes, problems } = await scanHtml(dir)
  if (problems.length) throw new ArtifactError(problems)

  const headersPath = path.join(dir, '_headers')
  if (!existsSync(headersPath)) throw new ArtifactError([`${headersPath} not found (public/_headers is copied by nuxt generate)`])
  const { text, count } = rewriteCspInHeaders(await readFile(headersPath, 'utf8'), policy => scriptSrcWithHashes(policy, hashes))
  if (count === 0) throw new ArtifactError(['_headers has no Content-Security-Policy to finish'])
  const parsed = parseHeadersFile(text)
  if (parsed.invalid.length) {
    throw new ArtifactError(parsed.invalid.map(issue => `_headers line ${issue.lineNumber}: ${issue.message}`))
  }
  await writeFile(headersPath, text)

  return { removed, htmlFiles, hashes }
}

/**
 * Check an artifact is exactly what prepareArtifact() produces for its current HTML: no
 * excluded files, every inline script allowed by hash, nothing unsafe, no baked config.
 * Returns a list of problems (empty when the artifact is sound).
 */
export async function verifyArtifact(dir, { allowAppConfig = false } = {}) {
  const problems = []
  if (!existsSync(path.join(dir, 'index.html'))) return [`${dir}/index.html not found; run \`bun run generate\``]
  for (const file of EXCLUDED_OUTPUT_FILES) {
    if (file === 'app-config.json' && allowAppConfig) continue
    if (existsSync(path.join(dir, file))) problems.push(`${file} is in the output; run \`bun run generate\` (not bare \`nuxt generate\`)`)
  }
  const scan = await scanHtml(dir)
  problems.push(...scan.problems)

  const headersPath = path.join(dir, '_headers')
  if (!existsSync(headersPath)) return [...problems, '_headers is missing from the output']
  const headersText = await readFile(headersPath, 'utf8')
  const parsed = parseHeadersFile(headersText)
  for (const issue of parsed.invalid) problems.push(`_headers line ${issue.lineNumber}: ${issue.message}`)
  const policies = readCspFromHeaders(headersText)
  if (!policies.length) problems.push('_headers has no Content-Security-Policy')
  for (const policy of policies) {
    const scriptSrc = parseCsp(policy).get('script-src') ?? []
    const forbidden = scriptSrc.filter(source => FORBIDDEN_SCRIPT_SOURCES.has(source.toLowerCase()))
    if (forbidden.length) problems.push(`script-src allows ${forbidden.join(', ')}`)
    const missing = scan.hashes.filter(hash => !scriptSrc.includes(hash))
    if (missing.length) problems.push(`script-src is missing ${missing.length} inline-script hash(es); run \`bun run generate\``)
  }
  return problems
}
