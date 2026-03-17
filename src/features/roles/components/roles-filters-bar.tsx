import { useEffect, useState } from 'react'

import { Search } from 'lucide-react'

import { AppInfoPopover } from '@/components/app/app-info-popover'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  RoleScopeFilter,
  RoleSystemFilter,
  RoleTypeFilter,
  RoleUsageFilter,
  RolesPageSearch,
} from '@/features/roles/types/roles.types'
import { formatRoleToken } from '@/features/roles/utils/role-display'

type RolesFiltersBarProps = {
  search: RolesPageSearch
  rootOptions: Array<{ id: string; display_name: string }>
  entityTypes: string[]
  stats: {
    total: number
    global: number
    root: number
    entity: number
    auto: number
    system: number
  }
  onApply: (next: RolesPageSearch) => void
  onReset: () => void
}

const roleTypeOptions: Array<{ label: string; value: RoleTypeFilter }> = [
  { label: 'Global', value: 'global' },
  { label: 'Organization', value: 'root' },
  { label: 'Entity-defined', value: 'entity' },
]

const scopeModeOptions: Array<{ label: string; value: RoleScopeFilter }> = [
  { label: 'Hierarchy', value: 'hierarchy' },
  { label: 'Entity only', value: 'entity_only' },
]

const usageOptions: Array<{ label: string; value: RoleUsageFilter }> = [
  { label: 'Auto-assigned', value: 'auto' },
  { label: 'Manual only', value: 'manual' },
]

const systemOptions: Array<{ label: string; value: RoleSystemFilter }> = [
  { label: 'System only', value: 'system' },
  { label: 'Custom only', value: 'custom' },
]

