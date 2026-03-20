import type { ReactNode } from 'react'

import { useRouterState } from '@tanstack/react-router'

import { getAppPageGuide } from '@/app/internal-docs/page-guides'
import { AppPageGuideDrawer } from '@/components/app/app-page-guide-drawer'
import {
  AppShellActionProvider,
  AppShellMetaTarget,
  AppShellActionTarget,
} from '@/components/app/app-shell-action'
import { AppSidebar } from '@/components/app/app-sidebar'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils/cn'

type AppShellProps = {
  email: string
  name: string
  onLogout: () => void
  children: ReactNode
  className?: string
}

function formatSegment(segment: string) {
  return segment
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function AppShell({
  email,
  name,
  onLogout,
  children,
  className,
}: AppShellProps) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const currentGuide = getAppPageGuide(pathname)

  const segments = pathname
    .split('/')
    .filter(Boolean)
    .filter((segment) => segment !== 'app')

  const currentPage =
    currentGuide.label ||
    (segments.length > 0 ? formatSegment(segments[segments.length - 1]) : 'Dashboard')

  return (
    <AppShellActionProvider>
      <SidebarProvider className="h-svh overflow-hidden">
        <AppSidebar
          user={{
            name,
            email,
          }}
          onLogout={onLogout}
        />
        <SidebarInset className="min-h-0 overflow-hidden">
          <header className="z-20 grid h-16 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border/60 bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 md:px-4">
            <div className="flex min-w-0 items-center gap-2 px-2">
              <SidebarTrigger className="-ml-1" />
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium text-foreground">
                  {currentPage}
                </span>
                <AppPageGuideDrawer pathname={pathname} />
              </div>
            </div>
            <AppShellMetaTarget />
            <AppShellActionTarget />
          </header>
          <div
            className={cn(
              'flex min-h-0 flex-1 flex-col gap-6 overflow-x-hidden overflow-y-auto overscroll-contain p-4 pt-4 md:p-6 md:pt-5',
              className
            )}
          >
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </AppShellActionProvider>
  )
}
