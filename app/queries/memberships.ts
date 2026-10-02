import { defineQueryOptions, useMutation } from '@pinia/colada'
import { apiClient } from '~/api/client'
import { useInvalidateAfter } from '~/queries/invalidation'
import type { AddMemberInput, EntityMember, Membership, UpdateMemberInput } from '~/types/membership'

// Memberships (the user<->entity link). Reads: an entity's active members with user details +
// roles from GET /memberships/entity/{id}/details (membership:read). Writes: add / update access /
// remove a member (membership:create / update / delete), each keyed by entity + user. Every write
// invalidates the memberships root and the views it shows up in (the user's membership history,
// entity member counts, audit, and the actor's own permissions when they are the target).

const MEMBERSHIPS_ROOT = 'memberships' as const

export const membershipKeys = {
  root: [MEMBERSHIPS_ROOT] as const,
  entity: (entityId: string) => [MEMBERSHIPS_ROOT, 'entity', entityId] as const
}

// One page of an entity's members (the endpoint caps a page at 100 and answers a bare list with
// no total: see entityActiveMemberCountQuery). Active memberships only unless includeInactive.
export const entityMembersQuery = defineQueryOptions((params: { entityId: string, includeInactive?: boolean, page?: number, limit?: number }) => {
  const page = params.page ?? 1
  const limit = params.limit ?? 50
  const query = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (params.includeInactive) query.set('include_inactive', 'true')
  return {
    key: [...membershipKeys.entity(params.entityId), { includeInactive: !!params.includeInactive, page, limit }],
    query: (ctx: { signal?: AbortSignal }) => apiClient.get<EntityMember[]>(
      `/memberships/entity/${params.entityId}/details?${query.toString()}`,
      { signal: ctx?.signal }
    )
  }
})

// How many ACTIVE members an entity has (GET /entities/{id}/members?limit=1 carries the total the
// details endpoint lacks). Used for the member count, pagination and the max_members capacity.
export const entityActiveMemberCountQuery = defineQueryOptions((entityId: string) => ({
  key: [...membershipKeys.entity(entityId), 'active-count'],
  query: async (ctx: { signal?: AbortSignal }) => {
    const page = await apiClient.get<{ total: number }>(`/entities/${entityId}/members?page=1&limit=1`, { signal: ctx?.signal })
    return page.total
  }
}))

const USER_MEMBERSHIPS_PAGE = 100
const USER_MEMBERSHIPS_MAX_PAGES = 50

// Every membership a user holds, in any status (the add-member dialog checks the chosen user
// against it: adding someone who already has a membership here would overwrite it). The
// endpoint answers at most 100 per page with no total, so this reads pages until a short one
// (bounded), and the "already a member here" check never misses a membership.
export const userAllMembershipsQuery = defineQueryOptions((userId: string) => ({
  key: [MEMBERSHIPS_ROOT, 'user', userId, { includeInactive: true }],
  query: async (ctx: { signal?: AbortSignal }) => {
    const all: Membership[] = []
    for (let page = 1; page <= USER_MEMBERSHIPS_MAX_PAGES; page++) {
      const batch = await apiClient.get<Membership[]>(
        `/memberships/user/${userId}?include_inactive=true&page=${page}&limit=${USER_MEMBERSHIPS_PAGE}`,
        { signal: ctx?.signal }
      )
      all.push(...batch)
      if (batch.length < USER_MEMBERSHIPS_PAGE) break
    }
    return all
  }
}))

// A user's memberships across entities (admin view; requires membership:read).
export const userMembershipsQuery = defineQueryOptions((userId: string) => ({
  key: [MEMBERSHIPS_ROOT, 'user', userId],
  query: ctx => apiClient.get<Membership[]>(`/memberships/user/${userId}`, { signal: ctx?.signal })
}))

export function useAddMember() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    // The write answers with the membership record (MembershipResponse), not a member row.
    mutation: (input: AddMemberInput) => apiClient.post<Membership>('/memberships/', { body: input }),
    onSettled: (_data, _error, input) => invalidate('membership', { targetUserId: input.user_id })
  })
}

export function useUpdateMemberAccess() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: ({ entityId, userId, input }: { entityId: string, userId: string, input: UpdateMemberInput }) =>
      apiClient.patch<Membership>(`/memberships/${entityId}/${userId}`, { body: input }),
    onSettled: (_data, _error, { userId }) => invalidate('membership', { targetUserId: userId })
  })
}

export function useRemoveMember() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: ({ entityId, userId }: { entityId: string, userId: string }) =>
      apiClient.delete<undefined>(`/memberships/${entityId}/${userId}`),
    onSettled: (_data, _error, { userId }) => invalidate('membership', { targetUserId: userId })
  })
}
