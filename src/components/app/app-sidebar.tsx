import { Link, useRouterState } from '@tanstack/react-router'
import {
  Blocks,
  Building2,
  ChevronsUpDown,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Mail,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Users,
} from 'lucide-react'

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { routes } from '@/lib/constants/routes'

type AppSidebarProps = {
  user: {
    name: string
    email: string
    avatarUrl?: string
  }
  isLoggingOut?: boolean
  onLogout: () => void
}

type NavigationItem = {
  title: string
  to?:
    | typeof routes.app.dashboard
    | typeof routes.app.users
    | typeof routes.app.entities
  icon: React.ComponentType<{ className?: string }>
  comingSoon?: boolean
}

const navigationGroups: Array<{
  label: string
  items: NavigationItem[]
}> = [
  {
    label: 'Workspace',
    items: [
      {
        title: 'Dashboard',
        to: routes.app.dashboard,
        icon: LayoutDashboard,
      },
      {
        title: 'Providers',
        icon: Blocks,
        comingSoon: true,
      },
      {
        title: 'Policies',
        icon: ShieldCheck,
        comingSoon: true,
      },
    ],
  },
  {
    label: 'Auth',
    items: [
      {
        title: 'Users',
        to: routes.app.users,
        icon: Users,
      },
      {
        title: 'Entities',
        to: routes.app.entities,
        icon: Building2,
      },
      {
        title: 'Invites',
        icon: Mail,
        comingSoon: true,
      },
      {
        title: 'Sessions',
        icon: KeyRound,
        comingSoon: true,
      },
      {
        title: 'Branding',
        icon: SlidersHorizontal,
        comingSoon: true,
      },
    ],
  },
]

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function SidebarUserMenu({
  user,
  isLoggingOut = false,
  onLogout,
}: AppSidebarProps) {
  const { isMobile } = useSidebar()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground"
              />
            }
          >
            <Avatar>
              {user.avatarUrl ? (
                <AvatarImage src={user.avatarUrl} alt={user.name} />
              ) : null}
              <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-sidebar-foreground/70">
                {user.email}
              </span>
            </div>
            <ChevronsUpDown className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={6}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar>
                    {user.avatarUrl ? (
                      <AvatarImage src={user.avatarUrl} alt={user.name} />
                    ) : null}
                    <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <UserRound />
                Account
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onLogout}
              disabled={isLoggingOut}
              variant="destructive"
            >
              <LogOut />
              {isLoggingOut ? 'Signing out...' : 'Sign out'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

export function AppSidebar({
  user,
  isLoggingOut = false,
  onLogout,
}: AppSidebarProps) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="OutlabsAuth UI"
              render={<Link to={routes.app.dashboard} />}
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
                <ShieldCheck className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">OutlabsAuth UI</span>
                <span className="truncate text-xs text-sidebar-foreground/70">
                  Agnostic auth console
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {navigationGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon
                  const isActive = item.to
                    ? pathname === item.to || pathname.startsWith(`${item.to}/`)
                    : false
                  const tooltip = item.comingSoon
                    ? `${item.title} (coming soon)`
                    : item.title

                  return (
                    <SidebarMenuItem key={item.title}>
                      {item.to ? (
                        <SidebarMenuButton
                          tooltip={tooltip}
                          isActive={isActive}
                          render={<Link to={item.to} />}
                        >
                          <Icon />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton tooltip={tooltip} disabled>
                          <Icon />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      )}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarUserMenu
          user={user}
          isLoggingOut={isLoggingOut}
          onLogout={onLogout}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