export function RolesFiltersBar({
  search,
  rootOptions,
  entityTypes,
  stats,
  onApply,
  onReset,
}: RolesFiltersBarProps) {
  const [searchValue, setSearchValue] = useState(search.search ?? '')
  const [roleType, setRoleType] = useState<RoleTypeFilter | 'all'>(search.roleType ?? 'all')
  const [scopeMode, setScopeMode] = useState<RoleScopeFilter | 'all'>(search.scopeMode ?? 'all')
  const [scopeRootId, setScopeRootId] = useState(search.scopeRootId ?? 'all')
  const [assignableType, setAssignableType] = useState(search.assignableType ?? 'all')
  const [usage, setUsage] = useState<RoleUsageFilter | 'all'>(search.usage ?? 'all')
  const [system, setSystem] = useState<RoleSystemFilter | 'all'>(search.system ?? 'all')

  useEffect(() => {
    setSearchValue(search.search ?? '')
    setRoleType(search.roleType ?? 'all')
    setScopeMode(search.scopeMode ?? 'all')
    setScopeRootId(search.scopeRootId ?? 'all')
    setAssignableType(search.assignableType ?? 'all')
    setUsage(search.usage ?? 'all')
    setSystem(search.system ?? 'all')
  }, [
    search.assignableType,
    search.roleType,
    search.scopeMode,
    search.scopeRootId,
    search.search,
    search.system,
    search.usage,
  ])

  const hasDraftFilters = Boolean(
    searchValue.trim() ||
      roleType !== 'all' ||
      scopeMode !== 'all' ||
      scopeRootId !== 'all' ||
      assignableType !== 'all' ||
      usage !== 'all' ||
      system !== 'all'
  )

  return (
    <Card className="border border-border/70 bg-card/90">
      <CardHeader className="gap-4 border-b border-border/60">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Filters</CardTitle>
            <AppInfoPopover label="Explain role filters" title="Role filters">
              Narrow the catalog first, then inspect scope, blast radius, and assignment behavior
              in the selected role detail panel.
            </AppInfoPopover>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{stats.total} visible</Badge>
            <Badge variant="outline">{stats.global} global</Badge>
            <Badge variant="outline">{stats.root} organization</Badge>
            <Badge variant="outline">{stats.entity} entity-defined</Badge>
            <Badge variant="outline">{stats.auto} auto</Badge>
            <Badge variant="outline">{stats.system} system</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <form
          className="flex min-w-0 flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            onApply({
              search: searchValue.trim() || undefined,
              roleType: roleType !== 'all' ? roleType : undefined,
              scopeMode: scopeMode !== 'all' ? scopeMode : undefined,
              scopeRootId: scopeRootId !== 'all' ? scopeRootId : undefined,
              assignableType: assignableType !== 'all' ? assignableType : undefined,
              usage: usage !== 'all' ? usage : undefined,
              system: system !== 'all' ? system : undefined,
            })
          }}
        >
          <div className="relative min-w-[240px] flex-[1_1_320px]">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search roles, entities, or permissions"
              aria-label="Search roles"
              className="pl-9"
            />
          </div>

          <div className="w-full shrink-0 sm:w-[160px]">
            <Select
              value={roleType}
              onValueChange={(value) => setRoleType((value ?? 'all') as RoleTypeFilter | 'all')}
            >
              <SelectTrigger className="w-full" aria-label="Filter by role type">
                <SelectValue placeholder="Role type" />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                <SelectGroup>
                  <SelectItem value="all">All role types</SelectItem>
                  {roleTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="w-full shrink-0 sm:w-[160px]">
            <Select
              value={scopeMode}
              onValueChange={(value) => setScopeMode((value ?? 'all') as RoleScopeFilter | 'all')}
            >
              <SelectTrigger className="w-full" aria-label="Filter by scope mode">
                <SelectValue placeholder="Scope mode" />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                <SelectGroup>
                  <SelectItem value="all">All scope modes</SelectItem>
                  {scopeModeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="w-full shrink-0 sm:w-[180px]">
            <Select value={scopeRootId} onValueChange={(value) => setScopeRootId(String(value ?? 'all'))}>
              <SelectTrigger className="w-full" aria-label="Filter by owning root">
                <SelectValue placeholder="All roots" />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                <SelectGroup>
                  <SelectItem value="all">All roots</SelectItem>
                  {rootOptions.map((rootOption) => (
                    <SelectItem key={rootOption.id} value={rootOption.id}>
                      {rootOption.display_name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="w-full shrink-0 sm:w-[180px]">
            <Select
              value={assignableType}
              onValueChange={(value) => setAssignableType(String(value ?? 'all'))}
            >
              <SelectTrigger className="w-full" aria-label="Filter by assignable entity type">
                <SelectValue placeholder="Any entity type" />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                <SelectGroup>
                  <SelectItem value="all">Any entity type</SelectItem>
                  {entityTypes.map((entityType) => (
                    <SelectItem key={entityType} value={entityType}>
                      {formatRoleToken(entityType)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="w-full shrink-0 sm:w-[160px]">
            <Select
              value={usage}
              onValueChange={(value) => setUsage((value ?? 'all') as RoleUsageFilter | 'all')}
            >
              <SelectTrigger className="w-full" aria-label="Filter by assignment mode">
                <SelectValue placeholder="Assignment mode" />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                <SelectGroup>
                  <SelectItem value="all">All roles</SelectItem>
                  {usageOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="w-full shrink-0 sm:w-[150px]">
            <Select
              value={system}
              onValueChange={(value) => setSystem((value ?? 'all') as RoleSystemFilter | 'all')}
            >
              <SelectTrigger className="w-full" aria-label="Filter by system status">
                <SelectValue placeholder="System status" />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                <SelectGroup>
                  <SelectItem value="all">All roles</SelectItem>
                  {systemOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button type="submit">Apply</Button>
            {hasDraftFilters ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSearchValue('')
                  setRoleType('all')
                  setScopeMode('all')
                  setScopeRootId('all')
                  setAssignableType('all')
                  setUsage('all')
                  setSystem('all')
                  onReset()
                }}
              >
                Reset
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
