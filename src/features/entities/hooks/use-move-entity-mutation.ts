import { useMutation, useQueryClient } from '@tanstack/react-query'

import { entitiesKeys } from '@/features/entities/api/entities.keys'
import {
  moveEntity,
  type MoveEntityInput,
} from '@/features/entities/api/move-entity'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useMoveEntityMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: entitiesKeys.move(),
    mutationFn: (input: MoveEntityInput) => moveEntity(input),
    meta: withMutationToast({
      error: 'The entity could not be moved.',
      success: 'Entity moved.',
    }),
    onSuccess: async (entity) => {
      queryClient.setQueryData(entitiesKeys.detail(entity.id), entity)

      // Moving reshapes the hierarchy (descendants, path, lists all shift),
      // so a full invalidation is appropriate here rather than surgical keys.
      await queryClient.invalidateQueries({
        queryKey: entitiesKeys.all,
      })
    },
  })
}
