#!/usr/bin/env node
// Post-generate step, run by `bun run generate` (and therefore by the deploy script):
//
//   node scripts/csp-hashes.mjs [--dir .output/public]
//
// Nuxt's SPA shells boot through three inline scripts (import map, colour-mode bootstrap,
// window.__NUXT__ config). A `script-src 'self'` policy blocks them and the console renders a
// blank page, so this step hashes every inline executable script in the generated HTML and
// writes `script-src 'self' 'sha256-…'` into .output/public/_headers. It also removes files
// that must not ship and fails the build when build-time config leaked into the HTML.

import path from 'node:path'
import { parseArgs } from 'node:util'
import { ArtifactError, prepareArtifact } from './lib/artifact.mjs'

const { values } = parseArgs({
  options: {
    dir: { type: 'string', default: '.output/public' }
  }
})

const dir = path.resolve(values.dir)

try {
  const { removed, htmlFiles, hashes } = await prepareArtifact(dir)
  if (removed.length) console.log(`[csp-hashes] removed from the artifact: ${removed.join(', ')}`)
  console.log(`[csp-hashes] ${hashes.length} inline-script hash(es) across ${htmlFiles.length} HTML file(s) written to script-src in ${path.relative(process.cwd(), dir) || '.'}/_headers`)
} catch (error) {
  if (error instanceof ArtifactError) {
    console.error('[csp-hashes] the generated artifact cannot ship:')
    for (const problem of error.problems) console.error(`  - ${problem}`)
    process.exit(1)
  }
  throw error
}
