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
    mutationKey: [...entitiesKeys.all, 'move'] as const,
    mutationFn: (input: MoveEntityInput) => moveEntity(input),
    meta: withMutationToast({
      error: 'The entity could not be moved.',
      success: 'Entity moved.',
    }),
    onSuccess: async (entity) => {
      queryClient.setQueryData(entitiesKeys.detail(entity.id), entity)

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: entitiesKeys.all,
        }),
        queryClient.invalidateQueries({
          queryKey: entitiesKeys.detail(entity.id),
        }),
      ])
    },
  })
}
