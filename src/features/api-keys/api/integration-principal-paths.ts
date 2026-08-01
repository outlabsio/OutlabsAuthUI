export function buildIntegrationPrincipalCollectionPath({
  scopeKind,
  entityId,
}: {
  scopeKind: 'entity' | 'platform_global'
  entityId?: string
}) {
  if (scopeKind === 'entity') {
    if (!entityId) {
      throw new Error('entityId is required for entity-scoped integration principals')
    }

    return `/admin/entities/${entityId}/integration-principals`
  }

  return '/admin/system/integration-principals'
}

export function buildIntegrationPrincipalPath({
  scopeKind,
  entityId,
  principalId,
}: {
  scopeKind: 'entity' | 'platform_global'
  entityId?: string
  principalId: string
}) {
  return `${buildIntegrationPrincipalCollectionPath({ scopeKind, entityId })}/${principalId}`
}

export function buildIntegrationPrincipalKeyCollectionPath({
  scopeKind,
  entityId,
  principalId,
}: {
  scopeKind: 'entity' | 'platform_global'
  entityId?: string
  principalId: string
}) {
  return `${buildIntegrationPrincipalPath({ scopeKind, entityId, principalId })}/api-keys`
}
