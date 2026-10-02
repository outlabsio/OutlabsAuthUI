import type { Ref } from 'vue'
import { useQuery } from '@pinia/colada'
import { userDetailQuery } from '~/queries/users'
import { isUuid } from '~/utils/users'

// Who an id in a history row is (F-172): "You" for the signed-in admin, otherwise the account's
// email from its user record (one cached query per id, shared with that user's detail page), and
// a link to it.
// outlabs-auth answers 404 for an account outside a delegated admin's organization, so the
// record is read only where it can be: by a global admin (useActorReach), or for the account the
// history belongs to (`subjectId`, already loaded by the page). Anyone else stays an unlinked
// "Another account" with its id in the tooltip, without a request that would fail.
export function useUserLabel(userId: Ref<string>, subjectId: Ref<string | undefined>) {
  const { user: actor, canAccess } = useAuth()
  const { isGlobal } = useActorReach()
  const canRead = computed(() => canAccess('users'))
  const isActor = computed(() => Boolean(actor.value?.id) && actor.value?.id === userId.value)
  const readable = computed(() => canRead.value && isUuid(userId.value)
    && (isGlobal.value === true || isActor.value || userId.value === subjectId.value))
  const { data } = useQuery(() => ({ ...userDetailQuery(userId.value), enabled: readable.value }))

  const label = computed(() => {
    if (isActor.value) return 'You'
    if (data.value) return data.value.email
    return 'Another account'
  })
  const to = computed(() => (canRead.value && (isActor.value || data.value) ? `/app/users/${userId.value}` : undefined))
  return { label, to, title: computed(() => `User ID ${userId.value}`) }
}
