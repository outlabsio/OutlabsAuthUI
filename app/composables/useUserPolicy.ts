import type { Ref } from 'vue'
import type { User } from '~/types/user'
import { userRowPolicy } from '~/utils/users'

// What the signed-in admin may do to one account, for the user detail's header and cards. The
// same rules as the users list's row menu (userRowPolicy in utils/users.ts): a superuser account
// is changed only by a global admin, a deleted one can only be restored, and the admin's own
// account is managed from Account, so no status change, password reset or session revoke on
// oneself. Null while the account is not loaded: nothing is offered then (F-209).
export function useUserPolicy(user: Ref<User | null | undefined>) {
  const { hasPermission, user: actor } = useAuth()
  const { isGlobal } = useActorReach()

  const policy = computed(() => (user.value
    ? userRowPolicy({
        actorId: actor.value?.id,
        actorIsGlobal: isGlobal.value,
        canUpdate: hasPermission('user:update'),
        canDelete: hasPermission('user:delete'),
        target: user.value
      })
    : null))
  const isSelf = computed(() => Boolean(policy.value?.isSelf))
  const canEdit = computed(() => Boolean(policy.value?.canEdit))
  // Lifecycle writes on another account (status, password reset, sessions, superuser): the
  // admin's own account goes through Account instead.
  const canManage = computed(() => canEdit.value && !isSelf.value)

  return { policy, isSelf, canEdit, canManage }
}
