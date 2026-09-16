'use client'

import { Fragment, useMemo, useState } from 'react'
import type { BucketEtfContribution, SectorExposureResponse } from './PortfolioPageClient'

type SortColumn = 'sector' | 'total_weight_percentage'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const DEFAULT_PAGE_SIZE = 25

function sectorKey(sector: SectorExposureResponse): string {
  /**
   * Returns the stable identity key for a sector bucket.
   *
   * sector is the only identifier here (no ticker/name fallback chain
   * like HoldingsExposureTable's holdingKey, since a bucket has no stock
   * identity of its own) -- 'unknown' stands in for a null sector.
   */
  return sector.sector ?? 'unknown'
}

function searchSectors(
  sectors: SectorExposureResponse[],
  query: string,
): SectorExposureResponse[] {
  /**
   * Filters sectors by a case-insensitive substring match against sector.
   * An empty/whitespace-only query returns all sectors.
   */
  const q = query.trim().toLowerCase()
  if (!q) return sectors
  return sectors.filter((s) => s.sector?.toLowerCase().includes(q) ?? false)
}

function sortSectors(
  sectors: SectorExposureResponse[],
  column: SortColumn | null,
  direction: 'asc' | 'desc',
): SectorExposureResponse[] {
  /**
   * Sorts sectors by the given column in the given direction.
   *
   * Mirrors HoldingsExposureTable's sortHoldings: a null sector always
   * sorts last in both directions; returns a new array without mutating
   * the input.
   */
  if (!column) return sectors
  return [...sectors].sort((a, b) => {
    const av = a[column]
    const bv = b[column]
    if (av === null && bv === null) return 0
    if (av === null) return 1
    if (bv === null) return -1
    if (typeof av === 'string' && typeof bv === 'string') {
      return direction === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    }
    const an = av as number
    const bn = bv as number
    return direction === 'asc' ? an - bn : bn - an
  })
}

function paginateSectors(
  sectors: SectorExposureResponse[],
  page: number,
  pageSize: number,
): SectorExposureResponse[] {
  const start = (page - 1) * pageSize
  return sectors.slice(start, start + pageSize)
}

