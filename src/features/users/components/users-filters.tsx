import { useState } from 'react'

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
import type { UserListStatusFilter, UsersPageSearch } from '@/features/users/types/users.types'

type UsersFiltersProps = {
  filters: UsersPageSearch
  entityOptions: EntityOption[]
  showStatusFilter: boolean
  showEntityFilter: boolean
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

export function UsersFilters({
  filters,
  entityOptions,
  showStatusFilter,
  showEntityFilter,
  onApply,
  onReset,
}: UsersFiltersProps) {
  const [search, setSearch] = useState(filters.search ?? '')
  const [status, setStatus] = useState<string>(filters.status ?? 'all')
  const [rootEntityId, setRootEntityId] = useState(filters.rootEntityId)

  const selectedEntity =
    entityOptions.find((option) => option.id === rootEntityId) ?? null
  const hasDraftFilters = Boolean(search.trim() || status !== 'all' || rootEntityId)

  return (
    <form
      className="flex min-w-0 flex-wrap items-center gap-2 xl:flex-nowrap"
      onSubmit={(event) => {
        event.preventDefault()
        onApply({
          search: search.trim() || undefined,
          status: status === 'all' ? undefined : (status as UserListStatusFilter),
          rootEntityId,
        })
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
      {showStatusFilter ? (
        <div className="w-full shrink-0 sm:w-40">
          <Select
            items={statusSelectItems}
            value={status}
            onValueChange={(value) => {
              setStatus(value ?? 'all')
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
              setRootEntityId(value?.id)
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
        <Button type="submit">
          Apply
        </Button>
        {hasDraftFilters ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSearch('')
              setStatus('all')
              setRootEntityId(undefined)
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
