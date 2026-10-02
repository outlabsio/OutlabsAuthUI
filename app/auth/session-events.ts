import type { SessionEndReason } from '~/utils/session-lifecycle'

// The "this tab's session just ended" signal. The API client announces it when a refresh is
// refused (expiry, revocation, reuse detection, password change); the session-sync plugin
// clears cached server state and routes to sign-in with the reason and a way back.
//
// A session can end during boot, before the router has made its first navigation. The reason
// is therefore also held here briefly so the auth guard can put it on its sign-in redirect.

export const SESSION_ENDED_EVENT = 'outlabs-auth:session-ended'

export type SessionEndedDetail = { reason: SessionEndReason }

const PENDING_TTL_MS = 15_000
let pending: { reason: SessionEndReason, at: number } | null = null

export function announceSessionEnd(reason: SessionEndReason) {
  pending = { reason, at: Date.now() }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<SessionEndedDetail>(SESSION_ENDED_EVENT, { detail: { reason } }))
  }
}

export function onSessionEnded(handler: (detail: SessionEndedDetail) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<SessionEndedDetail>).detail)
  window.addEventListener(SESSION_ENDED_EVENT, listener)
  return () => window.removeEventListener(SESSION_ENDED_EVENT, listener)
}

// The most recent end reason, once, if it is still fresh.
export function consumePendingSessionEnd(): SessionEndReason | null {
  const current = pending
  pending = null
  return current && Date.now() - current.at <= PENDING_TTL_MS ? current.reason : null
}
