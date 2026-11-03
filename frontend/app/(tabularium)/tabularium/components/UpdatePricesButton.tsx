'use client'

import { ChevronDown, RefreshCw } from 'lucide-react'
import { useState, useTransition } from 'react'
import { refreshEtfPrices } from '../etf-actions'
import type { EtfPriceRefreshResult } from '../etf-actions'
import type { EtfResponse } from './EtfForm'

export interface UpdatePricesButtonProps {
  etfs: Pick<EtfResponse, 'id' | 'ticker' | 'name'>[]
  onUpdated?: () => void
}

export function UpdatePricesButton({ etfs, onUpdated }: UpdatePricesButtonProps): JSX.Element {
  /**
   * Registry-level control that fetches prices for all or selected ETFs.
   *
   * Renders an "Update prices" button labelled with the current selection and
   * a disclosure listing every ETF as a checkbox. The selection is stored as the
   * set of *excluded* ids and derived as `etfs` minus that set, so "all ETFs" is
   * the default, an ETF added after a revalidation is selected automatically, and
   * a deleted ETF simply drops out. The button is disabled while an update is
   * pending or nothing is selected (the backend would otherwise read an empty
   * selection as "all ETFs"). On completion it renders a per-ETF summary — ticker,
   * "Updated · N rows" or "Failed · <error>" — plus one hint line when any ETF
   * failed, since a missing or wrong price symbol is the usual cause. The result
   * state survives the revalidateTag refresh because the component stays mounted.
   *
   * Args:
   *   etfs: The registry's ETFs (id, ticker, name), passed from the Server Component.
   *   onUpdated: Optional callback invoked after an update returns results (even if
   *              some ETFs failed), so siblings holding cached prices can reload.
   *
   * Returns:
   *   JSX containing the trigger button, the selection disclosure and the results.
   */
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [isSelectionOpen, setIsSelectionOpen] = useState(false)
  const [results, setResults] = useState<EtfPriceRefreshResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const selectedIds = etfs.filter((etf) => !excluded.has(etf.id)).map((etf) => etf.id)
  const selectionLabel =
    selectedIds.length === etfs.length
      ? 'All ETFs'
      : `${selectedIds.length} of ${etfs.length}`

  const toggleEtf = (id: string) => {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setExcluded(
      selectedIds.length === etfs.length ? new Set(etfs.map((etf) => etf.id)) : new Set()
    )
  }

  const handleUpdate = () => {
    setError(null)
    setResults(null)
    startTransition(async () => {
      const response = await refreshEtfPrices(selectedIds)
      if ('error' in response) setError(response.error)
      else {
        setResults(response.results)
        onUpdated?.()
      }
    })
  }

  const updatedCount = results?.filter((r) => r.status === 'updated').length ?? 0
  const failedCount = results ? results.length - updatedCount : 0

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleUpdate}
          disabled={isPending || selectedIds.length === 0}
          className="flex items-center gap-2 rounded-full border border-roman-gold/40 bg-roman-gold/10 px-5 py-2 text-sm font-medium text-roman-gold hover:bg-roman-gold/20 hover:border-roman-gold/70 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
          {isPending ? 'Updating…' : `Update prices · ${selectionLabel}`}
        </button>
        <button
          onClick={() => setIsSelectionOpen((open) => !open)}
          aria-expanded={isSelectionOpen}
          className="flex items-center gap-1 rounded border border-roman-stone/30 px-2 py-1 text-xs text-roman-stone hover:border-roman-gold/50 hover:text-roman-gold transition-colors"
        >
          Select ETFs
          <ChevronDown
            className={`h-3 w-3 transition-transform ${isSelectionOpen ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {isSelectionOpen && (
        <div className="mt-3 flex flex-col gap-1 rounded border border-roman-stone/30 p-3 text-sm text-roman-stone">
          <label className="flex items-center gap-2 border-b border-roman-stone/20 pb-2 font-medium">
            <input
              type="checkbox"
              checked={selectedIds.length === etfs.length}
              onChange={toggleAll}
            />
            Select all
          </label>
          {etfs.map((etf) => (
            <label key={etf.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!excluded.has(etf.id)}
                onChange={() => toggleEtf(etf.id)}
              />
              <span className="font-mono font-medium">{etf.ticker}</span>
              <span className="truncate text-roman-stone/70" title={etf.name}>
                {etf.name}
              </span>
            </label>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {error}
        </p>
      )}

      {results && (
        <div className="mt-3 rounded border border-roman-stone/30 p-3 text-sm text-roman-stone">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-medium">
              {updatedCount} updated, {failedCount} failed
            </span>
            <button
              onClick={() => setResults(null)}
              aria-label="Dismiss results"
              className="text-xs text-roman-stone/60 hover:text-roman-gold transition-colors"
            >
              ✕
            </button>
          </div>
          <ul className="flex flex-col gap-1">
            {results.map((result) => (
              <li key={result.etf_id} className="flex flex-wrap gap-2">
                <span className="font-mono font-medium">{result.ticker}</span>
                {result.status === 'updated' ? (
                  <span>Updated · {result.rows_written} rows</span>
                ) : (
                  <span className="text-roman-terracotta">
                    Failed · {result.error}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {failedCount > 0 && (
            <p className="mt-2 text-xs text-roman-stone/70">
              Failed updates usually mean the ETF&apos;s price symbol is missing or wrong —
              set it with Edit (e.g. VWCE.DE).
            </p>
          )}
        </div>
      )}
    </div>
  )
}
