# Architecture Fixtures

These files intentionally violate the architecture boundary rules defined in
[`../eslint.config.js`](../eslint.config.js). They are **not** part of the app
(`architecture-fixtures/` is excluded from the default `dist`/build and from
the normal `bun run lint` run via `globalIgnores` in `eslint.config.js`).

Their only job is to prove the guardrail rules actually catch what they claim
to catch. Run:

```bash
bash scripts/check-architecture-fixtures.sh
```

This lints this folder directly (bypassing the global ignore) and **expects
a non-zero exit code**. If the script reports that lint passed cleanly, one
of the architecture rules has regressed and needs to be fixed before relying
on it again.

## Fixtures and the rule each one should trip

| Fixture | Rule it violates | Expected ESLint rule id |
| --- | --- | --- |
| `raw-fetch.fixture.ts` | No raw `fetch()` outside `lib/api/**` / `lib/runtime-config.ts` | `no-restricted-globals` |
| `non-feature/client-import-outside-api.fixture.ts` | `@/lib/api/client` may only be imported from feature `api/` files or `lib/**` | `no-restricted-imports` |
| `feature-like/raw-ui-table-in-feature.fixture.tsx` | Features must use `AppDataTable`, not `@/components/ui/table` directly | `no-restricted-imports` |

## Why the subfolders matter

`eslint.config.js` documents this explicitly, but it matters here too: flat
config does **not** merge `no-restricted-imports` `patterns` arrays across
blocks that both match the same file - the last matching block wins for that
rule. So each block in `eslint.config.js` owns one non-overlapping file class,
and each fixture lives under the matching subfolder so it only ever matches
the one block it is meant to test:

- `non-feature/` mirrors "everything under `src/` except `features/**` and
  `lib/**`" (client-import ban only).
- `feature-like/` mirrors "`src/features/**` except `api/**`" (client-import
  ban + table ban combined in one block).

If you add a fixture for a new rule, either reuse an existing subfolder if
the file class matches, or add a new subfolder plus a matching glob entry in
the relevant `eslint.config.js` block.

## Adding a new fixture

1. Add a new `*.fixture.ts`/`*.fixture.tsx` file under the subfolder matching
   the file class it should be linted as (see above), or create a new
   subfolder plus a matching `eslint.config.js` glob if none fits.
2. Add a row to the table above.
3. Re-run `bash scripts/check-architecture-fixtures.sh` and confirm it still
   exits non-zero.

Do not "fix" the violations in this folder — that defeats the point. If a
rule's intent changes, update the fixture (and this table) to match the new
intent instead.
