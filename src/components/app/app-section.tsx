import type { ReactNode } from 'react'

import { AppInfoPopover } from '@/components/app/app-info-popover'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils/cn'

type AppSectionProps = {
  title: string
  description?: string
  info?: {
    label: string
    title: string
    content: ReactNode
  }
  action?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
}

export function AppSection({
  title,
  description,
  info,
  action,
  children,
  className,
  contentClassName,
}: AppSectionProps) {
  return (
    <Card className={cn('border border-border/70 bg-card/90 ring-0', className)}>
      <CardHeader className="border-b border-border/60">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{title}</CardTitle>
              {info ? (
                <AppInfoPopover label={info.label} title={info.title}>
                  {info.content}
                </AppInfoPopover>
              ) : null}
            </div>
            {description ? (
              <p className="text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  )
}
