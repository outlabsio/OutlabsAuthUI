import type { ComponentProps } from 'react'

import { Badge } from '@/components/ui/badge'
import {
  type AppStatusAppearance,
  type AppStatusTone,
  getAppStatusClasses,
} from '@/components/app/app-status'
import { cn } from '@/lib/utils/cn'

type AppStatusBadgeProps = Omit<ComponentProps<typeof Badge>, 'variant'> & {
  tone?: AppStatusTone
  appearance?: AppStatusAppearance
}

export function AppStatusBadge({
  className,
  tone = 'neutral',
  appearance = 'soft',
  ...props
}: AppStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'shadow-none [&>svg]:opacity-80',
        getAppStatusClasses(tone, appearance),
        className
      )}
      {...props}
    />
  )
}
