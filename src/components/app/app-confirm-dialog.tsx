import type { ReactNode } from 'react'

import { AppErrorState } from '@/components/app/app-error-state'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils/cn'

type AppConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  children?: ReactNode
  errorMessage?: string | null
  confirmLabel: string
  confirmLabelPending?: string
  confirmVariant?: 'default' | 'destructive'
  confirmDisabled?: boolean
  isPending?: boolean
  cancelLabel?: string
  onConfirm: () => Promise<unknown> | unknown
  className?: string
}

export function AppConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  errorMessage,
  confirmLabel,
  confirmLabelPending,
  confirmVariant = 'destructive',
  confirmDisabled = false,
  isPending = false,
  cancelLabel = 'Cancel',
  onConfirm,
  className,
}: AppConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('sm:max-w-lg', className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        {children}

        {errorMessage ? (
          <AppErrorState compact>{errorMessage}</AppErrorState>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            disabled={isPending || confirmDisabled}
            onClick={() => {
              void Promise.resolve(onConfirm()).catch(() => undefined)
            }}
          >
            {isPending ? confirmLabelPending ?? confirmLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
