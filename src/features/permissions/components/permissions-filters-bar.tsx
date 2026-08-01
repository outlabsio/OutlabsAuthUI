import { useEffect, useEffectEvent, useRef, useState } from 'react'

import { Filter, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
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
}

const statusOptions: Array<{ label: string; value: PermissionStatusFilter }> = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
]

const systemOptions: Array<{ label: string; value: PermissionSystemFilter }> = [
  { label: 'System only', value: 'system' },
  { label: 'Custom only', value: 'custom' },
]

type PermissionsSearchControlProps = {
  search: PermissionsPageSearch
  onApply: (next: PermissionsPageSearch) => void
}

function buildNextSearch(
  currentSearch: PermissionsPageSearch,
  next?: {
    searchValue?: string
    resource?: string
    status?: PermissionStatusFilter | 'all'
    system?: PermissionSystemFilter | 'all'
    tag?: string
  }
) {
  return {
    ...currentSearch,
    search:
      next && 'searchValue' in next
        ? next.searchValue?.trim() || undefined
        : currentSearch.search,
    resource:
      next && 'resource' in next
        ? next.resource !== 'all'
          ? next.resource
          : undefined
        : currentSearch.resource,
    status:
      next && 'status' in next
        ? next.status !== 'all'
          ? next.status
          : undefined
        : currentSearch.status,
    system:
      next && 'system' in next
        ? next.system !== 'all'
          ? next.system
          : undefined
        : currentSearch.system,
    tag:
      next && 'tag' in next
        ? next.tag !== 'all'
          ? next.tag
          : undefined
        : currentSearch.tag,
  }
}

export function PermissionsSearchControl({
  search,
  onApply,
}: PermissionsSearchControlProps) {
  const [searchValue, setSearchValue] = useState(search.search ?? '')
  const debouncedSearchValue = useDebouncedValue(searchValue)
  const hasMountedRef = useRef(false)

  const applyDebouncedSearch = useEffectEvent((nextSearchValue: string) => {
    onApply(buildNextSearch(search, {
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
      className="w-[min(42rem,44vw)] min-w-64"
      onSubmit={(event) => {
        event.preventDefault()
        onApply(buildNextSearch(search, {
          searchValue,
        }))
      }}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder="Search permissions, names, resources, or tags"
          aria-label="Search permissions"
          className="h-8 pl-9"
        />
      </div>
    </form>
  )
}

export function PermissionsFiltersPopover({
  search,
  resources,
  tags,
  onApply,
}: PermissionsFiltersBarProps) {
  const [resource, setResource] = useState(search.resource ?? 'all')
  const [status, setStatus] = useState<PermissionStatusFilter | 'all'>(search.status ?? 'all')
  const [system, setSystem] = useState<PermissionSystemFilter | 'all'>(search.system ?? 'all')
  const [tag, setTag] = useState(search.tag ?? 'all')

  const hasDraftFilters = Boolean(
    resource !== 'all' || status !== 'all' || system !== 'all' || tag !== 'all'
  )

  function buildFilters(next?: {
    resource?: string
    status?: PermissionStatusFilter | 'all'
    system?: PermissionSystemFilter | 'all'
    tag?: string
  }) {
    const nextResource = next?.resource ?? resource
    const nextStatus = next?.status ?? status
    const nextSystem = next?.system ?? system
    const nextTag = next?.tag ?? tag

    return buildNextSearch(search, {
      resource: nextResource,
      status: nextStatus,
      system: nextSystem,
      tag: nextTag,
    })
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="relative"
            aria-label="Filter permissions"
          >
            <Filter className="size-4" />
            {hasDraftFilters ? (
              <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary" />
            ) : null}
          </Button>
        }
      />
      <PopoverContent align="end" sideOffset={8} className="w-80 gap-3 p-3">
        <PopoverHeader>
          <PopoverTitle>Filter permissions</PopoverTitle>
        </PopoverHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Resource</div>
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

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Catalog status</div>
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

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Type</div>
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

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Tag</div>
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

          {hasDraftFilters ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                setResource('all')
                setStatus('all')
                setSystem('all')
                setTag('all')
                onApply(buildNextSearch(search, {
                  resource: 'all',
                  status: 'all',
                  system: 'all',
                  tag: 'all',
                }))
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
