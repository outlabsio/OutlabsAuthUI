import { useMutation, useQueryClient } from '@tanstack/react-query'

import { settingsKeys } from '@/features/settings/api/settings.keys'
import { updateEntityTypeConfig } from '@/features/settings/api/update-entity-type-config'
import type { UpdateEntityTypeConfigInput } from '@/features/settings/types/settings.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useUpdateEntityTypeConfigMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: settingsKeys.all,
    mutationFn: (input: UpdateEntityTypeConfigInput) => updateEntityTypeConfig(input),
    meta: withMutationToast({
      error: 'Entity type configuration could not be updated.',
      success: 'Entity type configuration updated.',
    }),
    onSuccess: (config) => {
      queryClient.setQueryData(settingsKeys.entityTypeConfig(), config)
    },
  })
}
