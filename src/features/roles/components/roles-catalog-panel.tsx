import { ArrowRight, Sparkles } from 'lucide-react'

import { AppInfoPopover } from '@/components/app/app-info-popover'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Role } from '@/features/roles/types/roles.types'
import {
  formatAssignableTypes,
  getRoleBlastRadiusLabel,
  getRoleScopeSummary,
} from '@/features/roles/utils/role-display'
import { cn } from '@/lib/utils/cn'

type RolesCatalogPanelProps = {
  roleGroups: Array<{
    key: 'global' | 'root' | 'entity'
    label: string
    roles: Role[]
  }>
  selectedRoleId?: string
  isLoading: boolean
  isRefreshing: boolean
  errorMessage?: string | null
  onRoleSelect: (roleId: string) => void
}

export function RolesCatalogPanel({
  roleGroups,
  selectedRoleId,
  isLoading,
  isRefreshing,
  errorMessage,
  onRoleSelect,
}: RolesCatalogPanelProps) {
  return (
    <Card className="flex min-h-0 flex-col overflow-hidden border border-border/70 bg-card/90">
      <CardHeader className="border-b border-border/60">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Role catalog</CardTitle>
            <AppInfoPopover
              label="Explain role catalog grouping"
              title="Role catalog"
            >
              Roles are grouped by ownership shape: global, organization-scoped, and entity-defined.
            </AppInfoPopover>
          </div>
          {isRefreshing ? (
            <Badge variant="outline" className="gap-1.5">
              <Sparkles className="size-3.5" />
              Refreshing
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 overflow-auto p-4">
        {errorMessage ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-4 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-28 animate-pulse rounded-2xl border bg-muted/30"
              />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {roleGroups.map((group) => (
              <section key={group.key} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{group.label}</div>
                  <Badge variant="outline">{group.roles.length}</Badge>
                </div>

                {group.roles.length > 0 ? (
                  <div className="space-y-3">
                    {group.roles.map((role) => {
                      const assignableTypes = formatAssignableTypes(role)

                      return (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => onRoleSelect(role.id)}
                          className={cn(
                            'w-full rounded-3xl border px-4 py-4 text-left transition-colors',
                            selectedRoleId === role.id
                              ? 'border-primary bg-primary/8'
                              : 'border-border/70 bg-background/80 hover:bg-muted/35'
                          )}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 space-y-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="font-medium">{role.display_name}</div>
                                {role.is_system_role ? (
                                  <Badge variant="secondary">System</Badge>
                                ) : null}
                                {role.is_auto_assigned ? (
                                  <Badge variant="outline">Auto-assigned</Badge>
                                ) : null}
                                <Badge variant="outline">
                                  {role.permissions.length} permissions
                                </Badge>
                              </div>
                              <p className="text-sm leading-6 text-muted-foreground">
                                {role.description || getRoleScopeSummary(role)}
                              </p>
                              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                                <span>{getRoleBlastRadiusLabel(role)}</span>
                                {assignableTypes ? (
                                  <span>Assignable at: {assignableTypes}</span>
                                ) : null}
                              </div>
                            </div>
                            <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed px-4 py-4 text-sm text-muted-foreground">
                    No roles match this section right now.
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
