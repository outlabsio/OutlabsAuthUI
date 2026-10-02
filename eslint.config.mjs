// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
import consolePlugin, { DEFAULT_UI_ALLOWLIST } from './eslint-rules/console.mjs'

// Architecture guardrails (AGENTS.md, "Layers" and "Styling"). Each one is pinned by a negative
// fixture under eslint-fixtures/, linted by test/unit/lint-guardrails.test.ts, so a rule that
// stops firing fails the unit tests.
//
// Flat config does not merge one rule's options across blocks: for a file matched by two
// blocks, the later block's options replace the earlier ones. Each block below therefore
// repeats the complete list for its file class, from the widest class to the narrowest.

/** Display layer: templates plus presentational helpers, one composable call. */
const VIEWS = [
  'app/pages/**/*.{ts,vue}',
  'app/components/**/*.{ts,vue}',
  'app/layouts/**/*.{ts,vue}',
  'app/app.vue',
  'app/error.vue'
]

const API_CLIENT = ['~/api/client', '@/api/client', '~~/app/api/client', '@@/app/api/client', '**/api/client']

const QUERIES = ['~/queries/*', '@/queries/*', '~~/app/queries/*', '@@/app/queries/*', '**/queries/*', '**/queries']

/** `import { useQuery } from '#imports'` binds an auto-import by name, which no-restricted-globals cannot see. */
const NUXT_IMPORTS = ['#imports', '#app']

const REQUEST_MESSAGE = 'HTTP goes through app/api/client.ts, called only from app/queries/<resource>.ts; server state is Pinia Colada (AGENTS.md, "Layers").'
const VIEW_MESSAGE = 'Pages and components never touch server state: call the feature composable, which uses app/queries/<resource>.ts (AGENTS.md, "Layers").'
const STORE_MESSAGE = 'A Pinia store never runs a query or mutation (it would never be disposed); read cached server data with useQueryCache() (AGENTS.md, "Layers").'
const API_CLIENT_MESSAGE = 'Only app/queries/<resource>.ts calls apiClient: add a query or mutation there (AGENTS.md, "Layers").'

const RAW_REQUEST_NAMES = ['fetch', '$fetch', 'useFetch', 'useLazyFetch', 'useAsyncData', 'useLazyAsyncData']
const COLADA_IN_VIEWS_NAMES = [
  'useQuery', 'useMutation', 'useInfiniteQuery', 'useQueryCache', 'useMutationCache', 'useQueryState',
  'defineQuery', 'defineMutation', 'defineQueryOptions'
]
const QUERIES_IN_STORES_NAMES = ['useQuery', 'useMutation', 'useInfiniteQuery', 'defineQuery', 'defineMutation']

const RAW_REQUESTS = RAW_REQUEST_NAMES.map(name => ({ name, message: REQUEST_MESSAGE }))
const COLADA_IN_VIEWS = COLADA_IN_VIEWS_NAMES.map(name => ({ name, message: VIEW_MESSAGE }))
const QUERIES_IN_STORES = QUERIES_IN_STORES_NAMES.map(name => ({ name, message: STORE_MESSAGE }))

/** The same requests reached through an object: window.fetch, globalThis.fetch, useNuxtApp().$fetch. */
const RAW_REQUEST_PROPERTIES = [
  ...['window', 'globalThis', 'self'].map(object => ({ object, property: 'fetch', message: REQUEST_MESSAGE })),
  { property: '$fetch', message: REQUEST_MESSAGE }
]

/**
 * @param {string[]} importNames
 * @param {string} message
 */
const fromNuxtImports = (importNames, message) =>
  NUXT_IMPORTS.map(name => ({ name, importNames, allowTypeImports: true, message }))

const API_CLIENT_ONLY = { group: API_CLIENT, importNames: ['apiClient'], allowTypeImports: true, message: API_CLIENT_MESSAGE }

const STYLE_MESSAGE = 'No inline or component styles: use Nuxt UI components, their props and stock utilities (AGENTS.md, "Styling").'

