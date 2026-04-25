import type { ReactNode } from 'react'

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type AuthCardProps = {
  children: ReactNode
  description?: ReactNode
  footer?: ReactNode
  title: ReactNode
}

export function AuthCard({ children, description, footer, title }: AuthCardProps) {
  return (
    <Card className="mx-auto w-[calc(100vw-2rem)] max-w-sm">
      <CardHeader>
        <CardTitle>
          <h1>{title}</h1>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
      {footer ? <CardFooter>{footer}</CardFooter> : null}
    </Card>
  )
}
