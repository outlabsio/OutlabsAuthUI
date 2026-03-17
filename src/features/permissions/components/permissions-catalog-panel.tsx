import { ArrowRight, Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Permission } from '@/features/permissions/types/permissions.types'
import {
  getPermissionBehaviorSummary,
  getPermissionLifecycleLabel,
} from '@/features/permissions/utils/permissions-display'
import { cn } from '@/lib/utils/cn'

type PermissionsCatalogPanelProps = {
  permissionGroups: Array<{
    key: string
    label: string
    description: string
    permissions: Permission[]
  }>
  selectedPermissionId?: string
  isLoading: boolean
  isRefreshing: boolean
  errorMessage?: string | null
  onPermissionSelect: (permissionId: string) => void
}

export function PermissionsCatalogPanel({
  permissionGroups,
  selectedPermissionId,
  isLoading,
  isRefreshing,
  errorMessage,
  onPermissionSelect,
}: PermissionsCatalogPanelProps) {
  return (
    <Card className="flex min-h-0 flex-col overflow-hidden border border-border/70 bg-card/90">
      <CardHeader className="border-b border-border/60">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base">Permission catalog</CardTitle>
            <p className="text-sm text-muted-foreground">
              Permissions are grouped by resource so action coverage is easy to inspect.
            </p>
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
            {permissionGroups.map((group) => (
              <section key={group.key} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{group.label}</div>
                    <div className="text-sm text-muted-foreground">{group.description}</div>
                  </div>
                  <Badge variant="outline">{group.permissions.length}</Badge>
                </div>

                {group.permissions.length > 0 ? (
                  <div className="space-y-3">
                    {group.permissions.map((permission) => (
                      <button
                        key={permission.id}
                        type="button"
                        onClick={() => onPermissionSelect(permission.id)}
                        className={cn(
                          'w-full rounded-3xl border px-4 py-4 text-left transition-colors',
                          selectedPermissionId === permission.id
                            ? 'border-primary bg-primary/8'
                            : 'border-border/70 bg-background/80 hover:bg-muted/35'
                        )}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-medium">{permission.display_name}</div>
                              {permission.is_system ? (
                                <Badge variant="secondary">System</Badge>
                              ) : (
                                <Badge variant="outline">Custom</Badge>
                              )}
                              <Badge variant={permission.is_active ? 'outline' : 'secondary'}>
                                {permission.is_active ? 'Active' : 'Inactive'}
                              </Badge>
                            </div>
                            <p className="text-sm leading-6 text-muted-foreground">
                              {permission.description || getPermissionBehaviorSummary(permission)}
                            </p>
                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <span className="rounded-full border bg-muted/30 px-2 py-1 font-mono">
                                {permission.name}
                              </span>
                              <span>{getPermissionLifecycleLabel(permission)}</span>
                              {permission.tags.slice(0, 3).map((tag) => (
                                <Badge key={tag} variant="outline">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed px-4 py-4 text-sm text-muted-foreground">
                    No permissions match this section right now.
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
