'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Building2 } from 'lucide-react'
import type { PortfolioRowResponse } from './PortfolioPageClient'
import { brokerLogoPath } from '../utils/brokerLogo'
import { perfClass } from '../utils/perfClass'

type SortColumn = keyof PortfolioRowResponse

const currencyFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
})

function rowKey(row: PortfolioRowResponse): string {
  return `${row.owner}::${row.broker_platform}`
}

function computeTotals(rows: PortfolioRowResponse[]): {
  total_invested: number
  current_value: number | null
  performance_abs: number | null
  performance_pct: number | null
} {
  /**
   * Aggregates selected rows into a Total footer object.
   *
   * current_value and performance_abs are null if any row in the
   * selection has a null value — avoids a misleadingly partial total.
   *
   * performance_pct uses a weighted return:
   *   Σ(performance_abs of non-null rows) / Σ(total_invested of non-null rows) * 100
   * Rows with null performance_abs are excluded from both numerator and
   * denominator so partial price coverage does not distort the result.
   *
   * Args:
   *   rows: The currently selected PortfolioRowResponse rows.
   *
   * Returns:
   *   Aggregated totals for the tfoot row.
   */
  const total_invested = rows.reduce((sum, r) => sum + r.total_invested, 0)

  const anyNullValue = rows.some((r) => r.current_value === null)
  const current_value = anyNullValue
    ? null
    : rows.reduce((sum, r) => sum + (r.current_value ?? 0), 0)

  const anyNullPerf = rows.some((r) => r.performance_abs === null)
  const performance_abs = anyNullPerf
    ? null
    : rows.reduce((sum, r) => sum + (r.performance_abs ?? 0), 0)

  const nonNullRows = rows.filter((r) => r.performance_abs !== null)
  const nonNullInvested = nonNullRows.reduce((sum, r) => sum + r.total_invested, 0)
  const performance_pct =
    nonNullRows.length === 0 || nonNullInvested === 0
      ? null
      : (nonNullRows.reduce((sum, r) => sum + (r.performance_abs ?? 0), 0) /
          nonNullInvested) *
        100

  return { total_invested, current_value, performance_abs, performance_pct }
}

