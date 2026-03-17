import { AppInfoPopover } from '@/components/app/app-info-popover'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { RolesPageSearch } from '@/features/roles/types/roles.types'
import { formatRoleToken } from '@/features/roles/utils/role-display'

type RolesFilterRailProps = {
  search: RolesPageSearch
  rootOptions: Array<{ id: string; display_name: string }>
  entityTypes: string[]
  stats: {
    total: number
    global: number
    root: number
    entity: number
  }
  onSearchChange: (next: RolesPageSearch) => void
}

export function RolesFilterRail({
  search,
  rootOptions,
  entityTypes,
  stats,
  onSearchChange,
}: RolesFilterRailProps) {
  return (
    <div className="space-y-4">
      <Card className="border border-border/70 bg-card/90">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">Filters</CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                onSearchChange({
                  roleType: 'all',
                  scopeMode: 'all',
                  usage: 'all',
                  system: 'all',
                })
              }
            >
              Reset
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="roles-search">Search</Label>
            <Input
              id="roles-search"
              placeholder="Search roles, entities, or permissions"
              value={search.search ?? ''}
              onChange={(event) =>
                onSearchChange({
                  ...search,
                  search: event.target.value || undefined,
                })
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Role type</Label>
            <Select
              value={search.roleType ?? 'all'}
              onValueChange={(value) =>
                onSearchChange({
                  ...search,
                  roleType: value as RolesPageSearch['roleType'],
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All role types</SelectItem>
                <SelectItem value="global">Global</SelectItem>
                <SelectItem value="root">Organization</SelectItem>
                <SelectItem value="entity">Entity-defined</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label>Scope mode</Label>
              <AppInfoPopover
                label="Explain role scope mode"
                title="Scope mode"
              >
                Hierarchy roles apply at the defining entity and its descendants.
                Entity-only roles stay local to one entity.
              </AppInfoPopover>
            </div>
            <Select
              value={search.scopeMode ?? 'all'}
              onValueChange={(value) =>
                onSearchChange({
                  ...search,
                  scopeMode: value as RolesPageSearch['scopeMode'],
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All scope modes</SelectItem>
                <SelectItem value="hierarchy">Hierarchy</SelectItem>
                <SelectItem value="entity_only">Entity only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label>Owning root</Label>
              <AppInfoPopover
                label="Explain owning root"
                title="Owning root"
              >
                Organization and entity-defined roles belong to one root entity.
                Global roles have no root owner.
              </AppInfoPopover>
            </div>
            <Select
              value={search.scopeRootId ?? 'all'}
              onValueChange={(value) =>
                onSearchChange({
                  ...search,
                  scopeRootId: value && value !== 'all' ? value : undefined,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All roots" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roots</SelectItem>
                {rootOptions.map((rootOption) => (
                  <SelectItem key={rootOption.id} value={rootOption.id}>
                    {rootOption.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label>Assignable entity type</Label>
              <AppInfoPopover
                label="Explain assignable entity type"
                title="Assignable entity type"
              >
                Some roles can only be granted at specific entity types. Use this
                filter to find roles that are valid for a region, office, team, or
                another local shape in the tree.
              </AppInfoPopover>
            </div>
            <Select
              value={search.assignableType ?? 'all'}
              onValueChange={(value) =>
                onSearchChange({
                  ...search,
                  assignableType: value && value !== 'all' ? value : undefined,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Any entity type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any entity type</SelectItem>
                {entityTypes.map((entityType) => (
                  <SelectItem key={entityType} value={entityType}>
                    {formatRoleToken(entityType)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label>Assignment mode</Label>
                <AppInfoPopover
                  label="Explain assignment mode"
                  title="Assignment mode"
                >
                  Auto-assigned roles are granted automatically in supported entity
                  contexts. Manual roles require an explicit assignment.
                </AppInfoPopover>
              </div>
              <Select
                value={search.usage ?? 'all'}
                onValueChange={(value) =>
                  onSearchChange({
                    ...search,
                    usage: value as RolesPageSearch['usage'],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="auto">Auto-assigned</SelectItem>
                  <SelectItem value="manual">Manual only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>System status</Label>
              <Select
                value={search.system ?? 'all'}
                onValueChange={(value) =>
                  onSearchChange({
                    ...search,
                    system: value as RolesPageSearch['system'],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="system">System only</SelectItem>
                  <SelectItem value="custom">Custom only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-border/70 bg-card/90">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Catalog snapshot</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-2xl border bg-muted/20 px-4 py-3">
            <div className="text-2xl font-semibold">{stats.total}</div>
            <div className="text-xs tracking-wide text-muted-foreground uppercase">Visible roles</div>
          </div>
          <div className="rounded-2xl border bg-muted/20 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">Global</div>
                <div className="text-xs text-muted-foreground">System-wide catalog</div>
              </div>
              <Badge variant="outline">{stats.global}</Badge>
            </div>
          </div>
          <div className="rounded-2xl border bg-muted/20 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">Organization</div>
                <div className="text-xs text-muted-foreground">Top-level scoped roles</div>
              </div>
              <Badge variant="outline">{stats.root}</Badge>
            </div>
          </div>
          <div className="rounded-2xl border bg-muted/20 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">Entity-defined</div>
                <div className="text-xs text-muted-foreground">Local and inherited roles</div>
              </div>
              <Badge variant="outline">{stats.entity}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
