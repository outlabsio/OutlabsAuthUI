type AppLoadingStateProps = {
  title?: string
  description?: string
}

export function AppLoadingState({
  title = 'Loading',
  description = 'Checking the latest state from OutlabsAuth.',
}: AppLoadingStateProps) {
  return (
    <div className="flex min-h-[40svh] flex-col items-center justify-center gap-4 text-center">
      <div className="size-10 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
