import { useEffect, useMemo, useState } from 'react'

import {
  Building2,
  ChevronRight,
  Search,
} from 'lucide-react'

import { AppInfoPopover } from '@/components/app/app-info-popover'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import { Label } from '@/components/ui/label'
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarInput,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import type { Entity } from '@/features/entities/types/entities.types'
import type { EntityTreeNode } from '@/features/entities/utils/build-entity-tree'
import {
  formatEntityToken,
  getEntityClassLabel,
  getEntityStatusVariant,
} from '@/features/entities/utils/entity-display'
import { cn } from '@/lib/utils/cn'

type EntityTreePanelProps = {
  rootEntity: Entity | null
  rootOptions: Entity[]
  canSwitchRoot: boolean
  selectedRootId?: string
  searchValue: string
  totalCount: number
  visibleCount: number
  selectedPathIds: string[]
  selectedEntityId?: string
  tree: EntityTreeNode[]
  onSearchChange: (value: string) => void
  onRootChange: (rootId: string) => void
  onEntitySelect: (entityId: string) => void
}

type EntityTreeRowProps = {
  node: EntityTreeNode
  selectedEntityId?: string
  selectedPathIds: Set<string>
  searchActive: boolean
  expandedIds: Set<string>
  onEntitySelect: (entityId: string) => void
  onToggleExpanded: (entityId: string) => void
  depth?: number
}

function collectExpandableIds(nodes: EntityTreeNode[]) {
  const ids = new Set<string>()

  function visit(node: EntityTreeNode) {
    if (node.children.length > 0) {
      ids.add(node.id)
      node.children.forEach(visit)
    }
  }

  nodes.forEach(visit)

  return ids
}

function EntityTreeRow({
  node,
  selectedEntityId,
  selectedPathIds,
  searchActive,
  expandedIds,
  onEntitySelect,
  onToggleExpanded,
  depth = 0,
}: EntityTreeRowProps) {
  const hasChildren = node.children.length > 0
  const isSelected = node.id === selectedEntityId
  const isInSelectedPath = selectedPathIds.has(node.id)
  const isExpanded = searchActive
    ? hasChildren
    : hasChildren && expandedIds.has(node.id)
  const isCompact = depth > 0
  const RowWrapper = isCompact ? SidebarMenuSubItem : SidebarMenuItem

  return (
    <RowWrapper>
      <Collapsible open={isExpanded}>
        <div className="space-y-0.5">
          <div
            className={cn(
              'flex w-full min-w-0 items-start gap-1.5 rounded-lg px-1.5 py-1.5 text-sidebar-foreground transition-colors',
              isSelected
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : isInSelectedPath
                  ? 'bg-sidebar-accent/65'
                  : 'hover:bg-sidebar-accent/55'
            )}
          >
            {hasChildren ? (
              <CollapsibleTrigger
                className={cn(
                  'mt-0.5 flex shrink-0 items-center justify-center rounded-md text-sidebar-foreground/60 outline-hidden transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                  isCompact ? 'size-4.5' : 'size-5',
                  isExpanded ? 'text-sidebar-foreground' : null,
                  searchActive ? 'cursor-default opacity-70' : null
                )}
                disabled={searchActive}
                onClick={() => {
                  if (searchActive) {
                    return
                  }

                  onToggleExpanded(node.id)
                }}
              >
                <ChevronRight
                  className={cn('size-3.5 transition-transform', isExpanded ? 'rotate-90' : null)}
                />
              </CollapsibleTrigger>
            ) : (
              <div
                className={cn(
                  'mt-0.5 flex shrink-0 items-center justify-center rounded-md bg-sidebar-accent/65 text-sidebar-foreground/60',
                  isCompact ? 'size-4.5' : 'size-5'
                )}
              >
                <Building2 className={cn(isCompact ? 'size-2.75' : 'size-3')} />
              </div>
            )}

            <button
              type="button"
              className="grid w-full min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1 text-left outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              onClick={() => onEntitySelect(node.id)}
            >
              <span
                className={cn(
                  'block min-w-0 truncate font-medium',
                  isCompact ? 'text-[0.95rem]' : 'text-sm',
                  isSelected
                    ? 'text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground'
                )}
              >
                {node.display_name}
              </span>

              <div className="col-start-2 row-span-2 flex shrink-0 flex-col items-end gap-1 self-start">
                <Badge
                  variant={getEntityStatusVariant(node.status)}
                  className={cn(isCompact ? 'h-4 px-1.5 text-[10px]' : null)}
                >
                  {formatEntityToken(node.status)}
                </Badge>
                {isSelected ? (
                  <Badge
                    variant="secondary"
                    className={cn(isCompact ? 'h-4 px-1.5 text-[10px]' : null)}
                  >
                    Current
                  </Badge>
                ) : null}
              </div>

              <div
                className={cn(
                  'col-start-1 row-start-2 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px]',
                  isSelected
                    ? 'text-sidebar-accent-foreground/75'
                    : 'text-sidebar-foreground/70'
                )}
              >
                <span className="shrink-0">{formatEntityToken(node.entity_type)}</span>
                <span className="shrink-0">&#8226;</span>
                <span className={cn(isCompact ? 'truncate' : null)}>
                  {getEntityClassLabel(node.entity_class)}
                </span>
                {hasChildren ? (
                  <>
                    <span className="shrink-0">&#8226;</span>
                    <span className="shrink-0">
                      {node.children.length} child{node.children.length === 1 ? '' : 'ren'}
                    </span>
                  </>
                ) : null}
              </div>
            </button>
          </div>

          {hasChildren ? (
            <CollapsibleContent>
              <SidebarMenuSub className="mt-0.5 mx-1.5 border-sidebar-border/70 px-1 py-0">
                {node.children.map((childNode) => (
                  <EntityTreeRow
                    key={childNode.id}
                    node={childNode}
                    selectedEntityId={selectedEntityId}
                    selectedPathIds={selectedPathIds}
                    searchActive={searchActive}
                    expandedIds={expandedIds}
                    onEntitySelect={onEntitySelect}
                    onToggleExpanded={onToggleExpanded}
                    depth={depth + 1}
                  />
                ))}
              </SidebarMenuSub>
            </CollapsibleContent>
          ) : null}
        </div>
      </Collapsible>
    </RowWrapper>
  )
}

