#!/usr/bin/env node
// Account guard for scripts/deploy-with-env.sh:
//
//   bunx wrangler whoami --json | CLOUDFLARE_ACCOUNT_ID=<id> node scripts/check-cloudflare-account.mjs
//
// Exits 0 when the token can reach CLOUDFLARE_ACCOUNT_ID, 1 otherwise (scripts/lib/cloudflare-account.mjs).

import { checkWhoamiAccount } from './lib/cloudflare-account.mjs'

let output = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) output += chunk

const result = checkWhoamiAccount(output, process.env.CLOUDFLARE_ACCOUNT_ID ?? '')
if (!result.ok) {
  console.error(`ERROR: ${result.message} Not deploying.`)
  process.exit(1)
}
console.log(`Token verified for account ${process.env.CLOUDFLARE_ACCOUNT_ID}${result.accountName ? ` (${result.accountName})` : ''}.`)
