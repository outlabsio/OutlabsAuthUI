import { useCallback, useEffect, useMemo, useState } from 'react'

import { ApiError } from '@/lib/api/errors'

export const DEFAULT_AUTH_REQUEST_COOLDOWN_SECONDS = 60

type AuthRequestCooldownKind = 'access-code' | 'forgot-password' | 'magic-link'

type StoredAuthRequestCooldown = {
  durationSeconds: number
  expiresAt: number
}

type UseAuthRequestCooldownOptions = {
  defaultDurationSeconds?: number
  /** Email or E.164 phone used as the cooldown key. */
  identifier: string | null | undefined
  kind: AuthRequestCooldownKind
}

const cooldownStoragePrefix = 'outlabs-auth.request-cooldown'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeIdentifier(identifier: string | null | undefined) {
  return identifier?.trim().toLowerCase() ?? ''
}

function getStorageKey(kind: AuthRequestCooldownKind, identifier: string) {
  return `${cooldownStoragePrefix}.${kind}.${encodeURIComponent(identifier)}`
}

function readStoredCooldown(key: string): StoredAuthRequestCooldown | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const rawValue = window.localStorage.getItem(key)

    if (!rawValue) {
      return null
    }

    const parsed = JSON.parse(rawValue) as unknown

    if (
      !isRecord(parsed) ||
      typeof parsed.expiresAt !== 'number' ||
      typeof parsed.durationSeconds !== 'number'
    ) {
      window.localStorage.removeItem(key)
      return null
    }

    if (parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(key)
      return null
    }

    return {
      durationSeconds: parsed.durationSeconds,
      expiresAt: parsed.expiresAt,
    }
  } catch {
    window.localStorage.removeItem(key)
    return null
  }
}

function writeStoredCooldown(key: string, cooldown: StoredAuthRequestCooldown) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(key, JSON.stringify(cooldown))
}

function removeStoredCooldown(key: string | null) {
  if (!key || typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(key)
}

function secondsUntil(expiresAt: number | null, now = Date.now()) {
  if (!expiresAt) {
    return 0
  }

  return Math.max(0, Math.ceil((expiresAt - now) / 1000))
}

function readRetryAfterValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.ceil(value))
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)

    return Number.isFinite(parsed) ? Math.max(0, Math.ceil(parsed)) : null
  }

  return null
}

export function getRetryAfterSeconds(error: unknown) {
  if (!(error instanceof ApiError)) {
    return null
  }

  const payload = error.data

  if (!payload) {
    return null
  }

  const directRetryAfter = readRetryAfterValue(payload.retry_after_seconds)

  if (directRetryAfter != null) {
    return directRetryAfter
  }

  if (isRecord(payload.detail)) {
    const retryAfterSeconds = readRetryAfterValue(
      payload.detail.retry_after_seconds
    )

    if (retryAfterSeconds != null) {
      return retryAfterSeconds
    }
  }

  if (isRecord(payload.details)) {
    return readRetryAfterValue(payload.details.retry_after_seconds)
  }

  return null
}

export function formatCooldown(seconds: number) {
  if (seconds < 60) {
    return `${seconds}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  return remainingSeconds > 0
    ? `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`
    : `${minutes}m`
}

export function useAuthRequestCooldown({
  defaultDurationSeconds = DEFAULT_AUTH_REQUEST_COOLDOWN_SECONDS,
  identifier,
  kind,
}: UseAuthRequestCooldownOptions) {
  const normalizedIdentifier = useMemo(
    () => normalizeIdentifier(identifier),
    [identifier]
  )
  const storageKey = useMemo(
    () =>
      normalizedIdentifier ? getStorageKey(kind, normalizedIdentifier) : null,
    [kind, normalizedIdentifier]
  )
  const [now, setNow] = useState(() => Date.now())
  const cooldown = storageKey ? readStoredCooldown(storageKey) : null
  const secondsRemaining = secondsUntil(cooldown?.expiresAt ?? null, now)

  useEffect(() => {
    if (!cooldown) {
      return
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [cooldown])

  const startCooldown = useCallback(
    (durationSeconds = defaultDurationSeconds) => {
      if (!storageKey || durationSeconds <= 0) {
        return
      }

      const nextCooldown = {
        durationSeconds,
        expiresAt: Date.now() + durationSeconds * 1000,
      }

      writeStoredCooldown(storageKey, nextCooldown)
      setNow(Date.now())
    },
    [defaultDurationSeconds, storageKey]
  )

  const resetCooldown = useCallback(() => {
    removeStoredCooldown(storageKey)
    setNow(Date.now())
  }, [storageKey])

  const durationSeconds =
    cooldown?.durationSeconds ?? defaultDurationSeconds
  const progressPercent =
    secondsRemaining > 0 && durationSeconds > 0
      ? Math.max(
          0,
          Math.min(100, ((durationSeconds - secondsRemaining) / durationSeconds) * 100)
        )
      : 0

  return {
    isCoolingDown: secondsRemaining > 0,
    progressPercent,
    resetCooldown,
    secondsRemaining,
    startCooldown,
  }
}
