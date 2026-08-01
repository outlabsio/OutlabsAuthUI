import { Outlet, createFileRoute } from '@tanstack/react-router'
import { AuthShell } from '@/app/layouts/auth-shell'

function AuthLayout() {
  return (
    <AuthShell>
      <Outlet />
    </AuthShell>
  )
}

export const Route = createFileRoute('/auth')({
  component: AuthLayout,
})