export function EntityTreePanel({
  rootEntity,
  rootOptions,
  canSwitchRoot,
  selectedRootId,
  searchValue,
  totalCount,
  visibleCount,
  selectedPathIds,
  selectedEntityId,
  tree,
  onSearchChange,
  onRootChange,
  onEntitySelect,
}: EntityTreePanelProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!rootEntity?.id) {
      setExpandedIds(new Set())
      return
    }

    setExpandedIds(new Set([rootEntity.id, ...selectedPathIds.slice(0, -1)]))
  }, [rootEntity?.id])

  useEffect(() => {
    if (selectedPathIds.length === 0) {
      return
    }

    setExpandedIds((currentIds) => {
      const nextIds = new Set(currentIds)

      if (rootEntity?.id) {
        nextIds.add(rootEntity.id)
      }

      selectedPathIds.slice(0, -1).forEach((entityId) => nextIds.add(entityId))

      return nextIds
    })
  }, [rootEntity?.id, selectedPathIds])

  const searchActive = searchValue.trim().length > 0
  const autoExpandedIds = useMemo(() => collectExpandableIds(tree), [tree])
  const resolvedExpandedIds = searchActive ? autoExpandedIds : expandedIds
  const selectedPathIdsSet = useMemo(() => new Set(selectedPathIds), [selectedPathIds])
  const selectedRootOption = useMemo(
    () => rootOptions.find((rootOption) => rootOption.id === selectedRootId) ?? null,
    [rootOptions, selectedRootId]
  )

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border px-4 py-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">Hierarchy navigator</h2>
            <AppInfoPopover
              label="Explain hierarchy navigator"
              title="Hierarchy navigator"
            >
              Use the tree to move through one root scope at a time. Search only filters
              the visible branch, and the current path stays expanded so you do not lose
              context.
            </AppInfoPopover>
          </div>

          <div className="no-scrollbar flex flex-nowrap items-center gap-1.5 overflow-x-auto">
            <Badge variant="outline" className="h-4.5 px-1.5 text-[10px] sm:h-5 sm:px-2 sm:text-xs">
              {visibleCount} visible
            </Badge>
            <Badge variant="outline" className="h-4.5 px-1.5 text-[10px] sm:h-5 sm:px-2 sm:text-xs">
              {totalCount} in scope
            </Badge>
            {!canSwitchRoot ? (
              <Badge variant="outline" className="h-4.5 px-1.5 text-[10px] sm:h-5 sm:px-2 sm:text-xs">
                Scope locked
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      <div className="border-b border-sidebar-border px-3 py-3">
        <SidebarGroup className="gap-3 p-0">
          <SidebarGroupContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label
                  htmlFor="entities-root-scope"
                  className="text-[11px] font-medium tracking-[0.18em] text-sidebar-foreground/65 uppercase"
                >
                  Root scope
                </Label>
                <AppInfoPopover
                  label="Explain root scope"
                  title="Root scope"
                >
                  The entity workspace operates inside one root scope at a time. Superusers can
                  switch roots here, while scoped admins stay locked to their allowed branch.
                </AppInfoPopover>
              </div>
              {canSwitchRoot ? (
                <Combobox
                  items={rootOptions}
                  value={selectedRootOption}
                  itemToStringLabel={(item) => item?.display_name ?? ''}
                  itemToStringValue={(item) => item?.id ?? ''}
                  filter={(item, query) => {
                    if (!item) {
                      return false
                    }

                    const normalizedQuery = query.trim().toLowerCase()

                    if (!normalizedQuery) {
                      return true
                    }

                    const searchableText = [
                      item.display_name,
                      item.name,
                      item.slug,
                      item.entity_type,
                      item.status,
                      item.description ?? '',
                    ]
                      .join(' ')
                      .toLowerCase()

                    return searchableText.includes(normalizedQuery)
                  }}
                  onValueChange={(value) => {
                    if (!value?.id) {
                      return
                    }

                    onRootChange(value.id)
                  }}
                >
                  <ComboboxInput
                    id="entities-root-scope"
                    placeholder="Search root scope"
                    aria-label="Root scope"
                    className="w-full"
                  />
                  <ComboboxContent align="start">
                    <ComboboxEmpty>No root scopes found.</ComboboxEmpty>
                    <ComboboxList>
                      {(option) => (
                        <ComboboxItem key={option.id} value={option} className="items-start py-2.5">
                          <div className="flex min-w-0 flex-col gap-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{option.display_name}</span>
                              <Badge variant="outline">{formatEntityToken(option.entity_type)}</Badge>
                            </div>
                            <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span className="truncate">{option.name}</span>
                              <span>&#8226;</span>
                              <span>{formatEntityToken(option.status)}</span>
                            </div>
                          </div>
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              ) : (
                <div className="rounded-lg border border-sidebar-border bg-background/90 px-3 py-2 text-sm">
                  <div className="font-medium text-foreground">
                    {rootEntity?.display_name ?? 'No root scope assigned'}
                  </div>
                  {rootEntity ? (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {formatEntityToken(rootEntity.entity_type)}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="entities-tree-search"
                className="text-[11px] font-medium tracking-[0.18em] text-sidebar-foreground/65 uppercase"
              >
                Search this hierarchy
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-sidebar-foreground/55" />
                <SidebarInput
                  id="entities-tree-search"
                  value={searchValue}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="Search names, types, or descriptions"
                  className="pl-9"
                />
              </div>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </div>

      <SidebarContent className="px-2 py-2">
        {rootEntity ? (
          tree.length > 0 ? (
            <SidebarMenu className="gap-1">
              {tree.map((rootNode) => (
                <EntityTreeRow
                  key={rootNode.id}
                  node={rootNode}
                  selectedEntityId={selectedEntityId}
                  selectedPathIds={selectedPathIdsSet}
                  searchActive={searchActive}
                  expandedIds={resolvedExpandedIds}
                  onEntitySelect={onEntitySelect}
                  onToggleExpanded={(entityId) => {
                    setExpandedIds((currentIds) => {
                      const nextIds = new Set(currentIds)

                      if (nextIds.has(entityId)) {
                        nextIds.delete(entityId)
                      } else {
                        nextIds.add(entityId)
                      }

                      return nextIds
                    })
                  }}
                />
              ))}
            </SidebarMenu>
          ) : (
            <div className="flex min-h-full items-center justify-center rounded-2xl border border-dashed border-sidebar-border px-5 py-10 text-center">
              <div className="space-y-2">
                <div className="text-sm font-medium text-sidebar-foreground">
                  No entities matched this filter.
                </div>
                <p className="text-sm text-sidebar-foreground/70">
                  Clear the hierarchy search to see the full scope again.
                </p>
              </div>
            </div>
          )
        ) : (
          <div className="flex min-h-full items-center justify-center rounded-2xl border border-dashed border-sidebar-border px-5 py-10 text-center">
            <div className="space-y-2">
              <div className="text-sm font-medium text-sidebar-foreground">
                No entity scope is available yet.
              </div>
              <p className="text-sm text-sidebar-foreground/70">
                Pick or create a root entity to start building the hierarchy.
              </p>
            </div>
          </div>
        )}
      </SidebarContent>
    </div>
  )
}
