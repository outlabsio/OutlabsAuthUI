import { create } from 'zustand'

export const themeStorageKey = 'outlabs-auth-ui.theme'

export type ThemePreference = 'light' | 'dark'

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark'
}

export function getInitialThemePreference(): ThemePreference {
  if (typeof window === 'undefined') {
    return 'light'
  }

  const storedTheme = window.localStorage.getItem(themeStorageKey)

  if (isThemePreference(storedTheme)) {
    return storedTheme
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

type ThemeStore = {
  theme: ThemePreference
  setTheme: (theme: ThemePreference) => void
}

const initialTheme = getInitialThemePreference()

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: initialTheme,
  setTheme: (theme) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(themeStorageKey, theme)
    }

    set({
      theme,
    })
  },
}))
