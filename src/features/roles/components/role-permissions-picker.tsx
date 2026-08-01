import { useDeferredValue, useEffect, useMemo, useState } from 'react'

import { Search, XIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import type { RolePermissionOption } from '@/features/roles/types/role-permission-option.types'
import { formatRoleToken } from '@/features/roles/utils/role-display'

function PermissionCheckbox({
  checked,
  disabled,
  label,
  description,
  onCheckedChange,
}: {
  checked: boolean
  disabled?: boolean
  label: string
  description?: string | null
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border bg-background/80 px-3 py-3">
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(nextChecked) => onCheckedChange(Boolean(nextChecked))}
        className="mt-0.5"
      />
      <div className="space-y-1">
        <div className="text-sm font-medium">{label}</div>
        {description ? (
          <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </label>
  )
}

type RolePermissionsPickerProps = {
  permissionOptions: RolePermissionOption[]
  selectedPermissionNames: string[]
  showSelectedOnly: boolean
  disabled?: boolean
  onShowSelectedOnlyChange: (showSelectedOnly: boolean) => void
  onVisiblePermissionCountChange?: (visiblePermissionCount: number) => void
  onChange: (permissionNames: string[]) => void
}

export function RolePermissionsPicker({
  permissionOptions,
  selectedPermissionNames,
  showSelectedOnly,
  disabled = false,
  onShowSelectedOnlyChange,
  onVisiblePermissionCountChange,
  onChange,
}: RolePermissionsPickerProps) {
  const [searchValue, setSearchValue] = useState('')
  const [resourceFilter, setResourceFilter] = useState('all')
  const deferredSearchValue = useDeferredValue(searchValue)

  const resourceOptions = useMemo(
    () =>
      [...new Set(permissionOptions.map((permissionOption) => permissionOption.resource))]
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right)),
    [permissionOptions]
  ).map((resource) => ({
    label: formatRoleToken(resource, 'General'),
    value: resource,
  }))

  const selectedResourceOption = useMemo(
    () => resourceOptions.find((resourceOption) => resourceOption.value === resourceFilter) ?? null,
    [resourceFilter, resourceOptions]
  )

  const selectedPermissionNamesSet = useMemo(
    () => new Set(selectedPermissionNames),
    [selectedPermissionNames]
  )
  const normalizedSearchValue = deferredSearchValue.trim().toLowerCase()
  const hasFilters = Boolean(
    normalizedSearchValue || resourceFilter !== 'all' || showSelectedOnly
  )

  const filteredGroups = useMemo(() => {
    const groups = new Map<string, RolePermissionOption[]>()

    permissionOptions.forEach((permissionOption) => {
      if (
        resourceFilter !== 'all' &&
        permissionOption.resource !== resourceFilter
      ) {
        return
      }

      if (
        showSelectedOnly &&
        !selectedPermissionNamesSet.has(permissionOption.name)
      ) {
        return
      }

      if (normalizedSearchValue) {
        const searchHaystack = [
          permissionOption.label,
          permissionOption.name,
          permissionOption.description,
          permissionOption.resource,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        if (!searchHaystack.includes(normalizedSearchValue)) {
          return
        }
      }

      const group = groups.get(permissionOption.resource) ?? []
      group.push(permissionOption)
      groups.set(permissionOption.resource, group)
    })

    return [...groups.entries()]
      .map(([resource, items]) => ({
        resource,
        label: formatRoleToken(resource, 'General'),
        items: items.sort((left, right) => left.label.localeCompare(right.label)),
      }))
      .sort((left, right) => left.label.localeCompare(right.label))
  }, [
    normalizedSearchValue,
    permissionOptions,
    resourceFilter,
    selectedPermissionNamesSet,
    showSelectedOnly,
  ])

  const visiblePermissionCount = filteredGroups.reduce((count, group) => {
    return count + group.items.length
  }, 0)

  useEffect(() => {
    onVisiblePermissionCountChange?.(visiblePermissionCount)
  }, [onVisiblePermissionCountChange, visiblePermissionCount])

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-muted/20 p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_15rem_auto] lg:items-center">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search role permissions"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search permissions, descriptions, or system names"
              className="pl-9"
            />
          </div>

          <div className="min-w-0">
            <Combobox
              items={resourceOptions}
              itemToStringValue={(item) => (item ? `${item.label} ${item.value}` : '')}
              value={selectedResourceOption}
              onValueChange={(value) => {
                setResourceFilter(value?.value ?? 'all')
              }}
            >
              <ComboboxInput
                aria-label="Filter permissions by resource"
                className="w-full min-w-0"
                placeholder="All resources"
                showClear
                disabled={disabled || resourceOptions.length === 0}
              />
              <ComboboxContent align="start">
                <ComboboxEmpty>No resources found.</ComboboxEmpty>
                <ComboboxList>
                  {(resourceOption) => (
                    <ComboboxItem key={resourceOption.value} value={resourceOption}>
                      {resourceOption.label}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {hasFilters ? (
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Reset permission filters"
                title="Reset filters"
                onClick={() => {
                  setSearchValue('')
                  setResourceFilter('all')
                  onShowSelectedOnlyChange(false)
                }}
              >
                <XIcon className="size-4" />
              </Button>
            ) : null}

            {selectedPermissionNames.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => onChange([])}
              >
                Clear selected
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {filteredGroups.length > 0 ? (
        <div className="max-h-[34rem] space-y-4 overflow-auto pr-1">
          {filteredGroups.map((group) => {
            const groupSelectedCount = group.items.filter((permissionOption) =>
              selectedPermissionNamesSet.has(permissionOption.name)
            ).length

            return (
              <div key={group.resource} className="space-y-3 rounded-2xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{group.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {group.items.length} visible
                      {groupSelectedCount > 0 ? ` · ${groupSelectedCount} selected` : ''}
                    </div>
                  </div>
                  <Badge variant="outline">
                    {groupSelectedCount > 0
                      ? `${groupSelectedCount}/${group.items.length}`
                      : group.items.length}
                  </Badge>
                </div>

                <div className="space-y-2">
                  {group.items.map((permissionOption) => (
                    <PermissionCheckbox
                      key={permissionOption.name}
                      checked={selectedPermissionNamesSet.has(permissionOption.name)}
                      disabled={disabled}
                      label={permissionOption.label}
                      description={permissionOption.description ?? permissionOption.name}
                      onCheckedChange={(checked) => {
                        const nextPermissions = checked
                          ? [...selectedPermissionNames, permissionOption.name]
                          : selectedPermissionNames.filter(
                              (permissionName) =>
                                permissionName !== permissionOption.name
                            )

                        onChange(nextPermissions)
                      }}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
          {permissionOptions.length === 0
            ? 'No permission catalog is available for this backend response.'
            : 'No permissions matched the current filters.'}
        </div>
      )}
    </div>
  )
}
