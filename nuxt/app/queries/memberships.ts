import { defineQueryOptions, useMutation, useQueryCache } from '@pinia/colada'
import { apiClient } from '~/api/client'
import type { AddMemberInput, EntityMember, Membership, UpdateMemberInput } from '~/types/membership'

// Memberships (the user<->entity link). Reads: an entity's active members with user details +
// roles from GET /memberships/entity/{id}/details (membership:read). Writes: add / update access /
// remove a member (membership:create / update / delete), each keyed by entity + user. Every write
// invalidates the memberships root so open members cards refetch (Layer 1 — no manual refetch).

const MEMBERSHIPS_ROOT = 'memberships' as const

export const membershipKeys = {
  root: [MEMBERSHIPS_ROOT] as const,
  entity: (entityId: string) => [MEMBERSHIPS_ROOT, 'entity', entityId] as const
}

export const entityMembersQuery = defineQueryOptions((entityId: string) => ({
  key: membershipKeys.entity(entityId),
  query: ctx => apiClient.get<EntityMember[]>(`/memberships/entity/${entityId}/details`, { signal: ctx?.signal })
}))

// A user's memberships across entities (admin view; requires membership:read).
export const userMembershipsQuery = defineQueryOptions((userId: string) => ({
  key: [MEMBERSHIPS_ROOT, 'user', userId],
  query: ctx => apiClient.get<Membership[]>(`/memberships/user/${userId}`, { signal: ctx?.signal })
}))

export function useAddMember() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (input: AddMemberInput) => apiClient.post<EntityMember>('/memberships/', { body: input }),
    onSettled: () => queryCache.invalidateQueries({ key: membershipKeys.root })
  })
}

export function useUpdateMemberAccess() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ entityId, userId, input }: { entityId: string, userId: string, input: UpdateMemberInput }) =>
      apiClient.patch<EntityMember>(`/memberships/${entityId}/${userId}`, { body: input }),
    onSettled: () => queryCache.invalidateQueries({ key: membershipKeys.root })
  })
}

export function useRemoveMember() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ entityId, userId }: { entityId: string, userId: string }) =>
      apiClient.delete<undefined>(`/memberships/${entityId}/${userId}`),
    onSettled: () => queryCache.invalidateQueries({ key: membershipKeys.root })
  })
}
