import { useCreateMembershipMutation } from '@/features/memberships/hooks/use-create-membership-mutation'
import { useRemoveMembershipMutation } from '@/features/memberships/hooks/use-remove-membership-mutation'
import { useUpdateMembershipMutation } from '@/features/memberships/hooks/use-update-membership-mutation'
import { toIsoValue } from '@/features/memberships/utils/membership-datetime'
import { getApiErrorMessage } from '@/lib/api/errors'

export type MembershipAccessValues = {
  userId: string
  entityId: string
  roleIds: string[]
  status: 'active' | 'suspended'
  validFrom?: string | null
  validUntil?: string | null
  reason?: string | null
}

export function useMembershipAccessActions() {
  const createMembershipMutation = useCreateMembershipMutation()
  const updateMembershipMutation = useUpdateMembershipMutation()
  const removeMembershipMutation = useRemoveMembershipMutation()

  const isPending =
    createMembershipMutation.isPending ||
    updateMembershipMutation.isPending ||
    removeMembershipMutation.isPending

  const submitError =
    createMembershipMutation.error ??
    updateMembershipMutation.error ??
    removeMembershipMutation.error

  function getSubmitErrorMessage(isUpdate: boolean, createFallback: string) {
    if (!submitError) {
      return null
    }

    return getApiErrorMessage(
      submitError,
      isUpdate ? 'The entity access could not be updated.' : createFallback
    )
  }

  function reset() {
    createMembershipMutation.reset()
    updateMembershipMutation.reset()
    removeMembershipMutation.reset()
  }

  async function saveMembership(
    values: MembershipAccessValues,
    options: { isUpdate: boolean }
  ) {
    const payload = {
      userId: values.userId,
      entityId: values.entityId,
      roleIds: values.roleIds,
      status: values.status,
      validFrom: toIsoValue(values.validFrom),
      validUntil: toIsoValue(values.validUntil),
      reason: values.reason?.trim() || null,
    }

    if (options.isUpdate) {
      await updateMembershipMutation.mutateAsync(payload)
      return
    }

    await createMembershipMutation.mutateAsync(payload)
  }

  async function removeMembership(input: { userId: string; entityId: string }) {
    await removeMembershipMutation.mutateAsync(input)
  }

  return {
    isPending,
    isRemoving: removeMembershipMutation.isPending,
    submitError,
    getSubmitErrorMessage,
    reset,
    saveMembership,
    removeMembership,
  }
}
