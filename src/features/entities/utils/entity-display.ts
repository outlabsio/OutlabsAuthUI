import type {
  Entity,
  EntityClassValue,
} from '@/features/entities/types/entities.types'
import type { AppStatusTone } from '@/components/app/app-status'

const entityTokenLabels: Record<string, string> = {
  agent_practice: 'Agent',
}

export function formatEntityToken(value?: string | null, fallback = 'Unknown') {
  if (!value) {
    return fallback
  }

  const alias = entityTokenLabels[value.toLowerCase()]
  if (alias) {
    return alias
  }

  return value
    .split(/[_:-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function getEntityStatusTone(status?: Entity['status'] | null): AppStatusTone {
  switch (status) {
    case 'active':
      return 'success'
    case 'inactive':
      return 'warning'
    case 'archived':
      return 'error'
    default:
      return 'neutral'
  }
}

export function getEntityClassLabel(entityClass?: EntityClassValue | null) {
  return formatEntityToken(entityClass, 'Entity')
}
