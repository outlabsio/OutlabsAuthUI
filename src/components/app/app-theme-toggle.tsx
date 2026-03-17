import { Moon, Sun } from 'lucide-react'

import { DropdownMenuCheckboxItem } from '@/components/ui/dropdown-menu'
import { Toggle } from '@/components/ui/toggle'
import { useThemeStore } from '@/lib/store/theme.store'
import { cn } from '@/lib/utils/cn'

type AppThemeToggleProps = {
  className?: string
  variant?: 'button' | 'menu-item'
}

export function AppThemeToggle({
  className,
  variant = 'button',
}: AppThemeToggleProps) {
  const theme = useThemeStore((state) => state.theme)
  const setTheme = useThemeStore((state) => state.setTheme)

  if (variant === 'menu-item') {
    return (
      <DropdownMenuCheckboxItem
        checked={theme === 'dark'}
        className={className}
        onCheckedChange={(checked) => {
          setTheme(checked ? 'dark' : 'light')
        }}
      >
        {theme === 'dark' ? (
          <Moon className="size-4" />
        ) : (
          <Sun className="size-4" />
        )}
        Dark mode
      </DropdownMenuCheckboxItem>
    )
  }

  return (
    <Toggle
      variant="outline"
      size="sm"
      pressed={theme === 'dark'}
      aria-label="Toggle dark mode"
      className={cn('relative', className)}
      onPressedChange={(pressed) => {
        setTheme(pressed ? 'dark' : 'light')
      }}
    >
      <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle dark mode</span>
    </Toggle>
  )
}
