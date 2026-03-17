import { useEffect, useMemo, useState } from 'react'

import {
  Building2,
  ChevronRight,
  GitBranch,
  LockKeyhole,
  Search,
  Workflow,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
}: EntityTreeRowProps) {
  const hasChildren = node.children.length > 0
  const isSelected = node.id === selectedEntityId
  const isInSelectedPath = selectedPathIds.has(node.id)
  const isExpanded = searchActive
    ? hasChildren
    : hasChildren && expandedIds.has(node.id)

  return (
    <Collapsible open={isExpanded}>
      <div className="space-y-1">
        <div
          className={cn(
            'flex items-start gap-2 rounded-2xl border p-2 transition-colors',
            isSelected
              ? 'border-primary/25 bg-primary/6 shadow-sm'
              : isInSelectedPath
                ? 'border-border/70 bg-muted/25'
                : 'border-transparent hover:border-border/70 hover:bg-muted/25'
          )}
        >
          {hasChildren ? (
            <CollapsibleTrigger
              className={cn(
                'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/60 text-muted-foreground transition-transform hover:bg-muted/60',
                isExpanded ? 'text-foreground' : null,
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
                className={cn('size-4 transition-transform', isExpanded ? 'rotate-90' : null)}
              />
            </CollapsibleTrigger>
          ) : (
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border border-dashed border-border/60 text-muted-foreground">
              <Building2 className="size-4" />
            </div>
          )}

          <button
            type="button"
            className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left"
            onClick={() => onEntitySelect(node.id)}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium text-foreground">
                  {node.display_name}
                </span>
                {isSelected ? <Badge variant="secondary">Current</Badge> : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{formatEntityToken(node.entity_type)}</span>
                <span>&#8226;</span>
                <span>{getEntityClassLabel(node.entity_class)}</span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {hasChildren ? (
                <Badge variant="outline" className="hidden sm:inline-flex">
                  {node.children.length} child{node.children.length === 1 ? '' : 'ren'}
                </Badge>
              ) : null}
              <Badge variant={getEntityStatusVariant(node.status)}>
                {formatEntityToken(node.status)}
              </Badge>
            </div>
          </button>
        </div>

        {hasChildren ? (
          <CollapsibleContent className="ml-4 border-l border-border/60 pl-3">
            <div className="space-y-1 pt-1">
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
                />
              ))}
            </div>
          </CollapsibleContent>
        ) : null}
      </div>
    </Collapsible>
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

  return (
    <Card className="flex min-h-0 flex-col border border-border/70 bg-card/90">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <Workflow className="size-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <CardTitle>Hierarchy navigator</CardTitle>
            <CardDescription>
              Move through the entity tree, switch top-level scope, and keep the current path visible.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <section className="rounded-2xl border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <GitBranch className="size-3.5" />
              {visibleCount} visible
            </Badge>
            <Badge variant="outline">{totalCount} in scope</Badge>
            {canSwitchRoot ? (
              <Badge variant="outline">Scope switch enabled</Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <LockKeyhole className="size-3.5" />
                Scope locked
              </Badge>
            )}
          </div>

          <div className="mt-4 space-y-2">
            <Label htmlFor="entities-root-scope">Root scope</Label>
            {canSwitchRoot ? (
              <Select
                value={selectedRootId}
                onValueChange={(value) => {
                  if (!value) {
                    return
                  }

                  onRootChange(value)
                }}
              >
                <SelectTrigger id="entities-root-scope" className="w-full">
                  <SelectValue placeholder="Select a root entity" />
                </SelectTrigger>
                <SelectContent>
                  {rootOptions.map((entityOption) => (
                    <SelectItem key={entityOption.id} value={entityOption.id}>
                      <div className="flex flex-col items-start">
                        <span>{entityOption.display_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatEntityToken(entityOption.entity_type)}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="rounded-xl border bg-background px-3 py-2.5 text-sm">
                <div className="font-medium text-foreground">
                  {rootEntity?.display_name ?? 'No root scope assigned'}
                </div>
                {rootEntity ? (
                  <div className="mt-1 text-muted-foreground">
                    {formatEntityToken(rootEntity.entity_type)}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="mt-4 space-y-2">
            <Label htmlFor="entities-tree-search">Search this hierarchy</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="entities-tree-search"
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search names, types, or descriptions"
                className="pl-9"
              />
            </div>
          </div>
        </section>

        <div className="min-h-0 flex-1 overflow-auto pr-1">
          {rootEntity ? (
            tree.length > 0 ? (
              <div className="space-y-2">
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
              </div>
            ) : (
              <div className="flex min-h-full items-center justify-center rounded-2xl border border-dashed px-5 py-10 text-center">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-foreground">
                    No entities matched this filter.
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Clear the hierarchy search to see the full scope again.
                  </p>
                </div>
              </div>
            )
          ) : (
            <div className="flex min-h-full items-center justify-center rounded-2xl border border-dashed px-5 py-10 text-center">
              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">
                  No entity scope is available yet.
                </div>
                <p className="text-sm text-muted-foreground">
                  Pick or create a root entity to start building the hierarchy.
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
