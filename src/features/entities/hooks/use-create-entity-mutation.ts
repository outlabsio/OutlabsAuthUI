import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createEntity } from '@/features/entities/api/create-entity'
import { entitiesKeys } from '@/features/entities/api/entities.keys'
import type { CreateEntityInput } from '@/features/entities/types/entities.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useCreateEntityMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: entitiesKeys.create(),
    mutationFn: (input: CreateEntityInput) => createEntity(input),
    meta: withMutationToast({
      error: 'The entity could not be created.',
      success: 'Entity created.',
    }),
    onSuccess: async (entity) => {
      queryClient.setQueryData(entitiesKeys.detail(entity.id), entity)
      // Hierarchy create reshapes lists, parent descendants, and type suggestions.
      await queryClient.invalidateQueries({
        queryKey: entitiesKeys.all,
      })
    },
  })
}
