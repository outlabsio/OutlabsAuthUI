# Runtime Configuration

`OutlabsAuthUI` is designed to stay generic. This repo should not carry committed presets for individual consumer projects.

## Precedence

Config is resolved in this order:

1. `window.__OUTLABS_AUTH_UI_CONFIG__`
2. `/app-config.json`
3. Vite env vars
4. built-in defaults

That lets the same built frontend point at different mounted auth backends without adding named project scripts to the repo.

## Runtime File

Create an untracked `public/app-config.json` for local work, or ship `app-config.json` next to the built assets in deployment.

Use [`public/app-config.template.json`](../public/app-config.template.json) as the starting point.

Supported keys:

- `apiBaseUrl`
- `authApiPrefix`
- `appName`
- `appSubtitle`
- `authBrand`
- `signInDescription`

Example:

```json
{
  "apiBaseUrl": "http://127.0.0.1:8050",
  "authApiPrefix": "/iam",
  "appName": "Auth Console",
  "appSubtitle": "Shared admin access for mounted auth backends",
  "authBrand": "OutlabsAuth",
  "signInDescription": "Sign in against the configured auth backend to access this console."
}
```

## Vite Env Fallback

For quick local work, `.env.local` can still provide:

- `VITE_API_BASE_URL`
- `VITE_AUTH_API_PREFIX`
- `VITE_APP_NAME`
- `VITE_APP_SUBTITLE`
- `VITE_AUTH_BRAND`
- `VITE_SIGN_IN_DESCRIPTION`

The repo includes [`.env.example`](../.env.example) as a neutral reference.

## Deployment Guidance

- Keep consumer-specific targets out of committed source.
- Prefer runtime `app-config.json` over committed build presets.
- If a hosting platform can inject inline config before the app boots, populate `window.__OUTLABS_AUTH_UI_CONFIG__` instead of rebuilding the app per consumer.
