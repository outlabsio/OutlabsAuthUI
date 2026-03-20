import { useEffect, useState } from 'react'

import { Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
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

function getFilterLabel<T extends string>(
  value: T | 'all',
  options: Array<{ label: string; value: T }>,
  allLabel: string
) {
  if (value === 'all') {
    return allLabel
  }

  return options.find((option) => option.value === value)?.label ?? allLabel
}

export function RolesFiltersBar({
  search,
  rootOptions,
  entityTypes,
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

  const roleTypeLabel = getFilterLabel(roleType, roleTypeOptions, 'All role types')
  const scopeModeLabel = getFilterLabel(scopeMode, scopeModeOptions, 'All scope modes')
  const usageLabel = getFilterLabel(usage, usageOptions, 'All assignment modes')
  const systemLabel = getFilterLabel(system, systemOptions, 'All system statuses')
  const scopeRootLabel =
    scopeRootId === 'all'
      ? 'All owning roots'
      : rootOptions.find((rootOption) => rootOption.id === scopeRootId)?.display_name ??
        'All owning roots'
  const assignableTypeLabel =
    assignableType === 'all' ? 'Any entity type' : formatRoleToken(assignableType)

  return (
    <form
      className="flex min-w-0 flex-wrap items-center gap-2 bg-muted/20 px-3 py-2 md:px-4"
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
      <div className="relative min-w-[190px] flex-[0_1_220px] xl:flex-[0_1_240px]">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder="Search roles, entities, or permissions"
          aria-label="Search roles"
          className="pl-9"
        />
      </div>

      <div className="w-full shrink-0 sm:w-[150px]">
        <Select
          value={roleType}
          onValueChange={(value) => setRoleType((value ?? 'all') as RoleTypeFilter | 'all')}
        >
          <SelectTrigger className="w-full" aria-label="Filter by role type">
            <SelectValue>{roleTypeLabel}</SelectValue>
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

      <div className="w-full shrink-0 sm:w-[150px]">
        <Select
          value={scopeMode}
          onValueChange={(value) => setScopeMode((value ?? 'all') as RoleScopeFilter | 'all')}
        >
          <SelectTrigger className="w-full" aria-label="Filter by scope mode">
            <SelectValue>{scopeModeLabel}</SelectValue>
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

      <div className="w-full min-w-[190px] shrink-0 sm:w-[190px]">
        <Select value={scopeRootId} onValueChange={(value) => setScopeRootId(String(value ?? 'all'))}>
          <SelectTrigger className="w-full" aria-label="Filter by owning root">
            <SelectValue>{scopeRootLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            <SelectGroup>
              <SelectItem value="all">All owning roots</SelectItem>
              {rootOptions.map((rootOption) => (
                <SelectItem key={rootOption.id} value={rootOption.id}>
                  {rootOption.display_name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="w-full shrink-0 sm:w-[160px]">
        <Select
          value={assignableType}
          onValueChange={(value) => setAssignableType(String(value ?? 'all'))}
        >
          <SelectTrigger className="w-full" aria-label="Filter by assignable entity type">
            <SelectValue>{assignableTypeLabel}</SelectValue>
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
            <SelectValue>{usageLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            <SelectGroup>
              <SelectItem value="all">All assignment modes</SelectItem>
              {usageOptions.map((option) => (
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
          value={system}
          onValueChange={(value) => setSystem((value ?? 'all') as RoleSystemFilter | 'all')}
        >
          <SelectTrigger className="w-full" aria-label="Filter by system status">
            <SelectValue>{systemLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            <SelectGroup>
              <SelectItem value="all">All system statuses</SelectItem>
              {systemOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Button type="submit" className="min-w-24">
          Apply
        </Button>
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
  )
}
