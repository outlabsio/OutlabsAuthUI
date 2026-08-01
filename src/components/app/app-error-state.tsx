import type { ReactNode } from 'react'

import { AppStatusCallout } from '@/components/app/app-status-callout'

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
    <AppStatusCallout
      role="alert"
      color="error"
      appearance="soft"
      title={title}
      action={action}
      className={className}
      compact={compact}
    >
      {children}
    </AppStatusCallout>
  )
}
