'use client'

import { Fragment, useMemo, useState } from 'react'
import type { BucketEtfContribution, CountryExposureResponse } from './PortfolioPageClient'
import { countryDisplayName, countryLabel } from '../utils/countryDisplay'

type SortColumn = 'country_code' | 'total_weight_percentage'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const DEFAULT_PAGE_SIZE = 25

function countryKey(country: CountryExposureResponse): string {
  /**
   * Returns the stable identity key for a country bucket.
   *
   * country_code is the only identifier here (no ticker/name fallback
   * chain like HoldingsExposureTable's holdingKey, since a bucket has no
   * stock identity of its own) -- 'unknown' stands in for a null code.
   */
  return country.country_code ?? 'unknown'
}

function searchCountries(
  countries: CountryExposureResponse[],
  query: string,
): CountryExposureResponse[] {
  /**
   * Filters countries by a case-insensitive substring match against either
   * the raw country_code or its full display name (e.g. matches "ch" and
   * "switz" alike). An empty/whitespace-only query returns all countries.
   */
  const q = query.trim().toLowerCase()
  if (!q) return countries
  return countries.filter(
    (c) =>
      (c.country_code?.toLowerCase().includes(q) ?? false) ||
      countryDisplayName(c.country_code).toLowerCase().includes(q),
  )
}

function sortCountries(
  countries: CountryExposureResponse[],
  column: SortColumn | null,
  direction: 'asc' | 'desc',
): CountryExposureResponse[] {
  /**
   * Sorts countries by the given column in the given direction.
   *
   * Mirrors HoldingsExposureTable's sortHoldings: a null country_code
   * always sorts last in both directions; returns a new array without
   * mutating the input.
   */
  if (!column) return countries
  return [...countries].sort((a, b) => {
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

function paginateCountries(
  countries: CountryExposureResponse[],
  page: number,
  pageSize: number,
): CountryExposureResponse[] {
  const start = (page - 1) * pageSize
  return countries.slice(start, start + pageSize)
}

export function GeographyExposureTable({
  countries,
}: {
  countries: CountryExposureResponse[]
}): JSX.Element {
  /**
   * Searchable, sortable table of all look-through geography exposure
   * buckets, with per-row expansion revealing the contributing stocks.
   *
   * Mirrors HoldingsExposureTable's state shape (searchQuery,
   * sortColumn/sortDirection, expandedKeys, pageSize/currentPage) and
   * search->sort->paginate pipeline exactly. The expand panel is also the
   * same per-ETF contributions table as HoldingsExposureTable's (ETF,
   * Portfolio Share, Fund Weight, Contribution, As of) -- an ETF holding
   * several stocks within this country is already collapsed server-side
   * into one combined row per ETF.
   *
   * Args:
   *   countries: Full look-through geography exposure list from
   *              GET /portfolio/holdings/geography, passed by
   *              PortfolioPageClient.
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

  const filteredCountries = useMemo(
    () => searchCountries(countries, searchQuery),
    [countries, searchQuery],
  )

  const sortedCountries = useMemo(
    () => sortCountries(filteredCountries, sortColumn, sortDirection),
    [filteredCountries, sortColumn, sortDirection],
  )

  const totalPages = Math.max(1, Math.ceil(sortedCountries.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)

  const paginatedCountries = useMemo(
    () => paginateCountries(sortedCountries, safePage, pageSize),
    [sortedCountries, safePage, pageSize],
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
        Look-Through Exposure by Country
      </h2>
      {countries.length === 0 ? (
        <p className="text-roman-stone">No geography data available.</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by country…"
              className={`${inputClass} w-full max-w-sm`}
            />
            <div className="flex items-center gap-2 text-sm text-roman-stone">
              <label htmlFor="geography-page-size">Rows per page</label>
              <select
                id="geography-page-size"
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
          {sortedCountries.length === 0 ? (
            <p className="text-roman-stone">No countries match your search.</p>
          ) : (
            <div className="w-full max-h-[32rem] overflow-x-auto overflow-y-auto">
              <table className="w-full border-collapse text-sm text-roman-stone">
                <thead>
                  <tr className="border-b border-roman-stone/20 text-left">
                    <th className={thSortable} onClick={() => handleSort('country_code')}>
                      Country{sortIndicator('country_code')}
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
                  {paginatedCountries.map((country) => {
                    const key = countryKey(country)
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
                            {countryLabel(country.country_code)}
                          </td>
                          <td className="py-3 pr-4 tabular-nums">
                            {country.total_weight_percentage.toFixed(2)}%
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-roman-stone/5">
                            <td colSpan={2} className="px-6 py-4">
                              {country.contributions.length === 0 ? (
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
                                    {country.contributions.map((c: BucketEtfContribution) => (
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
          {sortedCountries.length > 0 && (
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
