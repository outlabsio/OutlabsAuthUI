import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { cn } from '@/lib/utils/cn'

type AppShellActionContextValue = {
  leadingContainer: HTMLDivElement | null
  setLeadingContainer: (container: HTMLDivElement | null) => void
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
  const [leadingContainer, setLeadingContainer] = useState<HTMLDivElement | null>(null)
  const [actionContainer, setActionContainer] = useState<HTMLDivElement | null>(null)
  const [metaContainer, setMetaContainer] = useState<HTMLDivElement | null>(null)
  const value = useMemo(
    () => ({
      leadingContainer,
      setLeadingContainer,
      actionContainer,
      setActionContainer,
      metaContainer,
      setMetaContainer,
    }),
    [actionContainer, leadingContainer, metaContainer]
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

export function AppShellLeadingTarget({
  className,
}: AppShellActionTargetProps) {
  const context = useContext(AppShellActionContext)
  const containerRef = useRef<HTMLDivElement | null>(null)

  if (!context) {
    throw new Error('AppShellLeadingTarget must be used within AppShellActionProvider.')
  }

  useEffect(() => {
    context.setLeadingContainer(containerRef.current)

    return () => {
      context.setLeadingContainer(null)
    }
  }, [context])

  return (
    <div
      ref={containerRef}
      className={cn('flex min-w-0 items-center gap-2', className)}
    />
  )
}

export function useAppShellLeadingContainer() {
  const context = useContext(AppShellActionContext)

  if (!context) {
    throw new Error('useAppShellLeadingContainer must be used within AppShellActionProvider.')
  }

  return context.leadingContainer
}

export function AppShellActionTarget({
  className,
}: AppShellActionTargetProps) {
  const context = useContext(AppShellActionContext)
  const containerRef = useRef<HTMLDivElement | null>(null)

  if (!context) {
    throw new Error('AppShellActionTarget must be used within AppShellActionProvider.')
  }

  useEffect(() => {
    context.setActionContainer(containerRef.current)

    return () => {
      context.setActionContainer(null)
    }
  }, [context])

  return (
    <div
      ref={containerRef}
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
  const containerRef = useRef<HTMLDivElement | null>(null)

  if (!context) {
    throw new Error('AppShellMetaTarget must be used within AppShellActionProvider.')
  }

  useEffect(() => {
    context.setMetaContainer(containerRef.current)

    return () => {
      context.setMetaContainer(null)
    }
  }, [context])

  return (
    <div
      ref={containerRef}
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
