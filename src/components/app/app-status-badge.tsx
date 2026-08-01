import type { ComponentProps } from "react"

import { Badge } from "@/components/ui/badge"
import {
  type AppStatusAppearance,
  type AppStatusColor,
  type AppStatusTone,
  getAppStatusClasses,
} from "@/components/app/app-status"
import { cn } from "@/lib/utils/cn"

type AppStatusBadgeProps = Omit<
  ComponentProps<typeof Badge>,
  "variant"
> & {
  color?: AppStatusColor
  tone?: AppStatusTone
  appearance?: AppStatusAppearance
}

export function AppStatusBadge({
  className,
  color,
  tone,
  appearance = "soft",
  ...props
}: AppStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "shadow-none [&>svg]:opacity-80",
        getAppStatusClasses(color ?? tone ?? "neutral", appearance),
        className
      )}
      {...props}
    />
  )
}
