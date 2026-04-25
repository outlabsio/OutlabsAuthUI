import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import {
  Building2,
  ChevronsUpDown,
  Key,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Settings,
  Shield,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react'

import { AppThemeToggle } from '@/components/app/app-theme-toggle'
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
import { getAuthConfigQueryOptions } from '@/features/auth/api/auth.query-options'
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
  useSidebar,
} from '@/components/ui/sidebar'
import { routes } from '@/lib/constants/routes'
import { getRuntimeConfig } from '@/lib/runtime-config'
import {
  type WorkspaceKey,
  isWorkspaceVisible,
} from '@/lib/workspace-visibility'

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
  key: WorkspaceKey
  title: string
  to:
    | typeof routes.app.dashboard
    | typeof routes.app.apiKeys
    | typeof routes.app.systemApiKeys
    | typeof routes.app.settings
    | typeof routes.app.users
    | typeof routes.app.permissions
    | typeof routes.app.roles
    | typeof routes.app.entities
  icon: React.ComponentType<{ className?: string }>
}

const navigationGroups: Array<{
  label: string
  items: NavigationItem[]
}> = [
  {
    label: 'Workspace',
    items: [
      {
        key: 'dashboard',
        title: 'Dashboard',
        to: routes.app.dashboard,
        icon: LayoutDashboard,
      },
      {
        key: 'settings',
        title: 'Settings',
        to: routes.app.settings,
        icon: Settings,
      },
    ],
  },
  {
    label: 'Auth',
    items: [
      {
        key: 'apiKeys',
        title: 'API Keys',
        to: routes.app.apiKeys,
        icon: Key,
      },
      {
        key: 'systemApiKeys',
        title: 'System API Keys',
        to: routes.app.systemApiKeys,
        icon: KeyRound,
      },
      {
        key: 'users',
        title: 'Users',
        to: routes.app.users,
        icon: Users,
      },
      {
        key: 'permissions',
        title: 'Permissions',
        to: routes.app.permissions,
        icon: Shield,
      },
      {
        key: 'roles',
        title: 'Roles',
        to: routes.app.roles,
        icon: ShieldCheck,
      },
      {
        key: 'entities',
        title: 'Entities',
        to: routes.app.entities,
        icon: Building2,
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
  const navigate = useNavigate()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground"
                aria-label={`Open account menu for ${user.email}`}
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
              <DropdownMenuItem
                onClick={() => {
                  void navigate({
                    to: routes.app.account,
                  })
                }}
              >
                <UserRound />
                Account
              </DropdownMenuItem>
              <AppThemeToggle variant="menu-item" />
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
  const runtimeConfig = getRuntimeConfig()
  const authConfigQuery = useQuery(getAuthConfigQueryOptions())
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return (
    <Sidebar
      variant="inset"
      collapsible="icon"
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex h-12 items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0">
              <div className="flex aspect-square size-8 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
                <ShieldCheck className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{runtimeConfig.appName}</span>
                <span className="truncate text-xs text-sidebar-foreground/70">
                  {runtimeConfig.appSubtitle}
                </span>
              </div>
            </div>
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
                  if (!isWorkspaceVisible(item.key, authConfigQuery.data?.features)) {
                    return null
                  }

                  const Icon = item.icon
                  const isActive =
                    pathname === item.to || pathname.startsWith(`${item.to}/`)

                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        tooltip={item.title}
                        isActive={isActive}
                        render={<Link to={item.to} />}
                      >
                        <Icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
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
    </Sidebar>
  )
}
