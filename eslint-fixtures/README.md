# ESLint guardrail fixtures

Negative (and a few positive) fixtures for the architecture and styling guardrails in
`eslint.config.mjs` and `eslint-rules/console.mjs`. They prove the rules still fire: a rule
that silently stops matching fails `bun run test:unit`.

- The tree mirrors `app/`. `test/unit/lint-guardrails.test.ts` lints each file **as if** it
  lived at the same path without the `eslint-fixtures/` prefix
  (`eslint-fixtures/app/pages/x.vue` is linted as `app/pages/x.vue`), so the real file-class
  rules apply. `eslint .` ignores this folder, and nothing here is built, type-checked or
  auto-imported.
- Mark every line that must be reported with `expect-error: <rule-id>[, <rule-id>]` in a
  comment on that line. The test fails when a marked rule does not fire on its line, or when
  any guardrail rule fires on a line that does not list it. Unmarked lines are the positive
  cases: patterns the rules must keep allowing.
- Only the guardrail rules are compared (`GUARDRAIL_RULES` in the test); other lint findings
  in fixtures are ignored.

When you add a guardrail rule, add a fixture line for it here; the test also fails when a
guardrail rule has no fixture.
