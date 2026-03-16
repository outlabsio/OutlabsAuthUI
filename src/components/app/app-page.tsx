import type { ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

type AppPageProps = {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
  toolbar?: ReactNode
  children: ReactNode
  className?: string
}

export function AppPage({
  eyebrow,
  title,
  description,
  action,
  toolbar,
  children,
  className,
}: AppPageProps) {
  return (
    <section className={cn('flex flex-col gap-6', className)}>
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3">
            {eyebrow ? (
              <p className="text-xs font-semibold tracking-[0.24em] text-muted-foreground uppercase">
                {eyebrow}
              </p>
            ) : null}
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {title}
              </h1>
              {description ? (
                <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        {toolbar}
      </header>
      {children}
    </section>
  )
}
