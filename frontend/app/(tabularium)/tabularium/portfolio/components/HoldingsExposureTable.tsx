'use client'

import { Fragment, useMemo, useState } from 'react'
import type { HoldingContribution, HoldingExposureResponse } from './PortfolioPageClient'

type SortColumn = 'stock_ticker' | 'stock_isin' | 'stock_name' | 'total_weight_percentage'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const DEFAULT_PAGE_SIZE = 25

function holdingKey(holding: HoldingExposureResponse): string {
  /**
   * Returns the stable identity key for a holding.
   *
   * Same fallback order already used by ConcentrationAlertBadge and
   * HoldingsBarChart, reused here as the row key and the expand/collapse
   * identifier.
   *
   * Args:
   *   holding: A single look-through exposure row.
   *
   * Returns:
   *   A non-null string uniquely identifying the row within the response.
   */
  return holding.stock_isin ?? holding.stock_ticker ?? holding.stock_name
}

function searchHoldings(
  holdings: HoldingExposureResponse[],
  query: string,
): HoldingExposureResponse[] {
  /**
   * Filters holdings by a case-insensitive substring match against
   * stock_name, stock_ticker, and stock_isin.
   *
   * A holding matches if ANY of the three fields contains the query;
   * null identifier fields are skipped, not treated as a match. An
   * empty/whitespace-only query returns all holdings unfiltered.
   *
   * Args:
   *   holdings: Full look-through exposure list.
   *   query: The current search box value.
   *
   * Returns:
   *   The subset of holdings matching the query.
   */
  const q = query.trim().toLowerCase()
  if (!q) return holdings
  return holdings.filter(
    (h) =>
      h.stock_name.toLowerCase().includes(q) ||
      (h.stock_ticker?.toLowerCase().includes(q) ?? false) ||
      (h.stock_isin?.toLowerCase().includes(q) ?? false),
  )
}