function sortRows(
  rows: PortfolioRowResponse[],
  column: SortColumn | null,
  direction: 'asc' | 'desc',
): PortfolioRowResponse[] {
  /**
   * Sorts rows by the given column in the given direction.
   *
   * Null values always sort last, in both ascending and descending order.
   * When column is null the original array order is preserved.
   * Returns a new array — does not mutate the input.
   *
   * Args:
   *   rows: Rows to sort.
   *   column: Column key to sort by, or null for no sort.
   *   direction: Sort direction.
   *
   * Returns:
   *   New sorted array.
   */
  if (!column) return rows
  return [...rows].sort((a, b) => {
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

function formatPct(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

function BrokerLogo({ platform }: { platform: string }): JSX.Element {
  const [imgError, setImgError] = useState(false)
  const path = brokerLogoPath(platform)
  if (!path || imgError) {
    return <Building2 className="h-6 w-6 text-roman-stone" />
  }
  return (
    <Image
      src={path}
      alt={platform}
      width={24}
      height={24}
      className="h-6 w-6 object-contain"
      onError={() => setImgError(true)}
    />
  )
}

export function PortfolioOverviewTable({
  rows,
}: {
  rows: PortfolioRowResponse[]
}): JSX.Element {
  /**
   * Interactive portfolio overview table.
   *
   * Owns selection state (Set of row keys), sort state, and all
   * derived computations (selectedRows, selectedTotal, totals footer).
   * All interaction is client-side — no server round-trips on checkbox
   * or sort changes.
   *
   * Args:
   *   rows: PortfolioRowResponse array from GET /portfolio/overview,
   *         passed by PortfolioPageClient.
   *
   * Returns:
   *   JSX table with thead/tbody/tfoot and overflow-x-auto wrapper.
   */
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(rows.map(rowKey)),
  )
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const masterCheckRef = useRef<HTMLInputElement>(null)

  const allSelected = rows.length > 0 && selected.size === rows.length
  const someSelected = selected.size > 0 && selected.size < rows.length

  useEffect(() => {
    if (masterCheckRef.current) {
      masterCheckRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(col)
      setSortDirection('asc')
    }
  }

  const sortedRows = useMemo(
    () => sortRows(rows, sortColumn, sortDirection),
    [rows, sortColumn, sortDirection],
  )

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(rowKey(r))),
    [rows, selected],
  )

  const selectedTotal = useMemo(
    () => selectedRows.reduce((sum, r) => sum + r.total_invested, 0),
    [selectedRows],
  )

  const totals = useMemo(() => computeTotals(selectedRows), [selectedRows])

  const toggleRow = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(rows.map(rowKey)))
  }

  const thBase = 'py-3 pr-4 font-medium text-roman-gold text-left'
  const thSortable = `${thBase} cursor-pointer select-none hover:text-roman-parchment transition-colors`

  const sortIndicator = (col: SortColumn) => {
    if (sortColumn !== col) return ' ↕'
    return sortDirection === 'asc' ? ' ↑' : ' ↓'
  }

  if (rows.length === 0) {
    return <p className="text-roman-stone">No portfolio data available.</p>
  }

  return (
    <div className="rounded-2xl border border-roman-stone/10 bg-white/5 dark:bg-roman-obsidian/50 p-6 backdrop-blur-sm">
      <h1 className="mb-6 font-roman text-3xl font-bold text-roman-gold">
        Portfolio Overview
      </h1>
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse text-sm text-roman-stone">
          <thead>
            <tr className="border-b border-roman-stone/20 text-left">
              <th className="py-3 pr-4">
                <input
                  ref={masterCheckRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="cursor-pointer accent-roman-gold"
                />
              </th>
              <th className={thSortable} onClick={() => handleSort('owner')}>
                Owner{sortIndicator('owner')}
              </th>
              <th className={thBase}>Broker</th>
              <th
                className={thSortable}
                onClick={() => handleSort('total_invested')}
              >
                Invested{sortIndicator('total_invested')}
              </th>
              <th
                className={thSortable}
                onClick={() => handleSort('current_value')}
              >
                Value{sortIndicator('current_value')}
              </th>
              <th
                className={thSortable}
                onClick={() => handleSort('performance_pct')}
              >
                Performance{sortIndicator('performance_pct')}
              </th>
              <th className={thBase}>Share</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const key = rowKey(row)
              const isSelected = selected.has(key)
              const share =
                isSelected && selectedTotal > 0
                  ? ((row.total_invested / selectedTotal) * 100).toFixed(2) + '%'
                  : '—'
              return (
                <tr
                  key={key}
                  className="border-b border-roman-stone/10 hover:bg-roman-stone/5 transition-colors rounded-lg"
                >
                  <td className="py-3 pr-4">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRow(key)}
                      className="cursor-pointer accent-roman-gold"
                    />
                  </td>
                  <td className="py-3 pr-4">{row.owner}</td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <BrokerLogo platform={row.broker_platform} />
                      <span className="uppercase">{row.broker_platform}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 tabular-nums">
                    {currencyFormatter.format(row.total_invested)}
                  </td>
                  <td className="py-3 pr-4 tabular-nums">
                    {row.current_value !== null
                      ? currencyFormatter.format(row.current_value)
                      : '—'}
                  </td>
                  <td
                    className={`py-3 pr-4 tabular-nums ${perfClass(row.performance_pct)}`}
                  >
                    {row.performance_abs !== null &&
                    row.performance_pct !== null ? (
                      <>
                        {(row.performance_abs >= 0 ? '+' : '') +
                          currencyFormatter.format(row.performance_abs)}{' '}
                        / {formatPct(row.performance_pct)}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-3 tabular-nums">{share}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-roman-stone/20 font-medium text-roman-parchment">
              <td className="py-3 pr-4" />
              <td className="py-3 pr-4" colSpan={2}>
                Total
              </td>
              <td className="py-3 pr-4 tabular-nums">
                {currencyFormatter.format(totals.total_invested)}
              </td>
              <td className="py-3 pr-4 tabular-nums">
                {totals.current_value !== null
                  ? currencyFormatter.format(totals.current_value)
                  : '—'}
              </td>
              <td
                className={`py-3 pr-4 tabular-nums ${perfClass(totals.performance_pct)}`}
              >
                {totals.performance_abs !== null &&
                totals.performance_pct !== null ? (
                  <>
                    {(totals.performance_abs >= 0 ? '+' : '') +
                      currencyFormatter.format(totals.performance_abs)}{' '}
                    / {formatPct(totals.performance_pct)}
                  </>
                ) : (
                  '—'
                )}
              </td>
              <td className="py-3 tabular-nums">100%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
