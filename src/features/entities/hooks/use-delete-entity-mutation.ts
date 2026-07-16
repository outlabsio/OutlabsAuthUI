import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  deleteEntity,
  type DeleteEntityInput,
} from '@/features/entities/api/delete-entity'
import { entitiesKeys } from '@/features/entities/api/entities.keys'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useDeleteEntityMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...entitiesKeys.all, 'delete'] as const,
    mutationFn: (input: DeleteEntityInput) => deleteEntity(input),
    meta: withMutationToast({
      error: 'The entity could not be archived.',
      success: 'Entity archived.',
    }),
    onSuccess: async (_result, input) => {
      queryClient.removeQueries({
        queryKey: entitiesKeys.detail(input.entityId),
      })

      await queryClient.invalidateQueries({
        queryKey: entitiesKeys.all,
      })
    },
  })
}
