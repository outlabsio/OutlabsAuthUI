import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { cn } from '@/lib/utils/cn'

type AppShellActionContextValue = {
  container: HTMLDivElement | null
  setContainer: (container: HTMLDivElement | null) => void
}

const AppShellActionContext = createContext<AppShellActionContextValue | null>(null)

type AppShellActionProviderProps = {
  children: ReactNode
}

export function AppShellActionProvider({
  children,
}: AppShellActionProviderProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const value = useMemo(
    () => ({
      container,
      setContainer,
    }),
    [container]
  )

  return (
    <AppShellActionContext.Provider value={value}>
      {children}
    </AppShellActionContext.Provider>
  )
}

type AppShellActionTargetProps = {
  className?: string
}

export function AppShellActionTarget({
  className,
}: AppShellActionTargetProps) {
  const context = useContext(AppShellActionContext)

  if (!context) {
    throw new Error('AppShellActionTarget must be used within AppShellActionProvider.')
  }

  return (
    <div
      ref={context.setContainer}
      className={cn('ml-auto flex items-center justify-end gap-2 px-2', className)}
    />
  )
}

export function useAppShellActionContainer() {
  const context = useContext(AppShellActionContext)

  if (!context) {
    throw new Error('useAppShellActionContainer must be used within AppShellActionProvider.')
  }

  return context.container
}
