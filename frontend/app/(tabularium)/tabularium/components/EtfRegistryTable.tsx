'use client'

import { useState, useTransition } from 'react'
import { deleteEtf } from '../etf-actions'
import { EtfDrawer } from './EtfDrawer'
import { PriceUpdateButton } from './PriceUpdateButton'
import { HoldingsUpload } from './HoldingsUpload'
import type { EtfResponse } from './EtfForm'

const ASSET_CLASS_OPTIONS = [
  'Equities',
  'Bonds',
  'Commodities',
  'Real Estate',
  'Mixed Assets',
]

export interface EtfRegistryTableProps {
  etfs: EtfResponse[]
}

export function EtfRegistryTable({ etfs }: EtfRegistryTableProps): JSX.Element {
  /**
   * Client-side filterable ETF registry table with per-row CRUD actions.
   *
   * Owns filter state (ticker prefix, asset class exact, issuer prefix) and
   * edit-drawer state (editingEtf). Applies all filters client-side on the
   * etfs prop so no additional fetches are triggered. Per-row actions: Edit
   * (opens EtfDrawer in edit mode), Delete (confirms then calls deleteEtf
   * Server Action), PriceUpdateButton, HoldingsUpload.
   *
   * Args:
   *   etfs: Full ETF list passed from the Server Component; not re-fetched here.
   *
   * Returns:
   *   JSX containing the filter bar, ETF table rows, and edit drawer.
   */
  const [tickerFilter, setTickerFilter] = useState('')
  const [assetClassFilter, setAssetClassFilter] = useState('')
  const [issuerFilter, setIssuerFilter] = useState('')
  const [editingEtf, setEditingEtf] = useState<EtfResponse | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = etfs.filter((etf) => {
    const tickerMatch =
      !tickerFilter ||
      etf.ticker.toLowerCase().startsWith(tickerFilter.toLowerCase())
    const assetClassMatch =
      !assetClassFilter || etf.asset_class === assetClassFilter
    const issuerMatch =
      !issuerFilter ||
      etf.issuer.toLowerCase().includes(issuerFilter.toLowerCase())
    return tickerMatch && assetClassMatch && issuerMatch
  })

  const handleDelete = (etf: EtfResponse) => {
    if (
      !window.confirm(
        `Delete ${etf.ticker} (${etf.name})? This also removes all holdings and price history.`
      )
    ) {
      return
    }
    setDeleteError(null)
    startTransition(async () => {
      const result = await deleteEtf(etf.id)
      if ('error' in result) setDeleteError(result.error)
    })
  }

  const inputClass =
    'rounded border border-roman-stone/40 bg-transparent px-3 py-1.5 text-sm text-roman-stone placeholder:text-roman-stone/50 focus:border-roman-gold focus:outline-none transition-colors dark:text-roman-parchment'

  const selectClass =
    'rounded border border-roman-stone/40 bg-roman-parchment px-3 py-1.5 text-sm text-roman-stone focus:border-roman-gold focus:outline-none transition-colors dark:bg-roman-obsidian dark:text-roman-parchment'

  return (
    <>
      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          value={tickerFilter}
          onChange={(e) => setTickerFilter(e.target.value.toUpperCase())}
          placeholder="Filter by ticker…"
          className={inputClass}
        />
        <select
          value={assetClassFilter}
          onChange={(e) => setAssetClassFilter(e.target.value)}
          className={selectClass}
        >
          <option value="">All asset classes</option>
          {ASSET_CLASS_OPTIONS.map((ac) => (
            <option key={ac} value={ac}>
              {ac}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={issuerFilter}
          onChange={(e) => setIssuerFilter(e.target.value)}
          placeholder="Filter by issuer…"
          className={inputClass}
        />
      </div>

      {deleteError && (
        <p className="mb-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {deleteError}
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="text-roman-stone">No ETFs match the current filters.</p>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-sm text-roman-stone">
            <thead>
              <tr className="border-b border-roman-stone/30 text-left">
                <th className="py-3 pr-4 font-medium text-roman-gold">Ticker</th>
                <th className="py-3 pr-4 font-medium text-roman-gold">ISIN</th>
                <th className="py-3 pr-4 font-medium text-roman-gold">Name</th>
                <th className="py-3 pr-4 font-medium text-roman-gold">Issuer</th>
                <th className="py-3 pr-4 font-medium text-roman-gold">Asset Class</th>
                <th className="py-3 pr-4 font-medium text-roman-gold">TER</th>
                <th className="py-3 pr-4 font-medium text-roman-gold">Domicile</th>
                <th className="py-3 font-medium text-roman-gold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((etf) => (
                <tr
                  key={etf.id}
                  className="border-b border-roman-stone/20 hover:bg-roman-stone/5 transition-colors"
                >
                  <td className="py-3 pr-4 font-mono font-medium">{etf.ticker}</td>
                  <td className="py-3 pr-4 font-mono">{etf.isin}</td>
                  <td className="py-3 pr-4 max-w-[200px] truncate" title={etf.name}>
                    {etf.name}
                  </td>
                  <td className="py-3 pr-4">{etf.issuer}</td>
                  <td className="py-3 pr-4">{etf.asset_class}</td>
                  <td className="py-3 pr-4 tabular-nums">
                    {(parseFloat(etf.ter) * 100).toFixed(2)}%
                  </td>
                  <td className="py-3 pr-4">{etf.domicile}</td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2 items-start">
                      <button
                        onClick={() => setEditingEtf(etf)}
                        className="rounded border border-roman-stone/30 px-2 py-1 text-xs text-roman-stone hover:border-roman-gold/50 hover:text-roman-gold transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(etf)}
                        disabled={isPending}
                        className="rounded border border-roman-stone/30 px-2 py-1 text-xs text-roman-stone hover:border-roman-terracotta hover:text-roman-terracotta transition-colors disabled:opacity-50"
                      >
                        Delete
                      </button>
                      <PriceUpdateButton etfId={etf.id} />
                      <HoldingsUpload etfId={etf.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit drawer — key forces remount when editing a different ETF */}
      <EtfDrawer
        key={editingEtf?.id ?? 'none'}
        isOpen={!!editingEtf}
        onClose={() => setEditingEtf(null)}
        etf={editingEtf}
      />
    </>
  )
}
