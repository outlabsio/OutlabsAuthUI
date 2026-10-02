// Test-data naming and the matchers cleanup relies on. Pure (no I/O) so it is unit-tested in
// test/unit/e2e-harness.test.ts.
//
// Every record a spec creates must be named through `testData(runId)`: the per-run marker
// (`pw-e2e-<runId>-…`, `…@example.com`) is what lets cleanup delete exactly this run's data and
// nothing else, even while another run shares the backend.

export type NamedRecord = {
  id?: string
  name?: string | null
  slug?: string | null
  email?: string | null
  display_name?: string | null
}

const RECORD_FIELDS = ['name', 'slug', 'email', 'display_name'] as const

function sanitize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x'
}

let counter = 0
function uniqueSuffix() {
  counter += 1
  return `${counter.toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

export type TestData = {
  runId: string
  // Machine name / slug: `pw-e2e-<run>-<kind>-<unique>`.
  name: (kind: string) => string
  // Email on the reserved example.com domain: `pw-e2e-<run>-<kind>-<unique>@example.com`.
  email: (kind: string) => string
  // Human display name: `PW E2E <run> <kind> <unique>`.
  displayName: (kind: string) => string
  // Alphanumeric token for fields that reject punctuation (permission resources).
  resource: (kind: string) => string
}

export function testData(runId: string): TestData {
  const run = sanitize(runId).replace(/-/g, '')
  return {
    runId: run,
    name: kind => `pw-e2e-${run}-${sanitize(kind)}-${uniqueSuffix()}`,
    email: kind => `pw-e2e-${run}-${sanitize(kind)}-${uniqueSuffix()}@example.com`,
    displayName: kind => `PW E2E ${run} ${kind} ${uniqueSuffix()}`,
    resource: kind => `pwe2e${run}${sanitize(kind).replace(/-/g, '')}${uniqueSuffix()}`
  }
}

// True when the record carries this run's marker in any identifying field.
export function isRunRecord(record: NamedRecord, runId: string): boolean {
  const run = sanitize(runId).replace(/-/g, '')
  const prefixes = [`pw-e2e-${run}-`, `pwe2e${run}`, `pw e2e ${run} `]
  return RECORD_FIELDS.some((field) => {
    const value = record[field]?.toLowerCase()
    return Boolean(value && prefixes.some(prefix => value.startsWith(prefix)))
  })
}

// Which listed rows cleanup should remove: this run's marked records. Terminal rows are skipped.
const TERMINAL_STATUSES = new Set(['deleted', 'archived', 'revoked'])

export function selectCleanupTargets<T extends NamedRecord & { id: string, status?: string | null }>(rows: T[], runId: string): T[] {
  return rows.filter((row) => {
    if (row.status && TERMINAL_STATUSES.has(row.status.toLowerCase())) return false
    return isRunRecord(row, runId)
  })
}
