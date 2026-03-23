import type { HTMLAttributes, ReactNode } from 'react'

import {
  type AppStatusAppearance,
  type AppStatusTone,
  getAppStatusClasses,
} from '@/components/app/app-status'
import { cn } from '@/lib/utils/cn'

type AppStatusCalloutProps = HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  tone?: AppStatusTone
  appearance?: AppStatusAppearance
  compact?: boolean
}

export function AppStatusCallout({
  title,
  action,
  children,
  className,
  tone = 'neutral',
  appearance = 'soft',
  compact = false,
  ...props
}: AppStatusCalloutProps) {
  return (
    <div
      className={cn(
        'rounded-xl border text-sm',
        compact ? 'px-4 py-3' : 'px-4 py-4',
        getAppStatusClasses(tone, appearance),
        className
      )}
      {...props}
    >
      <div className="space-y-1">
        {title ? <div className="font-medium">{title}</div> : null}
        <div>{children}</div>
      </div>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}
