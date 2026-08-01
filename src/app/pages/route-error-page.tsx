import { useEffect } from 'react'

import type { ErrorComponentProps } from '@tanstack/react-router'

import { AppErrorState } from '@/components/app/app-error-state'
import { Button } from '@/components/ui/button'
import {
  hasAttemptedChunkReload,
  isChunkLoadError,
  reloadOnceForChunkError,
} from '@/lib/utils/chunk-load-recovery'

export function RouteErrorPage({ error, reset }: ErrorComponentProps) {
  const chunkError = isChunkLoadError(error)
  const alreadyReloaded = hasAttemptedChunkReload()

  useEffect(() => {
    if (chunkError && !alreadyReloaded) {
      reloadOnceForChunkError()
    }
  }, [chunkError, alreadyReloaded])

  function getMessage() {
    if (chunkError && !alreadyReloaded) {
      return 'A new version of this app is available. Reloading automatically...'
    }

    if (chunkError && alreadyReloaded) {
      return 'This page failed to load even after a refresh. Please retry, or reload the page manually.'
    }

    return 'An unexpected error occurred while loading this page. You can retry, or reload the page.'
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md w-full">
        <AppErrorState
          title="Something went wrong"
          action={
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={reset}>
                Retry
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
              >
                Reload page
              </Button>
            </div>
          }
        >
          {getMessage()}
        </AppErrorState>
      </div>
    </div>
  )
}
