import type { ReactNode } from 'react'

import { CircleHelp } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'

type AppInfoPopoverProps = {
  label: string
  title: string
  children: ReactNode
}

export function AppInfoPopover({
  label,
  title,
  children,
}: AppInfoPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={label}
            className="size-5 rounded-full text-muted-foreground hover:text-foreground"
          />
        }
      >
        <CircleHelp className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" sideOffset={8}>
        <PopoverHeader>
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription>{children}</PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  )
}
