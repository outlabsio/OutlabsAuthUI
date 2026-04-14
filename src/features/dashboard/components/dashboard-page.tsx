import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Building2,
  Key,
  KeyRound,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react'

import { AppPage } from '@/components/app/app-page'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { getAuthConfigQueryOptions } from '@/features/auth/api/auth.query-options'
import { routes } from '@/lib/constants/routes'
import { getRuntimeConfig } from '@/lib/runtime-config'
import {
  type WorkspaceKey,
  isWorkspaceVisible,
} from '@/lib/workspace-visibility'

const workspaceCards: Array<{
  key: WorkspaceKey
  title: string
  to: string
  icon: React.ComponentType<{ className?: string }>
  accent: string
  visible: boolean
}> = [
  {
    key: 'account',
    title: 'Account',
    to: routes.app.account,
    icon: UserRound,
    accent: 'Self-service',
    visible: true,
  },
  {
    key: 'users',
    title: 'Users',
    to: routes.app.users,
    icon: Users,
    accent: 'Accounts',
    visible: true,
  },
  {
    key: 'apiKeys',
    title: 'API Keys',
    to: routes.app.apiKeys,
    icon: Key,
    accent: 'Personal access',
    visible: true,
  },
  {
    key: 'systemApiKeys',
    title: 'System API Keys',
    to: routes.app.systemApiKeys,
    icon: KeyRound,
    accent: 'Integrations',
    visible: true,
  },
  {
    key: 'permissions',
    title: 'Permissions',
    to: routes.app.permissions,
    icon: KeyRound,
    accent: 'Capability catalog',
    visible: true,
  },
  {
    key: 'roles',
    title: 'Roles',
    to: routes.app.roles,
    icon: ShieldCheck,
    accent: 'Access composition',
    visible: true,
  },
  {
    key: 'entities',
    title: 'Entities',
    to: routes.app.entities,
    icon: Building2,
    accent: 'Hierarchy',
    visible: true,
  },
  {
    key: 'settings',
    title: 'Settings',
    to: routes.app.settings,
    icon: Settings,
    accent: 'Backend config',
    visible: true,
  },
]

const capabilityLabels = [
  ['entity_hierarchy', 'Entity hierarchy'],
  ['context_aware_roles', 'Context-aware roles'],
  ['abac', 'ABAC'],
  ['tree_permissions', 'Tree permissions'],
  ['api_keys', 'API keys'],
  ['user_status', 'User status'],
  ['activity_tracking', 'Activity tracking'],
  ['invitations', 'Invitations'],
] as const

export function DashboardPage() {
  const runtimeConfig = getRuntimeConfig()
  const authConfigQuery = useQuery(getAuthConfigQueryOptions())
  const enabledCapabilities = authConfigQuery.data
    ? capabilityLabels.filter(([key]) => authConfigQuery.data.features[key])
    : []

  return (
    <AppPage title="Dashboard" hideTitle padded>
      <div className="space-y-4">
        <div className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-4">
          {workspaceCards
            .filter(
              (item) =>
                item.visible &&
                isWorkspaceVisible(item.key, authConfigQuery.data?.features)
            )
            .map((item) => {
            const Icon = item.icon

            return (
              <Card
                key={item.title}
                className="overflow-hidden border border-border/70 bg-card/90 transition-colors hover:bg-muted/20"
              >
                <Link
                  to={item.to}
                  aria-label={`Open ${item.title} workspace`}
                  className="flex h-full flex-col justify-between p-6"
                >
                  <CardHeader className="p-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex size-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                        <Icon className="size-5" />
                      </div>
                      <Badge variant="outline">{item.accent}</Badge>
                    </div>
                    <CardTitle className="mt-5 text-xl">{item.title}</CardTitle>
                  </CardHeader>
                  <div className="mt-6 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    Open workspace
                    <ArrowRight className="size-4" />
                  </div>
                </Link>
              </Card>
            )
          })}
        </div>

        <Card className="border border-border/70 bg-card/90">
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <Badge variant="outline">Backend contract</Badge>
                <CardTitle className="text-xl">Auth configuration snapshot</CardTitle>
              </div>
              {authConfigQuery.data ? (
                <Badge>{authConfigQuery.data.preset}</Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {runtimeConfig.appName} reads these flags directly from the configured auth backend
              at <code>/auth/config</code>.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {authConfigQuery.isPending ? (
              <p className="text-sm text-muted-foreground">
                Loading backend capabilities...
              </p>
            ) : null}

            {authConfigQuery.error ? (
              <p className="text-sm text-destructive">
                Unable to load auth configuration from the backend.
              </p>
            ) : null}

            {authConfigQuery.data ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {enabledCapabilities.map(([, label]) => (
                    <Badge key={label} variant="secondary">
                      {label}
                    </Badge>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  {authConfigQuery.data.available_permissions.length} permission definitions are
                  currently advertised by the backend contract.
                </p>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </AppPage>
  )
}
