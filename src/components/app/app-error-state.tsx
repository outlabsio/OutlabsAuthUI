import type { ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

type AppErrorStateProps = {
  title?: string
  children: ReactNode
  action?: ReactNode
  className?: string
  compact?: boolean
}

export function AppErrorState({
  title,
  children,
  action,
  className,
  compact = false,
}: AppErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-xl border border-destructive/20 bg-destructive/5 text-sm text-destructive',
        compact ? 'px-4 py-3' : 'px-4 py-4',
        className
      )}
    >
      <div className="space-y-1">
        {title ? <div className="font-medium">{title}</div> : null}
        <div>{children}</div>
      </div>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}
