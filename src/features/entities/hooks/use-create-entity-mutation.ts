import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createEntity } from '@/features/entities/api/create-entity'
import { entitiesKeys } from '@/features/entities/api/entities.keys'
import type { CreateEntityInput } from '@/features/entities/types/entities.types'

export function useCreateEntityMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: entitiesKeys.all,
    mutationFn: (input: CreateEntityInput) => createEntity(input),
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
