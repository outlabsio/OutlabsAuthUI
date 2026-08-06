import { defineQueryOptions, useMutation, useQueryCache } from '@pinia/colada'
import { apiClient } from '~/utils/api'
import type {
  AbacCondition,
  AbacConditionGroup,
  AbacScopeKind,
  CreateConditionGroupInput,
  CreateConditionInput
} from '~/types/abac'

// ABAC condition groups + conditions for a role or permission. Both owners share the same
// sub-resource shape, so everything is parameterized by {kind, id}. Mutations invalidate the
// owner's ABAC root so groups + conditions both refetch.
const ABAC_ROOT = 'abac' as const
const base = (kind: AbacScopeKind, id: string) => `/${kind}/${id}`

export const conditionGroupsQuery = defineQueryOptions(({ kind, id }: { kind: AbacScopeKind, id: string }) => ({
  key: [ABAC_ROOT, kind, id, 'groups'],
  query: ctx => apiClient.get<AbacConditionGroup[]>(`${base(kind, id)}/condition-groups`, { signal: ctx?.signal })
}))

export const conditionsQuery = defineQueryOptions(({ kind, id }: { kind: AbacScopeKind, id: string }) => ({
  key: [ABAC_ROOT, kind, id, 'conditions'],
  query: ctx => apiClient.get<AbacCondition[]>(`${base(kind, id)}/conditions`, { signal: ctx?.signal })
}))

export function useCreateConditionGroup() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ kind, id, input }: { kind: AbacScopeKind, id: string, input: CreateConditionGroupInput }) =>
      apiClient.post<AbacConditionGroup>(`${base(kind, id)}/condition-groups`, { body: input }),
    onSettled: () => queryCache.invalidateQueries({ key: [ABAC_ROOT] })
  })
}

export function useDeleteConditionGroup() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ kind, id, groupId }: { kind: AbacScopeKind, id: string, groupId: string }) =>
      apiClient.delete<undefined>(`${base(kind, id)}/condition-groups/${groupId}`),
    onSettled: () => queryCache.invalidateQueries({ key: [ABAC_ROOT] })
  })
}

export function useCreateCondition() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ kind, id, input }: { kind: AbacScopeKind, id: string, input: CreateConditionInput }) =>
      apiClient.post<AbacCondition>(`${base(kind, id)}/conditions`, { body: input }),
    onSettled: () => queryCache.invalidateQueries({ key: [ABAC_ROOT] })
  })
}

export function useDeleteCondition() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ kind, id, conditionId }: { kind: AbacScopeKind, id: string, conditionId: string }) =>
      apiClient.delete<undefined>(`${base(kind, id)}/conditions/${conditionId}`),
    onSettled: () => queryCache.invalidateQueries({ key: [ABAC_ROOT] })
  })
}
