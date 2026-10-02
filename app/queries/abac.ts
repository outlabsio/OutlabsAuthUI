import type { MaybeRefOrGetter } from 'vue'
import { defineQueryOptions, useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { apiClient } from '~/api/client'
import { QUERY_ROOTS, useInvalidateAfter } from '~/queries/invalidation'
import type {
  AbacCondition,
  AbacConditionGroup,
  AbacScopeKind,
  CreateConditionGroupInput,
  CreateConditionInput,
  UpdateConditionGroupInput,
  UpdateConditionInput
} from '~/types/abac'

// ABAC condition groups + conditions for a role or permission. Both owners share the same
// sub-resource shape, so everything is parameterized by {kind, id}. Mutations go through the
// invalidation map (INVALIDATE_AFTER.abac): the ABAC root, so the owner's groups and conditions
// both refetch (deleting a group cascades to its conditions server-side), and the audit trail.
// Only the open editor's lists are active, so the root costs no more than the owner's scope.
// The invalidation is never awaited: a failed refetch shows in the lists, never as a failed write.
export type AbacScope = { kind: AbacScopeKind, id: string }

export const abacKeys = {
  root: QUERY_ROOTS.abac,
  scope: ({ kind, id }: AbacScope) => [...abacKeys.root, kind, id] as const,
  groups: (scope: AbacScope) => [...abacKeys.scope(scope), 'groups'] as const,
  conditions: (scope: AbacScope) => [...abacKeys.scope(scope), 'conditions'] as const,
  // Whether one role carries conditions. Under the role's scope, so a condition write on that
  // role refreshes it.
  roleHasConditions: (roleId: string) => [...abacKeys.scope({ kind: 'roles', id: roleId }), 'has-conditions'] as const,
  // Which roles in a set carry conditions (the access editors' "conditional" flags).
  roleFlags: (roleIds: readonly string[]) => [...abacKeys.root, 'role-flags', [...roleIds].sort().join(',')] as const
}

const base = ({ kind, id }: AbacScope) => `/${kind}/${id}`

export const conditionGroupsQuery = defineQueryOptions((scope: AbacScope) => ({
  key: abacKeys.groups(scope),
  query: ctx => apiClient.get<AbacConditionGroup[]>(`${base(scope)}/condition-groups`, { signal: ctx?.signal })
}))

export const conditionsQuery = defineQueryOptions((scope: AbacScope) => ({
  key: abacKeys.conditions(scope),
  query: ctx => apiClient.get<AbacCondition[]>(`${base(scope)}/conditions`, { signal: ctx?.signal })
}))

// Whether one role has at least one ABAC condition (GET /roles/{id}/conditions; role:read).
export const roleHasConditionsQuery = defineQueryOptions((roleId: string) => ({
  key: abacKeys.roleHasConditions(roleId),
  query: async ctx => (await apiClient.get<AbacCondition[]>(`/roles/${roleId}/conditions`, { signal: ctx?.signal })).length > 0,
  staleTime: 1000 * 60
}))

// The subset of `roleIds` with at least one ABAC condition. Each role is looked up through its
// own cache entry (roleHasConditionsQuery), so changing the selection fetches only the roles not
// seen within the stale time, not the whole set again. A role whose conditions cannot be read is
// simply not flagged. The previous answer stays in place while a new set resolves.
export function useRoleConditionFlags(roleIds: MaybeRefOrGetter<readonly string[]>, enabled: MaybeRefOrGetter<boolean>) {
  const queryCache = useQueryCache()
  return useQuery(() => {
    const ids = [...new Set(toValue(roleIds))].sort()
    return {
      key: abacKeys.roleFlags(ids),
      query: async () => {
        const results = await Promise.allSettled(ids.map(id => queryCache.refresh(queryCache.ensure(roleHasConditionsQuery(id)))))
        return ids.filter((_id, index) => {
          const result = results[index]
          return result?.status === 'fulfilled' && result.value.data === true
        })
      },
      enabled: toValue(enabled) && ids.length > 0,
      placeholderData: (previous: string[] | undefined) => previous
    }
  })
}

export function useCreateConditionGroup() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: ({ input, ...scope }: AbacScope & { input: CreateConditionGroupInput }) =>
      apiClient.post<AbacConditionGroup>(`${base(scope)}/condition-groups`, { body: input }),
    onSettled: () => invalidate('abac')
  })
}

export function useUpdateConditionGroup() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: ({ groupId, input, ...scope }: AbacScope & { groupId: string, input: UpdateConditionGroupInput }) =>
      apiClient.patch<AbacConditionGroup>(`${base(scope)}/condition-groups/${groupId}`, { body: input }),
    onSettled: () => invalidate('abac')
  })
}

export function useDeleteConditionGroup() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: ({ groupId, ...scope }: AbacScope & { groupId: string }) =>
      apiClient.delete<undefined>(`${base(scope)}/condition-groups/${groupId}`),
    onSettled: () => invalidate('abac')
  })
}

export function useCreateCondition() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: ({ input, ...scope }: AbacScope & { input: CreateConditionInput }) =>
      apiClient.post<AbacCondition>(`${base(scope)}/conditions`, { body: input }),
    onSettled: () => invalidate('abac')
  })
}

export function useUpdateCondition() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: ({ conditionId, input, ...scope }: AbacScope & { conditionId: string, input: UpdateConditionInput }) =>
      apiClient.patch<AbacCondition>(`${base(scope)}/conditions/${conditionId}`, { body: input }),
    onSettled: () => invalidate('abac')
  })
}

export function useDeleteCondition() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: ({ conditionId, ...scope }: AbacScope & { conditionId: string }) =>
      apiClient.delete<undefined>(`${base(scope)}/conditions/${conditionId}`),
    onSettled: () => invalidate('abac')
  })
}
