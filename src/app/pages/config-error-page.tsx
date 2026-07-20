import type { RuntimeConfigError } from '@/lib/runtime-config'

type ConfigErrorPageProps = {
  error: RuntimeConfigError
}

export function ConfigErrorPage({ error }: ConfigErrorPageProps) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-lg rounded-3xl border bg-card/90 p-8 text-center shadow-sm backdrop-blur">
        <p className="text-xs font-semibold tracking-[0.24em] text-destructive uppercase">
          Configuration error
        </p>
        <h1 className="mt-4 text-3xl font-semibold">This deployment is not configured.</h1>
        <p className="mt-3 text-sm text-muted-foreground">{error.message}</p>
        {error.issues.length > 0 ? (
          <ul className="mt-4 space-y-1 text-left text-sm text-muted-foreground">
            {error.issues.map((issue) => (
              <li key={issue} className="rounded-lg bg-muted px-3 py-2 font-mono text-xs">
                {issue}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-6 text-xs text-muted-foreground">
          Fix the deployment&apos;s <code>app-config.json</code>, inline config, or build-time
          env vars, then reload this page.
        </p>
      </div>
    </div>
  )
}
