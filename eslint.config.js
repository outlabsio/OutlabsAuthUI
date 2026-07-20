import js from '@eslint/js'
import pluginQuery from '@tanstack/eslint-plugin-query'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'architecture-fixtures']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      pluginQuery.configs['flat/recommended'],
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'react-refresh/only-export-components': [
        'error',
        {
          allowConstantExport: true,
          allowExportNames: [
            'Route',
            'useAppShellLeadingContainer',
            'useAppShellActionContainer',
            'useAppShellMetaContainer',
          ],
        },
      ],
    },
  },
  {
    files: ['src/app/router/routes/**/*.tsx', 'src/components/ui/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },

  // --- Architecture boundary guardrails ---
  //
  // IMPORTANT: `no-restricted-imports` is set at most ONCE per file via any
  // single matching block below. Flat config does not merge `patterns`
  // arrays across blocks that touch the same rule for the same file - the
  // last matching block simply replaces the rule's options. That means a
  // file that legitimately needs two `no-restricted-imports` bans (e.g. a
  // feature component banned from both the transport client and the raw
  // table primitive) MUST get both patterns from one combined block, not two
  // separate blocks that each set the rule on their own. Each block below
  // owns one complete, non-overlapping file class.

  // 1) No raw `fetch`. All HTTP must go through `lib/api/client.ts`; the only
  // other approved caller is `lib/runtime-config.ts` (config file probe).
  // Uses `no-restricted-globals`, so it never collides with the
  // `no-restricted-imports` blocks below.
  {
    files: ['src/**/*.{ts,tsx}', 'architecture-fixtures/**/*.{ts,tsx}'],
    ignores: ['src/lib/api/**', 'src/lib/runtime-config.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            'Do not call fetch() directly. Use apiClient from "@/lib/api/client" (feature api/ files only).',
        },
      ],
    },
  },

  // 2) File class: everything under `src/` EXCEPT `src/features/**` and
  // `src/lib/**` (e.g. `src/app/**`, `src/components/**`). These may not
  // import the transport client directly - only feature `api/` files and
  // `src/lib/**` infrastructure may.
  {
    files: [
      'src/**/*.{ts,tsx}',
      'architecture-fixtures/non-feature/**/*.{ts,tsx}',
    ],
    ignores: ['src/features/**', 'src/lib/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/lib/api/client'],
              message:
                'Only feature api/ files may import the transport client. Add a request function under features/<feature>/api/ instead.',
            },
          ],
        },
      ],
    },
  },

  // 3) File class: `src/features/**` EXCEPT `src/features/**/api/**`. These
  // files may not import the transport client directly (must go through a
  // feature api file), and may not import the raw table primitive (must use
  // AppDataTable). Both bans live in one block/one `patterns` array because
  // they apply to the same file class.
  {
    files: [
      'src/features/**/*.{ts,tsx}',
      'architecture-fixtures/feature-like/**/*.{ts,tsx}',
    ],
    ignores: ['src/features/**/api/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/lib/api/client'],
              message:
                'Only feature api/ files may import the transport client. Add a request function under features/<feature>/api/ instead.',
            },
            {
              group: ['@/components/ui/table'],
              message:
                'Features must use AppDataTable from "@/components/app/app-data-table" instead of the raw table primitive.',
            },
          ],
        },
      ],
    },
  },
])
