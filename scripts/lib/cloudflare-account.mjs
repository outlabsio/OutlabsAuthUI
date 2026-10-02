// The deploy script's account guard (scripts/deploy-with-env.sh): the Cloudflare token must be
// able to reach the deployment's account. Reads the output of `wrangler whoami --json`
// ({ loggedIn, authType, email, accounts: [{ id, name }], tokenPermissions }) and fails closed:
// output that is not that JSON, a token that is not logged in, or an account list without the
// expected id all refuse the deploy. Every account the token can reach is checked, not the first
// id in the output (a user token lists several accounts).

/**
 * @param {string} output  stdout of `wrangler whoami --json`
 * @param {string} accountId  the expected account (CLOUDFLARE_ACCOUNT_ID)
 * @returns {{ ok: true, accountName: string } | { ok: false, message: string }}
 */
export function checkWhoamiAccount(output, accountId) {
  const expected = (accountId ?? '').trim()
  if (!expected) return { ok: false, message: 'CLOUDFLARE_ACCOUNT_ID is empty; there is no account to check the token against.' }
  let whoami
  try {
    whoami = JSON.parse(output)
  } catch {
    return { ok: false, message: 'could not read the output of `wrangler whoami --json` as JSON.' }
  }
  if (!whoami || typeof whoami !== 'object' || whoami.loggedIn !== true) {
    return { ok: false, message: 'wrangler reports the token as not logged in.' }
  }
  if (!Array.isArray(whoami.accounts)) {
    return { ok: false, message: '`wrangler whoami --json` listed no accounts for the token.' }
  }
  const ids = whoami.accounts.map(account => (account && typeof account === 'object' ? String(account.id ?? '') : '')).filter(Boolean)
  const match = whoami.accounts.find(account => account && typeof account === 'object' && account.id === expected)
  if (!match) {
    const reachable = ids.length ? ids.join(', ') : 'none'
    return { ok: false, message: `account mismatch: the token cannot reach ${expected} (it reaches: ${reachable}). Use a token for the right account, or run \`bunx wrangler logout\` to clear a cached OAuth login.` }
  }
  return { ok: true, accountName: typeof match.name === 'string' ? match.name : '' }
}
