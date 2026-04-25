import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { expireAuthSession } from '@/lib/api/auth-session'
import { ApiError, getApiErrorMessage } from '@/lib/api/errors'
import { getMutationToastConfig } from '@/lib/query/mutation-toast'

function showMutationSuccessToast(meta: unknown) {
  const toastConfig = getMutationToastConfig(meta)

  if (!toastConfig?.success) {
    return
  }

  if (toastConfig.successTitle) {
    toast.success(toastConfig.successTitle, {
      description: toastConfig.success,
    })
    return
  }

  toast.success(toastConfig.success)
}

function showMutationErrorToast(error: unknown, meta: unknown) {
  const toastConfig = getMutationToastConfig(meta)

  if (toastConfig?.skipErrorToast) {
    return
  }

  const message = getApiErrorMessage(
    error,
    toastConfig?.error ?? 'Something went wrong.'
  )

  if (toastConfig?.errorTitle) {
    toast.error(toastConfig.errorTitle, {
      description: message,
    })
    return
  }

  toast.error(message)
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        expireAuthSession()
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (error instanceof ApiError && error.status === 401) {
        expireAuthSession()
      }

      showMutationErrorToast(error, mutation.options.meta)
    },
    onSuccess: (_data, _variables, _context, mutation) => {
      showMutationSuccessToast(mutation.options.meta)
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
})
