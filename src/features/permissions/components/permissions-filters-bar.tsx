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
  PermissionStatusFilter,
  PermissionSystemFilter,
  PermissionsPageSearch,
} from '@/features/permissions/types/permissions.types'
import { formatPermissionToken } from '@/features/permissions/utils/permissions-display'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'

type PermissionsFiltersBarProps = {
  search: PermissionsPageSearch
  resources: string[]
  tags: string[]
  onApply: (next: PermissionsPageSearch) => void
  onReset: () => void
}

const statusOptions: Array<{ label: string; value: PermissionStatusFilter }> = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
]

const systemOptions: Array<{ label: string; value: PermissionSystemFilter }> = [
  { label: 'System only', value: 'system' },
  { label: 'Custom only', value: 'custom' },
]

export function PermissionsFiltersBar({
  search,
  resources,
  tags,
  onApply,
  onReset,
}: PermissionsFiltersBarProps) {
  const [searchValue, setSearchValue] = useState(search.search ?? '')
  const [resource, setResource] = useState(search.resource ?? 'all')
  const [status, setStatus] = useState<PermissionStatusFilter | 'all'>(search.status ?? 'all')
  const [system, setSystem] = useState<PermissionSystemFilter | 'all'>(search.system ?? 'all')
  const [tag, setTag] = useState(search.tag ?? 'all')
  const debouncedSearchValue = useDebouncedValue(searchValue)
  const hasMountedRef = useRef(false)

  const hasDraftFilters = Boolean(
    searchValue.trim() || resource !== 'all' || status !== 'all' || system !== 'all' || tag !== 'all'
  )

  function buildFilters(next?: {
    searchValue?: string
    resource?: string
    status?: PermissionStatusFilter | 'all'
    system?: PermissionSystemFilter | 'all'
    tag?: string
  }) {
    const nextSearchValue = next?.searchValue ?? searchValue
    const nextResource = next?.resource ?? resource
    const nextStatus = next?.status ?? status
    const nextSystem = next?.system ?? system
    const nextTag = next?.tag ?? tag

    return {
      search: nextSearchValue.trim() || undefined,
      resource: nextResource !== 'all' ? nextResource : undefined,
      status: nextStatus !== 'all' ? nextStatus : undefined,
      system: nextSystem !== 'all' ? nextSystem : undefined,
      tag: nextTag !== 'all' ? nextTag : undefined,
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
      className="flex min-w-0 flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        onApply(buildFilters())
      }}
    >
      <div className="relative min-w-[240px] flex-[1_1_320px]">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder="Search permissions, names, resources, or tags"
          aria-label="Search permissions"
          className="pl-9"
        />
      </div>

      <div className="w-full shrink-0 sm:w-[170px]">
        <Select
          value={resource}
          onValueChange={(value) => {
            const nextResource = String(value ?? 'all')
            setResource(nextResource)
            onApply(buildFilters({
              resource: nextResource,
            }))
          }}
        >
          <SelectTrigger className="w-full" aria-label="Filter by resource">
            <SelectValue placeholder="All resources" />
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            <SelectGroup>
              <SelectItem value="all">All resources</SelectItem>
              {resources.map((resourceOption) => (
                <SelectItem key={resourceOption} value={resourceOption}>
                  {resourceOption === '*'
                    ? 'Wildcard'
                    : formatPermissionToken(resourceOption, 'General')}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="w-full shrink-0 sm:w-[160px]">
        <Select
          value={status}
          onValueChange={(value) => {
            const nextStatus = (value ?? 'all') as PermissionStatusFilter | 'all'
            setStatus(nextStatus)
            onApply(buildFilters({
              status: nextStatus,
            }))
          }}
        >
          <SelectTrigger className="w-full" aria-label="Filter by catalog status">
            <SelectValue placeholder="Catalog status" />
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            <SelectGroup>
              <SelectItem value="all">All statuses</SelectItem>
              {statusOptions.map((option) => (
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
            const nextSystem = (value ?? 'all') as PermissionSystemFilter | 'all'
            setSystem(nextSystem)
            onApply(buildFilters({
              system: nextSystem,
            }))
          }}
        >
          <SelectTrigger className="w-full" aria-label="Filter by system status">
            <SelectValue placeholder="System status" />
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            <SelectGroup>
              <SelectItem value="all">All types</SelectItem>
              {systemOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="w-full min-w-[180px] shrink-0 sm:w-[180px]">
        <Select
          value={tag}
          onValueChange={(value) => {
            const nextTag = String(value ?? 'all')
            setTag(nextTag)
            onApply(buildFilters({
              tag: nextTag,
            }))
          }}
        >
          <SelectTrigger className="w-full" aria-label="Filter by tag">
            <SelectValue placeholder="Any tag" />
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            <SelectGroup>
              <SelectItem value="all">Any tag</SelectItem>
              {tags.map((tagOption) => (
                <SelectItem key={tagOption} value={tagOption}>
                  {tagOption}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {hasDraftFilters ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSearchValue('')
              setResource('all')
              setStatus('all')
              setSystem('all')
              setTag('all')
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