function sortHoldings(
  holdings: HoldingExposureResponse[],
  column: SortColumn | null,
  direction: 'asc' | 'desc',
): HoldingExposureResponse[] {
  /**
   * Sorts holdings by the given column in the given direction.
   *
   * Mirrors PortfolioOverviewTable's sortRows: null values (stock_isin,
   * stock_ticker) always sort last in both directions; returns a new
   * array without mutating the input.
   *
   * Args:
   *   holdings: Holdings to sort (typically the already-searched subset).
   *   column: Column key to sort by, or null for no sort.
   *   direction: Sort direction.
   *
   * Returns:
   *   New sorted array.
   */
  if (!column) return holdings
  return [...holdings].sort((a, b) => {
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

function paginateHoldings(
  holdings: HoldingExposureResponse[],
  page: number,
  pageSize: number,
): HoldingExposureResponse[] {
  /**
   * Slices holdings to the given 1-indexed page.
   *
   * Args:
   *   holdings: Holdings to paginate (the already-searched-and-sorted list).
   *   page: 1-indexed page number.
   *   pageSize: Number of rows per page.
   *
   * Returns:
   *   The rows for that page; empty array if page is beyond the last page.
   */
  const start = (page - 1) * pageSize
  return holdings.slice(start, start + pageSize)
}

export function HoldingsExposureTable({
  holdings,
}: {
  holdings: HoldingExposureResponse[]
}): JSX.Element {
  /**
   * Searchable, sortable table of all look-through holdings, with
   * per-row expansion revealing the contributing ETFs.
   *
   * Owns searchQuery, sortColumn/sortDirection, expandedKeys (Set<string>),
   * and pageSize/currentPage state — independent multi-row expansion, not a
   * single expandedId, since there is no fetch cost here to bound
   * (contributions are already present on each holding). Search, sort, and
   * pagination are applied client-side via useMemo, in that order (paginate
   * runs on the already-searched-and-sorted list). Changing the search
   * query, sort column/direction, or page size resets to page 1; currentPage
   * is additionally clamped to the current total page count on every render
   * so a shrinking result set (e.g. holdings itself changing) never strands
   * the view on a page that no longer exists. The row table body scrolls
   * independently (vertical + horizontal) so a large page size doesn't blow
   * out the page's height. Renders its own card with its own heading,
   * matching HoldingsBarChart/HoldingsTreemap/PortfolioOverviewTable's
   * convention. Renders an empty-state message when holdings is empty,
   * and a distinct "no matches" message when a search query matches
   * nothing.
   *
   * Args:
   *   holdings: Full look-through exposure list from
   *             GET /portfolio/holdings/exposure, passed by
   *             PortfolioPageClient.
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

  const filteredHoldings = useMemo(
    () => searchHoldings(holdings, searchQuery),
    [holdings, searchQuery],
  )

  const sortedHoldings = useMemo(
    () => sortHoldings(filteredHoldings, sortColumn, sortDirection),
    [filteredHoldings, sortColumn, sortDirection],
  )

  const totalPages = Math.max(1, Math.ceil(sortedHoldings.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)

  const paginatedHoldings = useMemo(
    () => paginateHoldings(sortedHoldings, safePage, pageSize),
    [sortedHoldings, safePage, pageSize],
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
        Look-Through Exposure by Stock
      </h2>
      {holdings.length === 0 ? (
        <p className="text-roman-stone">No holdings data available.</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by name, ticker, or ISIN…"
              className={`${inputClass} w-full max-w-sm`}
            />
            <div className="flex items-center gap-2 text-sm text-roman-stone">
              <label htmlFor="holdings-page-size">Rows per page</label>
              <select
                id="holdings-page-size"
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
          {sortedHoldings.length === 0 ? (
            <p className="text-roman-stone">No stocks match your search.</p>
          ) : (
            <div className="w-full max-h-[32rem] overflow-x-auto overflow-y-auto">
              <table className="w-full border-collapse text-sm text-roman-stone">
                <thead>
                  <tr className="border-b border-roman-stone/20 text-left">
                    <th className={thSortable} onClick={() => handleSort('stock_ticker')}>
                      Ticker{sortIndicator('stock_ticker')}
                    </th>
                    <th className={thSortable} onClick={() => handleSort('stock_isin')}>
                      ISIN{sortIndicator('stock_isin')}
                    </th>
                    <th className={thSortable} onClick={() => handleSort('stock_name')}>
                      Name{sortIndicator('stock_name')}
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
                  {paginatedHoldings.map((holding) => {
                    const key = holdingKey(holding)
                    const isExpanded = expandedKeys.has(key)
                    return (
                      <Fragment key={key}>
                        <tr
                          onClick={() => toggleExpanded(key)}
                          className="border-b border-roman-stone/10 hover:bg-roman-stone/5 transition-colors cursor-pointer"
                        >
                          <td className="py-3 pr-4 font-mono font-medium">
                            <span className="mr-1 text-roman-stone/40 select-none">
                              {isExpanded ? '▾' : '▸'}
                            </span>
                            {holding.stock_ticker ?? '—'}
                          </td>
                          <td className="py-3 pr-4 font-mono">{holding.stock_isin ?? '—'}</td>
                          <td
                            className="py-3 pr-4 max-w-[240px] truncate"
                            title={holding.stock_name}
                          >
                            {holding.stock_name}
                          </td>
                          <td className="py-3 pr-4 tabular-nums">
                            {holding.total_weight_percentage.toFixed(2)}%
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-roman-stone/5">
                            <td colSpan={4} className="px-6 py-4">
                              {holding.contributions.length === 0 ? (
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
                                        Contribution
                                      </th>
                                      <th className="pb-2 font-medium text-roman-gold">
                                        As of
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {holding.contributions.map((c: HoldingContribution) => (
                                      <tr
                                        key={`${c.etf_ticker}-${c.snapshot_date}`}
                                        className="border-b border-roman-stone/10"
                                      >
                                        <td className="py-1.5 pr-6" title={c.etf_name}>
                                          {c.etf_ticker}
                                        </td>
                                        <td className="py-1.5 pr-6 tabular-nums">
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
          {sortedHoldings.length > 0 && (
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
