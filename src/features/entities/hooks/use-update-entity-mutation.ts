import { useMutation, useQueryClient } from '@tanstack/react-query'

import { entitiesKeys } from '@/features/entities/api/entities.keys'
import { updateEntity } from '@/features/entities/api/update-entity'
import type { UpdateEntityInput } from '@/features/entities/types/entities.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useUpdateEntityMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: entitiesKeys.all,
    mutationFn: (input: UpdateEntityInput) => updateEntity(input),
    meta: withMutationToast({
      error: 'The entity could not be updated.',
      success: 'Entity updated.',
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
