import type { ReactNode } from 'react'

import { Link, useRouterState } from '@tanstack/react-router'

import { getAppPageGuide } from '@/app/internal-docs/page-guides'
import { AppPageGuideDrawer } from '@/components/app/app-page-guide-drawer'
import { AppSidebar } from '@/components/app/app-sidebar'
import { AppThemeToggle } from '@/components/app/app-theme-toggle'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { routes } from '@/lib/constants/routes'
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
    <SidebarProvider>
      <AppSidebar
        user={{
          name,
          email,
        }}
        onLogout={onLogout}
      />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border/60 px-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 md:px-4">
          <div className="flex min-w-0 items-center gap-2 px-2">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink render={<Link to={routes.app.dashboard} />}>
                    OutlabsAuth Console
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{currentPage}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="ml-auto flex items-center gap-2 px-2">
            <AppPageGuideDrawer pathname={pathname} />
            <AppThemeToggle />
          </div>
        </header>
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col gap-6 p-4 pt-4 md:p-6 md:pt-5',
            className
          )}
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
