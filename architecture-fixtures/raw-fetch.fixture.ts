// This file intentionally violates the "no raw fetch" architecture rule.
// It exists to prove the guardrail in eslint.config.js actually fires.
// Run `bash scripts/check-architecture-fixtures.sh` to verify.

export async function getWidgetsDirectly() {
  const response = await fetch('/widgets')
  return response.json()
}
