import { Building2, Shield } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { EntityClassValue } from '@/features/entities/types/entities.types'

export type EntityClassCardOption = {
  label: string
  value: EntityClassValue
  description?: string
  icon: LucideIcon
}

export const entityClassCardOptions = [
  {
    label: 'Structural',
    value: 'structural',
    description: 'Hierarchy nodes like organizations, regions, offices, and teams.',
    icon: Building2,
  },
  {
    label: 'Access group',
    value: 'access_group',
    description: 'Membership scopes like permission groups and delegated admin groups.',
    icon: Shield,
  },
] satisfies EntityClassCardOption[]

export const entityClassCompactCardOptions = entityClassCardOptions.map((option) => ({
  label: option.label,
  value: option.value,
  icon: option.icon,
}))