export function SectorExposureTable({
  sectors,
}: {
  sectors: SectorExposureResponse[]
}): JSX.Element {
  /**
   * Searchable, sortable table of all look-through sector exposure
   * buckets, with per-row expansion revealing the contributing ETFs.
   *
   * Mirrors GeographyExposureTable exactly, keyed by `sector` instead of
   * `country_code`.
   *
   * Args:
   *   sectors: Full look-through sector exposure list from
   *            GET /portfolio/holdings/sectors, passed by
   *            PortfolioPageClient.
   *
   * Returns:
   *   JSX table with search input, sortable thead, and expandable tbody rows.
   */
  const [searchQuery, setSearchQuery] = useState('')
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [currentPage, setCurrentPage] = useState(1)

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setCurrentPage(1)
  }

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
    setCurrentPage(1)
  }

  const handlePageSizeChange = (value: number) => {
    setPageSize(value)
    setCurrentPage(1)
  }

  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const filteredSectors = useMemo(
    () => searchSectors(sectors, searchQuery),
    [sectors, searchQuery],
  )

  const sortedSectors = useMemo(
    () => sortSectors(filteredSectors, sortColumn, sortDirection),
    [filteredSectors, sortColumn, sortDirection],
  )

  const totalPages = Math.max(1, Math.ceil(sortedSectors.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)

  const paginatedSectors = useMemo(
    () => paginateSectors(sortedSectors, safePage, pageSize),
    [sortedSectors, safePage, pageSize],
  )

  const inputClass =
    'rounded border border-roman-stone/40 bg-transparent px-3 py-1.5 text-sm text-roman-stone placeholder:text-roman-stone/50 focus:border-roman-gold focus:outline-none transition-colors dark:text-roman-parchment'

  const selectClass =
    'rounded border border-roman-stone/40 bg-roman-parchment px-3 py-1.5 text-sm text-roman-stone focus:border-roman-gold focus:outline-none transition-colors dark:bg-roman-obsidian dark:text-roman-parchment'

  const pageButtonClass =
    'rounded border border-roman-stone/30 px-2 py-1 text-xs text-roman-stone hover:border-roman-gold/50 hover:text-roman-gold transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-roman-stone/30 disabled:hover:text-roman-stone'

  const thBase = 'py-3 pr-4 font-medium text-roman-gold text-left'
  const thSortable = `${thBase} cursor-pointer select-none hover:text-roman-parchment transition-colors`

  const sortIndicator = (column: SortColumn) => {
    if (sortColumn !== column) return ' ↕'
    return sortDirection === 'asc' ? ' ↑' : ' ↓'
  }

  return (
    <div className="mb-6 rounded-2xl border border-roman-stone/10 bg-white/5 dark:bg-roman-obsidian/50 p-6 backdrop-blur-sm">
      <h2 className="mb-6 font-roman text-xl font-bold text-roman-gold">
        Look-Through Exposure by Sector
      </h2>
      {sectors.length === 0 ? (
        <p className="text-roman-stone">No sector data available.</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by sector name…"
              className={`${inputClass} w-full max-w-sm`}
            />
            <div className="flex items-center gap-2 text-sm text-roman-stone">
              <label htmlFor="sectors-page-size">Rows per page</label>
              <select
                id="sectors-page-size"
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className={selectClass}
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {sortedSectors.length === 0 ? (
            <p className="text-roman-stone">No sectors match your search.</p>
          ) : (
            <div className="w-full max-h-[32rem] overflow-x-auto overflow-y-auto">
              <table className="w-full border-collapse text-sm text-roman-stone">
                <thead>
                  <tr className="border-b border-roman-stone/20 text-left">
                    <th className={thSortable} onClick={() => handleSort('sector')}>
                      Sector{sortIndicator('sector')}
                    </th>
                    <th
                      className={thSortable}
                      onClick={() => handleSort('total_weight_percentage')}
                    >
                      Total Weight %{sortIndicator('total_weight_percentage')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedSectors.map((sector) => {
                    const key = sectorKey(sector)
                    const isExpanded = expandedKeys.has(key)
                    return (
                      <Fragment key={key}>
                        <tr
                          onClick={() => toggleExpanded(key)}
                          className="border-b border-roman-stone/10 hover:bg-roman-stone/5 transition-colors cursor-pointer"
                        >
                          <td className="py-3 pr-4 font-medium">
                            <span className="mr-1 text-roman-stone/40 select-none">
                              {isExpanded ? '▾' : '▸'}
                            </span>
                            {sector.sector ?? 'Unknown'}
                          </td>
                          <td className="py-3 pr-4 tabular-nums">
                            {sector.total_weight_percentage.toFixed(2)}%
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-roman-stone/5">
                            <td colSpan={2} className="px-6 py-4">
                              {sector.contributions.length === 0 ? (
                                <p className="text-xs text-roman-stone/60">
                                  No contributing ETFs recorded.
                                </p>
                              ) : (
                                <table className="w-full text-xs text-roman-stone border-collapse">
                                  <thead>
                                    <tr className="border-b border-roman-stone/20 text-left">
                                      <th className="pb-2 pr-6 font-medium text-roman-gold">
                                        ETF
                                      </th>
                                      <th className="pb-2 pr-6 font-medium text-roman-gold">
                                        Portfolio Share
                                      </th>
                                      <th className="pb-2 pr-6 font-medium text-roman-gold">
                                        Fund Weight
                                      </th>
                                      <th className="pb-2 pr-6 font-medium text-roman-gold">
                                        Contribution
                                      </th>
                                      <th className="pb-2 font-medium text-roman-gold">
                                        As of
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {sector.contributions.map((c: BucketEtfContribution) => (
                                      <tr
                                        key={`${c.etf_ticker}-${c.snapshot_date}`}
                                        className="border-b border-roman-stone/10"
                                      >
                                        <td className="py-1.5 pr-6" title={c.etf_name}>
                                          {c.etf_ticker}
                                        </td>
                                        <td className="py-1.5 pr-6 tabular-nums text-roman-stone/70">
                                          {c.etf_portfolio_weight_percentage.toFixed(2)}%
                                        </td>
                                        <td className="py-1.5 pr-6 tabular-nums text-roman-stone/70">
                                          {c.bucket_weight_in_etf_percentage.toFixed(2)}%
                                        </td>
                                        <td className="py-1.5 pr-6 tabular-nums font-medium">
                                          {c.contribution_weight_percentage.toFixed(2)}%
                                        </td>
                                        <td className="py-1.5 tabular-nums">
                                          {c.snapshot_date}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {sortedSectors.length > 0 && (
            <div className="mt-4 flex items-center justify-end gap-3 text-sm text-roman-stone">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className={pageButtonClass}
              >
                Previous
              </button>
              <span className="tabular-nums">
                Page {safePage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className={pageButtonClass}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
