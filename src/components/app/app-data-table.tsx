import type { ReactNode, Ref } from 'react'

import {
  type ColumnDef,
  type OnChangeFn,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'

import { AppEmptyState } from '@/components/app/app-empty-state'
import { AppErrorState } from '@/components/app/app-error-state'
import { AppLoadingState } from '@/components/app/app-loading-state'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getApiErrorMessage } from '@/lib/api/errors'
import { cn } from '@/lib/utils/cn'

export type AppDataTablePagination = {
  page: number
  pages: number
  total: number
  totalLabel: string
  onPageChange: (page: number) => void
}

export type AppDataTableEmptyState = {
  title: string
  description?: ReactNode
  action?: ReactNode
}

export type AppDataTableProps<TData> = {
  data: TData[]
  columns: ColumnDef<TData>[]
  getRowId?: (row: TData) => string
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState> | ((sorting: SortingState) => void)
  sortingMode?: 'client' | 'server'
  pagination?: AppDataTablePagination
  isLoading: boolean
  isRefreshing?: boolean
  isPlaceholderData?: boolean
  error?: unknown
  errorFallback?: string
  onRetry?: () => void
  emptyState: AppDataTableEmptyState
  onRowClick?: (row: TData) => void
  columnWidths?: Record<string, string>
  className?: string
  selectedRowId?: string
  loadingTitle?: string
  loadingDescription?: string
  footerExtra?: ReactNode
  scrollContainerRef?: Ref<HTMLDivElement>
}

export function AppDataTable<TData>({
  data,
  columns,
  getRowId,
  sorting,
  onSortingChange,
  sortingMode = 'client',
  pagination,
  isLoading,
  isRefreshing = false,
  isPlaceholderData = false,
  error,
  errorFallback = 'This data could not be loaded.',
  onRetry,
  emptyState,
  onRowClick,
  columnWidths,
  className,
  selectedRowId,
  loadingTitle = 'Loading',
  loadingDescription,
  footerExtra,
  scrollContainerRef,
}: AppDataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    state: sorting ? { sorting } : undefined,
    onSortingChange: onSortingChange
      ? (updater) => {
          const next = typeof updater === 'function' ? updater(sorting ?? []) : updater
          onSortingChange(next)
        }
      : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: sortingMode === 'server' ? undefined : getSortedRowModel(),
    manualSorting: sortingMode === 'server',
  })

  const isQuietlyRefreshing = isRefreshing || isPlaceholderData
  const isEmpty = !isLoading && !error && data.length === 0
  const showFooter = !isLoading && !error && !isEmpty && (Boolean(pagination) || Boolean(footerExtra))

  function getColumnWidthStyle(columnId: string) {
    const width = columnWidths?.[columnId]
    return width ? { width } : undefined
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      {error ? (
        <AppErrorState
          action={
            onRetry ? (
              <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                Retry
              </Button>
            ) : undefined
          }
          className="min-h-0 flex-1 border-none"
          compact
        >
          {getApiErrorMessage(error, errorFallback)}
        </AppErrorState>
      ) : isLoading ? (
        <AppLoadingState title={loadingTitle} description={loadingDescription} />
      ) : isEmpty ? (
        <AppEmptyState
          title={emptyState.title}
          description={emptyState.description}
          action={emptyState.action}
          className="min-h-0 flex-1 border-none"
          compact
        />
      ) : (
        <div
          ref={scrollContainerRef}
          className="min-h-0 flex-1 overflow-auto [&>[data-slot=table-container]]:overflow-visible"
        >
          <Table className="table-fixed">
            <TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_var(--color-border)]">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className="px-4"
                      style={getColumnWidthStyle(header.column.id)}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => {
                const isSelected = selectedRowId !== undefined && selectedRowId === row.id

                return (
                  <TableRow
                    key={row.id}
                    data-state={isSelected ? 'selected' : undefined}
                    className={
                      onRowClick ? 'cursor-pointer transition-colors hover:bg-muted/60' : undefined
                    }
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className="px-4 py-4 align-top whitespace-normal"
                        style={getColumnWidthStyle(cell.column.id)}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {showFooter ? (
        <div className="flex flex-col gap-3 border-t px-4 py-3 md:flex-row md:items-center md:justify-between">
          {pagination ? (
            <>
              <div className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.pages} with {pagination.total}{' '}
                {pagination.totalLabel}
                {isQuietlyRefreshing ? ' | Refreshing...' : ''}
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => pagination.onPageChange(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => pagination.onPageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.pages}
                >
                  Next
                </Button>
              </div>
            </>
          ) : null}
          {footerExtra}
        </div>
      ) : null}
    </div>
  )
}
