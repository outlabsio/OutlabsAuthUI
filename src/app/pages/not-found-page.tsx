import { Link } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { routes } from '@/lib/constants/routes'

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md rounded-3xl border bg-card/90 p-8 text-center shadow-sm backdrop-blur">
        <p className="text-xs font-semibold tracking-[0.24em] text-muted-foreground uppercase">
          Not Found
        </p>
        <h1 className="mt-4 text-3xl font-semibold">That route does not exist.</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The page may have moved, or the URL may be wrong.
        </p>
        <Button className="mt-6" render={<Link to={routes.auth.login} />}>
          Back to sign in
        </Button>
      </div>
    </div>
  )
}
