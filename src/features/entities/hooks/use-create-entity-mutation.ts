import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createEntity } from '@/features/entities/api/create-entity'
import { entitiesKeys } from '@/features/entities/api/entities.keys'
import type { CreateEntityInput } from '@/features/entities/types/entities.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useCreateEntityMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: entitiesKeys.all,
    mutationFn: (input: CreateEntityInput) => createEntity(input),
    meta: withMutationToast({
      error: 'The entity could not be created.',
      success: 'Entity created.',
    }),
    onSuccess: async (entity) => {
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
