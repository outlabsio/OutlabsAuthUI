import { useEffect, useState } from 'react'

import { Search, X } from 'lucide-react'

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
import { Input } from '@/components/ui/input'
import type { UserListStatusFilter, UsersPageSearch } from '@/features/users/types/users.types'

type EntityOption = {
  id: string
  label: string
}

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

  useEffect(() => {
    setSearch(filters.search ?? '')
    setStatus(filters.status ?? 'all')
    setRootEntityId(filters.rootEntityId)
  }, [filters.rootEntityId, filters.search, filters.status])

  const hasActiveFilters = Boolean(filters.search || filters.status || filters.rootEntityId)
  const selectedEntity =
    entityOptions.find((option) => option.id === rootEntityId) ?? null

  return (
    <form
      className="grid gap-2 xl:grid-cols-[minmax(0,1.6fr)_180px_220px_auto]"
      onSubmit={(event) => {
        event.preventDefault()
        onApply({
          search: search.trim() || undefined,
          status: status === 'all' ? undefined : (status as UserListStatusFilter),
          rootEntityId,
        })
      }}
    >
      <div className="relative">
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
        <Select
          items={statusSelectItems}
          value={status}
          onValueChange={(value) => {
            setStatus(value ?? 'all')
          }}
        >
          <SelectTrigger className="w-full min-w-40" aria-label="Filter by status">
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
      ) : null}
      {showEntityFilter ? (
        <Combobox
          items={entityOptions}
          itemToStringValue={(item) => item.label}
          value={selectedEntity}
          onValueChange={(value) => {
            setRootEntityId(value?.id)
          }}
        >
          <ComboboxInput
            placeholder="All entities"
            aria-label="Filter by entity"
            className="w-full min-w-48"
            showClear
          />
          <ComboboxContent align="start">
            <ComboboxEmpty>No entities found.</ComboboxEmpty>
            <ComboboxList>
              {(option) => (
                <ComboboxItem key={option.id} value={option}>
                  {option.label}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" className="flex-1 lg:flex-none">
          Apply
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setSearch('')
            setStatus('all')
            setRootEntityId(undefined)
            onReset()
          }}
          disabled={!hasActiveFilters}
        >
          <X className="size-4" />
          Reset
        </Button>
      </div>
    </form>
  )
}
