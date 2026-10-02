import { describe, expect, it, vi } from 'vitest'
import { clampPage, collectAllPages, countLabel, listSummary, pageCount, pageRange, slicePage } from '~/utils/pagination'

describe('page arithmetic', () => {
  it('counts pages', () => {
    expect(pageCount(0, 25)).toBe(1)
    expect(pageCount(25, 25)).toBe(1)
    expect(pageCount(26, 25)).toBe(2)
    expect(pageCount(41, 25)).toBe(2)
  })

  it('clamps pages', () => {
    expect(clampPage(0, 41, 25)).toBe(1)
    expect(clampPage(5, 41, 25)).toBe(2)
    expect(clampPage(2, 0, 25)).toBe(1)
  })

  it('computes the row range', () => {
    expect(pageRange(1, 25, 41)).toEqual({ from: 1, to: 25 })
    expect(pageRange(2, 25, 41)).toEqual({ from: 26, to: 41 })
    expect(pageRange(1, 25, 0)).toEqual({ from: 0, to: 0 })
  })

  it('slices a page', () => {
    const rows = Array.from({ length: 7 }, (_, i) => i + 1)
    expect(slicePage(rows, 1, 3)).toEqual([1, 2, 3])
    expect(slicePage(rows, 3, 3)).toEqual([7])
    expect(slicePage(rows, 9, 3)).toEqual([7])
  })
})

describe('labels', () => {
  it('pluralises', () => {
    expect(countLabel(1, 'permission')).toBe('1 permission')
    expect(countLabel(2, 'entity', 'entities')).toBe('2 entities')
  })

  it('summarises a list', () => {
    expect(listSummary(1, 25, 0, 'permission')).toBe('No permissions')
    expect(listSummary(1, 25, 12, 'permission')).toBe('12 permissions')
    expect(listSummary(2, 25, 41, 'permission')).toBe('Showing 26–41 of 41 permissions')
  })
})

describe('collectAllPages', () => {
  it('walks every page', async () => {
    const all = Array.from({ length: 5 }, (_, i) => i)
    const fetchPage = vi.fn(async (page: number, size: number) => ({
      items: all.slice((page - 1) * size, page * size),
      total: all.length,
      pages: Math.ceil(all.length / size)
    }))
    await expect(collectAllPages(fetchPage, { pageSize: 2 })).resolves.toEqual({ items: all, total: 5, complete: true })
    expect(fetchPage).toHaveBeenCalledTimes(3)
  })

  it('derives the page count when the API omits it', async () => {
    const fetchPage = vi.fn(async (page: number) => ({ items: page === 1 ? ['a', 'b'] : ['c'], total: 3 }))
    await expect(collectAllPages(fetchPage, { pageSize: 2 })).resolves.toEqual({ items: ['a', 'b', 'c'], total: 3, complete: true })
  })

  it('reports an incomplete walk instead of capping silently', async () => {
    const fetchPage = vi.fn(async () => ({ items: [1, 2], total: 10, pages: 5 }))
    await expect(collectAllPages(fetchPage, { pageSize: 2, maxPages: 2 })).resolves.toEqual({ items: [1, 2, 1, 2], total: 10, complete: false })
  })

  it('stops on an empty page', async () => {
    const fetchPage = vi.fn(async () => ({ items: [], total: 4, pages: 2 }))
    await expect(collectAllPages(fetchPage, { pageSize: 2 })).resolves.toEqual({ items: [], total: 4, complete: false })
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })
})
