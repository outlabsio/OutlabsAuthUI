import type { ReactNode } from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { getRuntimeConfig } from '@/lib/runtime-config'

type AuthStatusCardProps = {
  actions?: ReactNode
  description: string
  eyebrow?: string
  title: string
}

export function AuthStatusCard({
  actions,
  description,
  eyebrow = getRuntimeConfig().authBrand,
  title,
}: AuthStatusCardProps) {
  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-6 p-6 sm:p-8">
          <div className="space-y-3 text-center">
            <p className="text-xs font-semibold tracking-[0.24em] text-muted-foreground uppercase">
              {eyebrow}
            </p>
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          {actions ? <div className="flex flex-col gap-3">{actions}</div> : null}
        </CardContent>
      </Card>
    </div>
  )
}
