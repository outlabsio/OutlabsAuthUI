// The Worker behind the console's static assets (wrangler.toml `main`). It serves nothing.
//
// The asset server answers first: an existing file is served as-is, and a browser navigation
// (Sec-Fetch-Mode: navigate) that matches no file gets index.html, the SPA fallback. Only
// the remaining misses reach this script: a chunk deleted by a newer deployment, an old build
// manifest, an absent /app-config.json, a mistyped asset URL. Answering those with a real 404
// instead of the SPA's HTML keeps Nuxt's newer-deployment check and chunk-error recovery
// working, and keeps a missing config file a clean "not configured" signal.
export default {
  fetch() {
    return new Response('Not found\n', {
      status: 404,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'x-robots-tag': 'noindex, nofollow'
      }
    })
  }
}
