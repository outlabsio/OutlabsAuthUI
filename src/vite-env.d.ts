/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_AUTH_API_PREFIX?: string
  readonly VITE_APP_NAME?: string
  readonly VITE_APP_SUBTITLE?: string
  readonly VITE_AUTH_BRAND?: string
  readonly VITE_SIGN_IN_DESCRIPTION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
