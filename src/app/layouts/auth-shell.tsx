import type { ReactNode } from 'react'

import { AppThemeToggle } from '@/components/app/app-theme-toggle'

type AuthShellProps = {
  children: ReactNode
}

export function AuthShell({ children }: AuthShellProps) {
  return (
    <div className="min-h-screen px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-7xl justify-end">
        <AppThemeToggle />
      </div>
      <div className="mx-auto flex min-h-[calc(100svh-5rem)] w-full max-w-7xl items-center justify-center">
        {children}
      </div>
    </div>
  )
}
