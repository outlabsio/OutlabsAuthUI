import { useEffect, useEffectEvent, useRef, useState } from 'react'

import { Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { EntityOption } from '@/features/entities/utils/build-entity-options'
import { Input } from '@/components/ui/input'
import type {
  UserListStatusFilter,
  UsersListView,
  UsersPageSearch,
} from '@/features/users/types/users.types'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'

type UsersFiltersProps = {
  filters: UsersPageSearch
  entityOptions: EntityOption[]
  showStatusFilter: boolean
  showEntityFilter: boolean
  showOrphanedView: boolean
  onApply: (next: Omit<UsersPageSearch, 'page'>) => void
  onReset: () => void
}

const statusOptions: Array<{
  label: string
  value: UserListStatusFilter
}> = [
  { label: 'Active', value: 'active' },
  { label: 'Invited', value: 'invited' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Banned', value: 'banned' },
  { label: 'Deleted', value: 'deleted' },
]

const statusSelectItems = [
  { label: 'All statuses', value: 'all' },
  ...statusOptions,
]

const viewSelectItems = [
  { label: 'All users', value: 'all' },
  { label: 'Orphaned', value: 'orphaned' },
]

export function UsersFilters({
  filters,
  entityOptions,
  showStatusFilter,
  showEntityFilter,
  showOrphanedView,
  onApply,
  onReset,
}: UsersFiltersProps) {
  const [search, setSearch] = useState(filters.search ?? '')
  const [status, setStatus] = useState<string>(filters.status ?? 'all')
  const [rootEntityId, setRootEntityId] = useState(filters.rootEntityId)
  const [view, setView] = useState<UsersListView>(filters.view ?? 'all')
  const debouncedSearch = useDebouncedValue(search)
  const hasMountedRef = useRef(false)
  const isOrphanedView = view === 'orphaned'

  const selectedEntity =
    entityOptions.find((option) => option.id === rootEntityId) ?? null
  const hasDraftFilters = Boolean(
    search.trim() ||
      status !== 'all' ||
      rootEntityId ||
      (showOrphanedView && view !== 'all')
  )

  function buildFilters(next?: {
    search?: string
    status?: string
    rootEntityId?: string
    view?: UsersListView
  }) {
    const nextSearch = next?.search ?? search
    const nextView = next?.view ?? view
    const nextStatus =
      nextView === 'orphaned' ? 'all' : (next?.status ?? status)
    const nextRootEntityId =
      next && 'rootEntityId' in next ? next.rootEntityId : rootEntityId

    return {
      search: nextSearch.trim() || undefined,
      status:
        nextStatus === 'all' ? undefined : (nextStatus as UserListStatusFilter),
      rootEntityId: nextRootEntityId,
      view: nextView === 'all' ? undefined : nextView,
    }
  }

  const applyDebouncedSearch = useEffectEvent((nextSearch: string) => {
    onApply(buildFilters({
      search: nextSearch,
    }))
  })

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return
    }

    applyDebouncedSearch(debouncedSearch)
  }, [debouncedSearch])

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
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
          }}
          placeholder="Search people by name or email"
          className="pl-9"
        />
      </div>
      {showOrphanedView ? (
        <div className="w-full shrink-0 sm:w-40">
          <Select
            items={viewSelectItems}
            value={view}
            onValueChange={(value) => {
              const nextView = (value ?? 'all') as UsersListView
              setView(nextView)
              if (nextView === 'orphaned') {
                setStatus('all')
              }
              onApply(
                buildFilters({
                  view: nextView,
                  status: nextView === 'orphaned' ? 'all' : status,
                })
              )
            }}
          >
            <SelectTrigger className="w-full" aria-label="Filter by user list view">
              <SelectValue placeholder="View" />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              <SelectGroup>
                <SelectItem value="all">All users</SelectItem>
                <SelectItem value="orphaned">Orphaned</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {showStatusFilter && !isOrphanedView ? (
        <div className="w-full shrink-0 sm:w-40">
          <Select
            items={statusSelectItems}
            value={status}
            onValueChange={(value) => {
              const nextStatus = value ?? 'all'
              setStatus(nextStatus)
              onApply(buildFilters({
                status: nextStatus,
              }))
            }}
          >
            <SelectTrigger className="w-full" aria-label="Filter by status">
              <SelectValue placeholder="Status" />
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
      ) : null}
      {showEntityFilter ? (
        <div className="w-full min-w-[220px] shrink-0 sm:w-[240px]">
          <Combobox
            items={entityOptions}
            itemToStringValue={(item) =>
              item ? `${item.title} ${item.pathLabel} ${item.entityTypeLabel}` : ''
            }
            value={selectedEntity}
            onValueChange={(value) => {
              const nextRootEntityId = value?.id
              setRootEntityId(nextRootEntityId)
              onApply(buildFilters({
                rootEntityId: nextRootEntityId,
              }))
            }}
          >
            <ComboboxInput
              placeholder="All entities"
              aria-label="Filter by entity"
              className="w-full min-w-0"
              showClear
            />
            <ComboboxContent align="start">
              <ComboboxEmpty>No entities found.</ComboboxEmpty>
              <ComboboxList>
                {(option) => (
                  <ComboboxItem key={option.id} value={option} className="items-start py-2.5">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="font-medium">{option.title}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {option.pathLabel}
                      </span>
                    </div>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>
      ) : null}
      <div className="flex shrink-0 items-center gap-2">
        {hasDraftFilters ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSearch('')
              setStatus('all')
              setRootEntityId(undefined)
              setView('all')
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
