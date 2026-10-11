# Dependency maintenance

## 2026-10-11 — Nuxt and Nuxt UI

Upgrade Nuxt from 4.5.2 to 4.6.1 and Nuxt UI from 4.11.0 to 4.11.3, using stable releases.
The static SPA architecture, runtime deployment configuration and backend contract stay the same.

Supporting updates:

- `@internationalized/date` 3.12.4 matches Nuxt UI's date types, avoiding duplicate class
  identities in date inputs and calendars.
- Vue 3.5.43 aligns the app and framework runtime/compiler dependencies. Duplicate Vue
  installations had made template-only auto-imports fail type checking. No explicit helper
  imports or template changes are necessary after aligning Vue.
- Wrangler 4.149.0 picks up patched build/deployment dependencies. The lockfile also updates
  the vulnerable compatible releases of selector parsing, ProseMirror, shell quoting and
  source-map handling.
- Playwright 1.64.0 updates the verification browsers. The first full cross-browser run with
  1.62.1 exposed Firefox navigation timeouts even with rendered pages and completed requests,
  matching the symptom reported in [Playwright #42183](https://github.com/microsoft/playwright/issues/42183).
  The strict flaky-test gate and all test assertions remain enabled.
  The simulated OAuth Back test now cancels its provider navigation and waits for the
  cancellation before asserting the preserved page's loading state and dispatching its
  persisted `pageshow` event. This replaces a 204 fixture that left a navigation pending
  in the updated browser; it keeps the same loading/reset assertions.
- Override `simple-git` to 4.0.1 and its `@simple-git/argv-parser` to 2.0.1 to address the
  current Git command/configuration advisories. Nuxt DevTools 3.4.2 still requests the old
  major and imports its removed default export. The committed Bun patch changes that import
  to the supported `simpleGit` named export. This is a development-tool compatibility patch;
  it changes no application behavior. Remove the overrides and patch together when a stable
  DevTools release uses patched Git dependencies and the named export.

The existing audit exclusions are unchanged. Use `bun run audit` for the project's accepted
policy; it still excludes the previously documented advisories with no published fixes.

The browser suite exposed a code-field blur race: validating an unfinished code while clicking
"Use a different number" inserted an error and moved the button between pointer-down and
pointer-up, losing the click. Phone verification and the shared one-time-code form now validate
on completion or submission, keeping navigation away from an unfinished code usable. The phone
verification suite covers both the original empty-code click and leaving a partly entered code.

Verification uses a frozen install, app/test type checks, lint, 845 unit tests, generated API
snapshot consistency, dependency audit, static generation and the existing bundle budget.
The full browser gate runs against disposable seeded outlabs-auth 0.1.0a36 EnterpriseRBAC
and SimpleRBAC example backends, including Firefox, WebKit and mobile Chromium:

```bash
bun run release:check --enterprise http://localhost:8004 --simple http://localhost:8003 \
  --browsers firefox,webkit,mobile-chrome
```

The machine-local `.release/gate.json` records the verified commit and results. Consumer
repinning and deployment remain separate operations.
