// Which avatar image the console may show. The shipped CSP allows images from the console's own
// origin and `data:` URLs only (`img-src 'self' data:`, docs/security-posture.md). An OAuth
// provider's picture (`avatar_url`, e.g. a Google or GitHub image host) would be blocked, logged
// as a CSP violation and replaced by the alt text's initials, so it is never bound: the caller
// shows the provider's icon or the account's initials instead. Do not widen img-src to make
// remote avatars load.

/**
 * The avatar URL to bind, or undefined when it may not be shown: a same-origin URL (absolute or
 * relative to `origin`) or a `data:image/` URL. Pure: `origin` is the console's own origin.
 */
export function localImageSrc(url: string | null | undefined, origin: string): string | undefined {
  const value = url?.trim()
  if (!value) return undefined
  if (/^data:image\//i.test(value)) return value
  try {
    const parsed = new URL(value, origin)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined
    return parsed.origin === new URL(origin).origin ? parsed.href : undefined
  } catch {
    return undefined
  }
}
