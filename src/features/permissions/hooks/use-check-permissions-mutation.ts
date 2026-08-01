import { useMutation } from '@tanstack/react-query'

import { checkPermissions } from '@/features/permissions/api/check-permissions'
import { permissionsKeys } from '@/features/permissions/api/permissions.keys'
import type { CheckPermissionsInput } from '@/features/permissions/types/permissions.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useCheckPermissionsMutation() {
  return useMutation({
    mutationKey: permissionsKeys.check(),
    mutationFn: (input: CheckPermissionsInput) => checkPermissions(input),
    meta: withMutationToast({
      error: 'The permission check could not be completed.',
      skipErrorToast: true,
    }),
  })
}
