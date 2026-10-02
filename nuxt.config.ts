// https://nuxt.com/docs/api/configuration/nuxt-config
//
// OutlabsAuthUI. SPA mode (ssr: false): a runtime-configurable admin console pointed at
// any outlabsAuth deployment. No server rendering, no Nitro server routes in production:
// static output deployed to Cloudflare Workers. The backend target is discovered at boot
// from /app-config.json (see app/utils/runtime-config.ts), never baked into the build.

// OAuth providers the outlabsAuth library ships. Their `i-simple-icons-<provider>` names are
// built at runtime from config, so the icon scanner cannot see them; list them explicitly so
// they are bundled with the client like every other icon.
const oauthProviderIcons = ['apple', 'facebook', 'github', 'google'].map(
  provider => `simple-icons:${provider}`
)

export default defineNuxtConfig({

  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vueuse/nuxt',
    '@pinia/nuxt',
    '@pinia/colada-nuxt'
  ],

  $development: {
    // Env-var fallback for the runtime app-config, dev server only. Override via
    // NUXT_PUBLIC_* env vars (see .env.example); /app-config.json still wins over them.
    // Deliberately absent from production builds: `nuxt generate` would otherwise bake the
    // build machine's NUXT_PUBLIC_* values into every HTML shell, and a deployment that
    // forgot its own app-config.json would quietly boot against a developer's API.
    runtimeConfig: {
      public: {
        apiBaseUrl: '',
        authApiPrefix: '',
        frontendProfileKey: '',
        appName: '',
        appSubtitle: '',
        authBrand: '',
        authLogoUrl: '',
        authLogoDarkUrl: '',
        signInDescription: '',
        oauthProviders: '',
        // Auth-flows surfacing config (F0) — what the deployment offers on the sign-in screen.
        // Strings here so NUXT_PUBLIC_AUTH_UI_* env overrides land; app-config.json may use
        // proper types (booleans, arrays). Normalized in app/utils/runtime-config.ts.
        authUi: {
          signup: '',
          identifier: '',
          defaultCountry: '',
          channels: '',
          oauthProviders: '',
          magicLink: '',
          otpLength: ''
        }
      }
    }
  },

  $production: {
    // No runtime icon fetching: anything missing from the client bundle stays blank rather
    // than leaking the console's origin to a third-party API.
    icon: {
      provider: 'none',
      fallbackToApi: false
    }
  },

  ssr: false,

  devtools: {
    enabled: true
  },

  app: {
    head: {
      script: [
        // Zod 4 probes `new Function` to enable its JIT. The CSP has no 'unsafe-eval', so the
        // probe is blocked and reported as a violation on every load. Zod reads this global
        // when its core module first evaluates, so it has to exist before any module script
        // runs; as an inline script it is covered by the generated script-src hashes.
        { innerHTML: 'globalThis.__zod_globalConfig={jitless:true}', tagPriority: 'critical' }
      ]
    }
  },

  css: ['~/assets/css/main.css'],

  // Semantic colour aliases generated as design tokens. Extends the Nuxt UI defaults with
  // `accent` + `special` for more badge variety; each is mapped to a Tailwind palette in
  // app/app.config.ts (neutral is always generated and stays out of this list).
  ui: {
    theme: {
      colors: ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'accent', 'special']
    },
    // Only generate theme CSS for the Nuxt UI components the console renders.
    experimental: {
      componentDetection: true
    }
  },

  compatibilityDate: '2026-06-30',

  // Pure static SPA output (.output/public) — no Nitro server in production.
  nitro: {
    preset: 'static'
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  // Every icon ships inside the client bundle: static names are found by scanning app/ (Vue
  // templates AND TypeScript, where navigation and menu items declare their icons), dynamic
  // provider icons are listed above. Production never asks api.iconify.design for anything.
  icon: {
    clientBundle: {
      scan: {
        globInclude: ['app/**/*.{vue,ts}']
      },
      icons: oauthProviderIcons
    }
  }
})
