import type { ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

type AppEmptyStateProps = {
  title: string
  description?: ReactNode
  action?: ReactNode
  icon?: ReactNode
  className?: string
  compact?: boolean
}

export function AppEmptyState({
  title,
  description,
  action,
  icon,
  className,
  compact = false,
}: AppEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 text-center',
        compact ? 'py-5 text-sm' : 'py-8 text-sm',
        className
      )}
    >
      {icon ? (
        <div className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <h2 className="font-medium text-foreground">{title}</h2>
        {description ? (
          <p className="text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
