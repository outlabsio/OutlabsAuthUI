import type { ReactNode } from 'react'
import { useEffect } from 'react'

import { useThemeStore } from '@/lib/store/theme.store'

type ThemeProviderProps = {
  children: ReactNode
}

function applyTheme(resolvedTheme: 'light' | 'dark') {
  const root = window.document.documentElement

  root.classList.toggle('dark', resolvedTheme === 'dark')
  root.dataset.theme = resolvedTheme
  root.style.colorScheme = resolvedTheme
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const theme = useThemeStore((state) => state.theme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  return children
}
