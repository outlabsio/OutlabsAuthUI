import type { ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

type AppToolbarProps = {
  children: ReactNode
  variant?: 'surface' | 'plain'
  className?: string
}

export function AppToolbar({
  children,
  variant = 'surface',
  className,
}: AppToolbarProps) {
  return (
    <div
      className={cn(
        'min-w-0',
        variant === 'surface' ? 'rounded-xl border bg-muted/40 px-3 py-2.5' : null,
        className
      )}
    >
      {children}
    </div>
  )
}
