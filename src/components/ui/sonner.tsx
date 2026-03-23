import type { CSSProperties } from 'react'

import { Toaster as Sonner, type ToasterProps } from 'sonner'

import { useThemeStore } from '@/lib/store/theme.store'

const semanticToastStyles = {
  '--success-bg': 'var(--success-soft)',
  '--success-border': 'var(--success-border)',
  '--success-text': 'var(--success-soft-foreground)',
  '--info-bg': 'var(--info-soft)',
  '--info-border': 'var(--info-border)',
  '--info-text': 'var(--info-soft-foreground)',
  '--warning-bg': 'var(--warning-soft)',
  '--warning-border': 'var(--warning-border)',
  '--warning-text': 'var(--warning-soft-foreground)',
  '--error-bg': 'var(--error-soft)',
  '--error-border': 'var(--error-border)',
  '--error-text': 'var(--error-soft-foreground)',
} as CSSProperties

export function Toaster(props: ToasterProps) {
  const theme = useThemeStore((state) => state.theme)

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      closeButton
      richColors
      style={semanticToastStyles}
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:border-border group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  )
}
