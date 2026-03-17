import { KeyRound, ShieldCheck, Sparkles } from 'lucide-react'

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
import type { PermissionsPageSearch } from '@/features/permissions/types/permissions.types'
import { formatPermissionToken } from '@/features/permissions/utils/permissions-display'

type PermissionsFilterRailProps = {
  search: PermissionsPageSearch
  resources: string[]
  tags: string[]
  stats: {
    total: number
    system: number
    custom: number
    active: number
  }
  onSearchChange: (next: PermissionsPageSearch) => void
}

export function PermissionsFilterRail({
  search,
  resources,
  tags,
  stats,
  onSearchChange,
}: PermissionsFilterRailProps) {
  return (
    <div className="space-y-4">
      <Card className="border border-border/70 bg-linear-to-br from-primary/6 via-background to-accent/12">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Mental model</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-3 rounded-2xl border bg-background/70 px-3 py-3">
            <KeyRound className="mt-0.5 size-4 text-primary" />
            <div>
              <div className="font-medium text-foreground">Permissions are capability atoms</div>
              <div>They describe an action like `lead:create` or `entity:update_tree`.</div>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border bg-background/70 px-3 py-3">
            <ShieldCheck className="mt-0.5 size-4 text-primary" />
            <div>
              <div className="font-medium text-foreground">Roles decide scope</div>
              <div>Permissions do not cascade on their own. The role that grants them controls blast radius.</div>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border bg-background/70 px-3 py-3">
            <Sparkles className="mt-0.5 size-4 text-primary" />
            <div>
              <div className="font-medium text-foreground">ABAC narrows runtime use</div>
              <div>Permission conditions can restrict when a granted permission is actually effective.</div>
            </div>
          </div>
        </CardContent>
      </Card>

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
                  system: 'all',
                  status: 'all',
                })
              }
            >
              Reset
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="permissions-search">Search</Label>
            <Input
              id="permissions-search"
              placeholder="Search permissions, resources, or tags"
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
            <Label>Resource</Label>
            <Select
              value={search.resource ?? 'all'}
              onValueChange={(value) =>
                onSearchChange({
                  ...search,
                  resource: value && value !== 'all' ? value : undefined,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All resources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All resources</SelectItem>
                {resources.map((resource) => (
                  <SelectItem key={resource} value={resource}>
                    {resource === '*' ? 'Wildcard' : formatPermissionToken(resource, 'General')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <div className="space-y-2">
              <Label>Catalog status</Label>
              <Select
                value={search.status ?? 'all'}
              onValueChange={(value) =>
                onSearchChange({
                  ...search,
                  status: (value ?? 'all') as PermissionsPageSearch['status'],
                })
              }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All permissions</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
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
                  system: (value ?? 'all') as PermissionsPageSearch['system'],
                })
              }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All permissions</SelectItem>
                  <SelectItem value="system">System only</SelectItem>
                  <SelectItem value="custom">Custom only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tag</Label>
            <Select
              value={search.tag ?? 'all'}
              onValueChange={(value) =>
                onSearchChange({
                  ...search,
                  tag: value && value !== 'all' ? value : undefined,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Any tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any tag</SelectItem>
                {tags.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <div className="text-xs tracking-wide text-muted-foreground uppercase">Visible permissions</div>
          </div>
          <div className="rounded-2xl border bg-muted/20 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">{stats.custom}</div>
                <div className="text-xs tracking-wide text-muted-foreground uppercase">Custom</div>
              </div>
              <Badge variant="outline">{stats.system} system</Badge>
            </div>
          </div>
          <div className="rounded-2xl border bg-muted/20 px-4 py-3">
            <div className="text-lg font-semibold">{stats.active}</div>
            <div className="text-xs tracking-wide text-muted-foreground uppercase">Active</div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
