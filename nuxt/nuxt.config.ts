// https://nuxt.com/docs/api/configuration/nuxt-config
//
// OutlabsAuthUI — Nuxt port. SPA mode (ssr: false): this is a runtime-configurable
// admin console pointed at any outlabsAuth deployment. No server rendering, no Nitro
// server routes in production — static output deployed to Cloudflare Workers, same as
// the React app. Backend target is discovered at boot from /app-config.json (see
// app/utils/runtime-config.ts), never baked into the build.
export default defineNuxtConfig({

  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vueuse/nuxt',
    '@pinia/nuxt',
    '@pinia/colada-nuxt'
  ],
  ssr: false,

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  // Env-var fallback for the runtime app-config (dev + CI). Production resolves these
  // from /app-config.json at boot; these keys are the dev/E2E fallback and mirror the
  // React app's VITE_* inputs. Override via NUXT_PUBLIC_* env vars.
  runtimeConfig: {
    public: {
      apiBaseUrl: '',
      authApiPrefix: '',
      frontendProfileKey: '',
      appName: '',
      appSubtitle: '',
      authBrand: '',
      signInDescription: '',
      oauthProviders: ''
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
  }
})