export default withNuxt({
  ignores: ['.wrangler/**', 'eslint-fixtures/**']
}, {
  rules: {
    'vue/no-multiple-template-root': 'off',
    'vue/max-attributes-per-line': ['error', { singleline: 3 }]
  }
}, {
  // Requests: only the API client (and the boot config probe) touch the network.
  files: ['app/**/*.{ts,vue}'],
  ignores: ['app/api/**', 'app/utils/runtime-config.ts'],
  rules: {
    'no-restricted-globals': ['error', ...RAW_REQUESTS],
    'no-restricted-properties': ['error', ...RAW_REQUEST_PROPERTIES]
  }
}, {
  files: ['app/stores/**/*.ts'],
  rules: {
    'no-restricted-globals': ['error', ...RAW_REQUESTS, ...QUERIES_IN_STORES]
  }
}, {
  files: VIEWS,
  rules: {
    'no-restricted-globals': ['error', ...RAW_REQUESTS, ...COLADA_IN_VIEWS]
  }
}, {
  // Imports, the same walls for names bound explicitly. apiClient belongs to
  // app/queries/<resource>.ts; composables use its error helpers only. Type-only imports are
  // fine everywhere (the typescript-eslint variant allows them).
  files: ['app/**/*.{ts,vue}'],
  ignores: ['app/api/**', 'app/queries/**'],
  rules: {
    '@typescript-eslint/no-restricted-imports': ['error', {
      paths: fromNuxtImports(RAW_REQUEST_NAMES, REQUEST_MESSAGE),
      patterns: [API_CLIENT_ONLY]
    }]
  }
}, {
  files: ['app/queries/**/*.ts'],
  rules: {
    '@typescript-eslint/no-restricted-imports': ['error', {
      paths: fromNuxtImports(RAW_REQUEST_NAMES, REQUEST_MESSAGE)
    }]
  }
}, {
  files: ['app/stores/**/*.ts'],
  rules: {
    '@typescript-eslint/no-restricted-imports': ['error', {
      paths: [
        ...['@pinia/colada', '@pinia/colada-nuxt'].map(name => ({
          name,
          importNames: QUERIES_IN_STORES_NAMES,
          allowTypeImports: true,
          message: STORE_MESSAGE
        })),
        ...fromNuxtImports([...QUERIES_IN_STORES_NAMES, ...RAW_REQUEST_NAMES], STORE_MESSAGE)
      ],
      patterns: [API_CLIENT_ONLY]
    }]
  }
}, {
  // Views import no server state at all: not Colada, not the client, not app/queries hooks
  // (types from them are fine).
  files: VIEWS,
  rules: {
    '@typescript-eslint/no-restricted-imports': ['error', {
      paths: [
        ...['@pinia/colada', '@pinia/colada-nuxt'].map(name => ({ name, allowTypeImports: true, message: VIEW_MESSAGE })),
        ...fromNuxtImports([...COLADA_IN_VIEWS_NAMES, ...RAW_REQUEST_NAMES], VIEW_MESSAGE)
      ],
      patterns: [{
        group: API_CLIENT,
        allowTypeImports: true,
        message: 'Pages and components never import the API client: the feature composable owns requests and their errors (AGENTS.md, "Layers").'
      }, {
        group: QUERIES,
        allowTypeImports: true,
        message: VIEW_MESSAGE
      }]
    }]
  }
}, {
  plugins: { console: consolePlugin }
}, {
  // Styling: semantic colours and stock utilities only, everywhere in app/.
  files: ['app/**/*.{ts,vue}'],
  ignores: ['app/types/api.gen.ts'],
  rules: {
    'console/no-raw-tailwind': 'error'
  }
}, {
  files: ['app/**/*.vue'],
  rules: {
    'console/ui-allowlist': ['error', DEFAULT_UI_ALLOWLIST],
    'vue/no-restricted-static-attribute': ['error', { key: 'style', message: STYLE_MESSAGE }],
    'vue/no-restricted-v-bind': ['error', { argument: 'style', message: STYLE_MESSAGE }],
    'vue/no-restricted-block': ['error', { element: 'style', message: STYLE_MESSAGE }]
  }
}, {
  // E2E reaches elements by role and accessible name, never by id (F-232): an id locator cannot
  // notice a field that lost its label. data-testid only where no accessible name can tell
  // elements apart.
  files: ['e2e/**/*.ts'],
  rules: {
    'no-restricted-syntax': ['error', {
      selector: 'CallExpression[callee.property.name="locator"] > Literal[value=/^#/]:first-child',
      message: 'Locate by role or label (getByRole/getByLabel), not by #id (F-232).'
    }, {
      selector: 'CallExpression[callee.property.name="locator"] > TemplateLiteral:first-child > TemplateElement[value.raw=/^#/]',
      message: 'Locate by role or label (getByRole/getByLabel), not by #id (F-232).'
    }]
  }
})
