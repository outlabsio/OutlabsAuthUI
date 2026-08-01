import type { ReactNode } from 'react'

import { AuthCard } from '@/features/auth/components/auth-card'
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
    <AuthCard
      title={title}
      description={
        <>
          <span className="sr-only">{eyebrow}. </span>
          {description}
        </>
      }
    >
      {actions ? <div className="flex flex-col gap-3">{actions}</div> : null}
    </AuthCard>
  )
}
