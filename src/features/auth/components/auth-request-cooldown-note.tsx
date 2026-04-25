import { Clock3 } from 'lucide-react'

import { formatCooldown } from '@/features/auth/utils/auth-request-cooldown'

type AuthRequestCooldownNoteProps = {
  actionLabel: string
  progressPercent: number
  secondsRemaining: number
}

export function AuthRequestCooldownNote({
  actionLabel,
  progressPercent,
  secondsRemaining,
}: AuthRequestCooldownNoteProps) {
  if (secondsRemaining <= 0) {
    return null
  }

  return (
    <div
      className="rounded-md border bg-muted/40 p-3 text-sm"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Clock3 className="size-4 shrink-0" aria-hidden="true" />
        <span>
          {actionLabel} in{' '}
          <span className="font-medium text-foreground">
            {formatCooldown(secondsRemaining)}
          </span>
          .
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  )
}
