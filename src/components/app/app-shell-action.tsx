import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { cn } from '@/lib/utils/cn'

type AppShellActionContextValue = {
  actionContainer: HTMLDivElement | null
  setActionContainer: (container: HTMLDivElement | null) => void
  metaContainer: HTMLDivElement | null
  setMetaContainer: (container: HTMLDivElement | null) => void
}

const AppShellActionContext = createContext<AppShellActionContextValue | null>(null)

type AppShellActionProviderProps = {
  children: ReactNode
}

export function AppShellActionProvider({
  children,
}: AppShellActionProviderProps) {
  const [actionContainer, setActionContainer] = useState<HTMLDivElement | null>(null)
  const [metaContainer, setMetaContainer] = useState<HTMLDivElement | null>(null)
  const value = useMemo(
    () => ({
      actionContainer,
      setActionContainer,
      metaContainer,
      setMetaContainer,
    }),
    [actionContainer, metaContainer]
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
      ref={context.setActionContainer}
      className={cn('flex min-w-0 items-center justify-end gap-2 px-2', className)}
    />
  )
}

export function useAppShellActionContainer() {
  const context = useContext(AppShellActionContext)

  if (!context) {
    throw new Error('useAppShellActionContainer must be used within AppShellActionProvider.')
  }

  return context.actionContainer
}

export function AppShellMetaTarget({
  className,
}: AppShellActionTargetProps) {
  const context = useContext(AppShellActionContext)

  if (!context) {
    throw new Error('AppShellMetaTarget must be used within AppShellActionProvider.')
  }

  return (
    <div
      ref={context.setMetaContainer}
      className={cn('flex min-w-0 items-center justify-center px-2', className)}
    />
  )
}

export function useAppShellMetaContainer() {
  const context = useContext(AppShellActionContext)

  if (!context) {
    throw new Error('useAppShellMetaContainer must be used within AppShellActionProvider.')
  }

  return context.metaContainer
}
