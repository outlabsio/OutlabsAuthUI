import type {
  Entity,
  EntityClassValue,
} from '@/features/entities/types/entities.types'

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

export function getEntityStatusVariant(status?: Entity['status'] | null) {
  switch (status) {
    case 'active':
      return 'secondary' as const
    case 'archived':
      return 'destructive' as const
    case 'inactive':
    default:
      return 'outline' as const
  }
}

export function getEntityClassLabel(entityClass?: EntityClassValue | null) {
  return formatEntityToken(entityClass, 'Entity')
}
