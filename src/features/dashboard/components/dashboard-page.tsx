import { Activity, KeyRound, Mail, ShieldCheck } from 'lucide-react'

import { AppPage } from '@/components/app/app-page'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const capabilityCards = [
  {
    title: 'Password flows',
    description: 'Login, password reset, and invite acceptance are the first auth surfaces to wire.',
    icon: KeyRound,
  },
  {
    title: 'Library agnostic UI',
    description: 'The shell stays frontend-only and talks to OutlabsAuth through the public API contract.',
    icon: ShieldCheck,
  },
  {
    title: 'Delivery path',
    description: 'Next slices can expand from auth into users, roles, providers, and policy management.',
    icon: Mail,
  },
]

const roadmap = [
  'Adapt the shadcn auth blocks to the OutlabsAuth password endpoints.',
  'Add a shared auth client layer for login, refresh, logout, forgot-password, reset-password, and invite acceptance.',
  'Replace preview user data with the authenticated session once auth is wired.',
]

export function DashboardPage() {
  return (
    <AppPage
      eyebrow="Workspace"
      title="Auth console shell"
      description="This is the mixed inset and icon-collapse shell that will host the OutlabsAuth management UI."
    >
      <div className="grid auto-rows-fr gap-4 md:grid-cols-3">
        {capabilityCards.map((item) => {
          const Icon = item.icon

          return (
            <Card key={item.title} className="overflow-hidden border border-border/70 bg-card/90">
              <CardHeader>
                <div className="flex size-10 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                  <Icon className="size-5" />
                </div>
                <CardTitle className="mt-3">{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
            </Card>
          )
        })}
      </div>
      <Card className="border border-border/70 bg-card/90">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Activity className="size-5" />
            </div>
            <div>
              <CardTitle>Next implementation slice</CardTitle>
              <CardDescription>
                The shell is in place. The next step is wiring the auth feature into the real backend contract.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm text-muted-foreground">
            {roadmap.map((item, index) => (
              <li
                key={item}
                className="flex gap-3 rounded-2xl border border-border/60 bg-background/70 px-4 py-3"
              >
                <span className="font-semibold text-foreground">{index + 1}.</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </AppPage>
  )
}
