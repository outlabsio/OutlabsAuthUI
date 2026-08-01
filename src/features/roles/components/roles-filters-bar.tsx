import { useEffect, useEffectEvent, useRef, useState } from 'react'

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
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'

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
  const debouncedSearchValue = useDebouncedValue(searchValue)
  const hasMountedRef = useRef(false)

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

  function buildFilters(next?: {
    searchValue?: string
    roleType?: RoleTypeFilter | 'all'
    scopeMode?: RoleScopeFilter | 'all'
    scopeRootId?: string
    assignableType?: string
    usage?: RoleUsageFilter | 'all'
    system?: RoleSystemFilter | 'all'
  }) {
    const nextSearchValue = next?.searchValue ?? searchValue
    const nextRoleType = next?.roleType ?? roleType
    const nextScopeMode = next?.scopeMode ?? scopeMode
    const nextScopeRootId = next?.scopeRootId ?? scopeRootId
    const nextAssignableType = next?.assignableType ?? assignableType
    const nextUsage = next?.usage ?? usage
    const nextSystem = next?.system ?? system

    return {
      search: nextSearchValue.trim() || undefined,
      roleType: nextRoleType !== 'all' ? nextRoleType : undefined,
      scopeMode: nextScopeMode !== 'all' ? nextScopeMode : undefined,
      scopeRootId: nextScopeRootId !== 'all' ? nextScopeRootId : undefined,
      assignableType: nextAssignableType !== 'all' ? nextAssignableType : undefined,
      usage: nextUsage !== 'all' ? nextUsage : undefined,
      system: nextSystem !== 'all' ? nextSystem : undefined,
    }
  }

  const applyDebouncedSearch = useEffectEvent((nextSearchValue: string) => {
    onApply(buildFilters({
      searchValue: nextSearchValue,
    }))
  })

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return
    }

    applyDebouncedSearch(debouncedSearchValue)
  }, [debouncedSearchValue])

  return (
    <form
      className="flex min-w-0 flex-wrap items-center gap-2 xl:flex-nowrap"
      onSubmit={(event) => {
        event.preventDefault()
        onApply(buildFilters())
      }}
    >
      <div className="relative min-w-[220px] flex-[1_1_260px]">
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
          onValueChange={(value) => {
            const nextRoleType = (value ?? 'all') as RoleTypeFilter | 'all'
            setRoleType(nextRoleType)
            onApply(buildFilters({
              roleType: nextRoleType,
            }))
          }}
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
          onValueChange={(value) => {
            const nextScopeMode = (value ?? 'all') as RoleScopeFilter | 'all'
            setScopeMode(nextScopeMode)
            onApply(buildFilters({
              scopeMode: nextScopeMode,
            }))
          }}
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
        <Select
          value={scopeRootId}
          onValueChange={(value) => {
            const nextScopeRootId = String(value ?? 'all')
            setScopeRootId(nextScopeRootId)
            onApply(buildFilters({
              scopeRootId: nextScopeRootId,
            }))
          }}
        >
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
          onValueChange={(value) => {
            const nextAssignableType = String(value ?? 'all')
            setAssignableType(nextAssignableType)
            onApply(buildFilters({
              assignableType: nextAssignableType,
            }))
          }}
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
          onValueChange={(value) => {
            const nextUsage = (value ?? 'all') as RoleUsageFilter | 'all'
            setUsage(nextUsage)
            onApply(buildFilters({
              usage: nextUsage,
            }))
          }}
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
          onValueChange={(value) => {
            const nextSystem = (value ?? 'all') as RoleSystemFilter | 'all'
            setSystem(nextSystem)
            onApply(buildFilters({
              system: nextSystem,
            }))
          }}
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
