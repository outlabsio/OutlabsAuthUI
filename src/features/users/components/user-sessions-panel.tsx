import { useState } from 'react'

import type { UseQueryResult } from '@tanstack/react-query'

import { AppEmptyState } from '@/components/app/app-empty-state'
import { AppErrorState } from '@/components/app/app-error-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DetailSection } from '@/features/users/components/user-details-section'
import type { UserSession } from '@/features/users/types/user-session.types'
import { formatDateTime } from '@/features/users/utils/user-details-display'
import { getApiErrorMessage } from '@/lib/api/errors'

function summarizeUserAgent(userAgent?: string | null) {
  if (!userAgent?.trim()) {
    return 'Unknown client'
  }

  const value = userAgent.trim()
  return value.length > 72 ? `${value.slice(0, 69)}…` : value
}

type UserSessionsPanelProps = {
  title?: string
  description?: string
  canRevoke: boolean
  sessionsQuery: UseQueryResult<UserSession[]>
  isRevokingSession: boolean
  isRevokingAll: boolean
  revokingSessionId?: string | null
  onRevokeSession: (sessionId: string) => Promise<void>
  onRevokeAll: () => Promise<void>
}

export function UserSessionsPanel({
  title = 'Active sessions',
  description = 'Refresh-token sessions currently able to renew access for this account.',
  canRevoke,
  sessionsQuery,
  isRevokingSession,
  isRevokingAll,
  revokingSessionId = null,
  onRevokeSession,
  onRevokeAll,
}: UserSessionsPanelProps) {
  const [confirmingSessionId, setConfirmingSessionId] = useState<string | null>(
    null
  )
  const [confirmingRevokeAll, setConfirmingRevokeAll] = useState(false)
  const sessions = sessionsQuery.data ?? []

  return (
    <DetailSection
      title={title}
      info={{
        label: 'Explain sessions section',
        title: 'Active sessions',
        content: description,
      }}
      action={
        canRevoke && sessions.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isRevokingAll}
            onClick={() => {
              setConfirmingRevokeAll((current) => !current)
              setConfirmingSessionId(null)
            }}
          >
            Revoke all
          </Button>
        ) : undefined
      }
    >
      {sessionsQuery.isError ? (
        <AppErrorState>
          {getApiErrorMessage(
            sessionsQuery.error,
            'Active sessions could not be loaded.'
          )}
        </AppErrorState>
      ) : sessionsQuery.isPending ? (
        <AppEmptyState title="Loading sessions…" compact />
      ) : sessions.length > 0 ? (
        <div className="space-y-3">
          {confirmingRevokeAll ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/80 px-3 py-2">
              <span className="text-sm text-muted-foreground">
                Revoke every active session for this account?
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isRevokingAll}
                  onClick={() => {
                    setConfirmingRevokeAll(false)
                  }}
                >
                  Keep sessions
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={isRevokingAll}
                  onClick={async () => {
                    try {
                      await onRevokeAll()
                      setConfirmingRevokeAll(false)
                    } catch {
                      return
                    }
                  }}
                >
                  {isRevokingAll ? 'Revoking…' : 'Confirm revoke all'}
                </Button>
              </div>
            </div>
          ) : null}
          {sessions.map((session) => (
            <div
              key={session.id}
              className="rounded-lg border bg-muted/30 px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-medium">
                      {session.device_name?.trim() || 'Browser session'}
                    </div>
                    <Badge variant="secondary">Active</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {summarizeUserAgent(session.user_agent)}
                    {session.ip_address ? ` · ${session.ip_address}` : ''}
                  </div>
                </div>
                {canRevoke ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isRevokingSession}
                    onClick={() => {
                      setConfirmingSessionId((current) =>
                        current === session.id ? null : session.id
                      )
                      setConfirmingRevokeAll(false)
                    }}
                  >
                    Revoke
                  </Button>
                ) : null}
              </div>
              <div className="mt-3 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                <div className="rounded-lg border bg-background/70 px-3 py-2">
                  <div className="font-medium text-foreground">Created</div>
                  <div className="mt-1">
                    {formatDateTime(session.created_at, 'Unknown')}
                  </div>
                </div>
                <div className="rounded-lg border bg-background/70 px-3 py-2">
                  <div className="font-medium text-foreground">Last used</div>
                  <div className="mt-1">
                    {formatDateTime(session.last_used_at, 'Never')}
                  </div>
                </div>
                <div className="rounded-lg border bg-background/70 px-3 py-2">
                  <div className="font-medium text-foreground">Expires</div>
                  <div className="mt-1">
                    {formatDateTime(session.expires_at, 'Unknown')}
                  </div>
                </div>
              </div>
              {confirmingSessionId === session.id ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/80 px-3 py-2">
                  <span className="text-sm text-muted-foreground">
                    Revoke this session immediately?
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isRevokingSession}
                      onClick={() => {
                        setConfirmingSessionId(null)
                      }}
                    >
                      Keep session
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={isRevokingSession}
                      onClick={async () => {
                        try {
                          await onRevokeSession(session.id)
                          setConfirmingSessionId(null)
                        } catch {
                          return
                        }
                      }}
                    >
                      {isRevokingSession && revokingSessionId === session.id
                        ? 'Revoking…'
                        : 'Confirm revoke'}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <AppEmptyState
          title="No active sessions"
          description="No active sessions are stored for this account."
          compact
        />
      )}
    </DetailSection>
  )
}
