import type { ReactNode } from 'react'

import { createPortal } from 'react-dom'

import {
  useAppShellActionContainer,
  useAppShellLeadingContainer,
  useAppShellMetaContainer,
} from '@/components/app/app-shell-action'
import { cn } from '@/lib/utils/cn'

type AppPageProps = {
  eyebrow?: string
  title: string
  description?: string
  hideTitle?: boolean
  padded?: boolean
  shellLeading?: ReactNode
  shellAction?: ReactNode
  shellMeta?: ReactNode
  action?: ReactNode
  toolbar?: ReactNode
  children: ReactNode
  className?: string
}

export function AppPage({
  eyebrow,
  title,
  description,
  hideTitle = false,
  padded = false,
  shellLeading,
  shellAction,
  shellMeta,
  action,
  toolbar,
  children,
  className,
}: AppPageProps) {
  const shellLeadingContainer = useAppShellLeadingContainer()
  const shellActionContainer = useAppShellActionContainer()
  const shellMetaContainer = useAppShellMetaContainer()
  const showIntro = !hideTitle && Boolean(eyebrow || title || description)
  const showHeader = showIntro || Boolean(action) || Boolean(toolbar)

  return (
    <>
      {shellLeading && shellLeadingContainer
        ? createPortal(shellLeading, shellLeadingContainer)
        : null}
      {shellMeta && shellMetaContainer
        ? createPortal(shellMeta, shellMetaContainer)
        : null}
      {shellAction && shellActionContainer
        ? createPortal(shellAction, shellActionContainer)
        : null}
      <section
        className={cn(
          'flex flex-col gap-6',
          padded ? 'px-4 py-4 md:px-6 md:py-5' : null,
          className
        )}
      >
        {hideTitle ? <h1 className="sr-only">{title}</h1> : null}
        {showHeader ? (
          <header className="flex flex-col gap-4">
            {showIntro ? (
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
                {action ? (
                  <div className="w-full md:min-w-0 md:w-auto">{action}</div>
                ) : null}
              </div>
            ) : action ? (
              <div>{action}</div>
            ) : null}
            {toolbar}
          </header>
        ) : null}
        {children}
      </section>
    </>
  )
}
