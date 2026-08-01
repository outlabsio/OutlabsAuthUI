import type { ReactNode } from 'react'

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AuthBrandLogo } from '@/features/auth/components/auth-brand-logo'
import { cn } from '@/lib/utils/cn'

type AuthCardProps = {
  children: ReactNode
  description?: ReactNode
  footer?: ReactNode
  title?: ReactNode
  className?: string
}

export function AuthCard({
  children,
  description,
  footer,
  title,
  className,
}: AuthCardProps) {
  const hasHeader = title != null || description != null

  return (
    <div
      className={cn(
        'mx-auto flex w-[calc(100vw-2rem)] max-w-sm flex-col items-center gap-6',
        className
      )}
    >
      <AuthBrandLogo />
      <Card className="w-full">
        {hasHeader ? (
          <CardHeader>
            {title != null ? (
              <CardTitle>
                <h1>{title}</h1>
              </CardTitle>
            ) : null}
            {description ? <CardDescription>{description}</CardDescription> : null}
          </CardHeader>
        ) : null}
        <CardContent>{children}</CardContent>
        {footer ? (
          <CardFooter className="justify-center text-center">{footer}</CardFooter>
        ) : null}
      </Card>
    </div>
  )
}
