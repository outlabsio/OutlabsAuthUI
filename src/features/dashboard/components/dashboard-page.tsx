import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Building2,
  KeyRound,
  ShieldCheck,
  Users,
} from 'lucide-react'

import { AppPage } from '@/components/app/app-page'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { routes } from '@/lib/constants/routes'

const workspaceCards = [
  {
    title: 'Users',
    to: routes.app.users,
    icon: Users,
    accent: 'Accounts',
  },
  {
    title: 'Permissions',
    to: routes.app.permissions,
    icon: KeyRound,
    accent: 'Capability catalog',
  },
  {
    title: 'Roles',
    to: routes.app.roles,
    icon: ShieldCheck,
    accent: 'Access composition',
  },
  {
    title: 'Entities',
    to: routes.app.entities,
    icon: Building2,
    accent: 'Hierarchy',
  },
]

export function DashboardPage() {
  return (
    <AppPage eyebrow="Workspace" title="Dashboard">
      <div className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-4">
        {workspaceCards.map((item) => {
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
    </AppPage>
  )
}
