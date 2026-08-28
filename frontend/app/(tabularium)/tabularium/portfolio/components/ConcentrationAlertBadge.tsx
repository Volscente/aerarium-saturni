'use client'

import { TriangleAlert } from 'lucide-react'
import type { HoldingExposureResponse } from './PortfolioPageClient'

const WARNING_THRESHOLD_PCT = 10

function maxExposure(
  holdings: HoldingExposureResponse[],
): HoldingExposureResponse | null {
  /**
   * Finds the holding with the highest total_weight_percentage.
   *
   * Reduces defensively rather than assuming `holdings` is already
   * sorted DESC by the caller (even though the backend returns it
   * that way).
   *
   * Args:
   *   holdings: Full look-through exposure list.
   *
   * Returns:
   *   The holding with the maximum total_weight_percentage, or null
   *   when holdings is empty.
   */
  if (holdings.length === 0) return null
  return holdings.reduce((max, h) =>
    h.total_weight_percentage > max.total_weight_percentage ? h : max,
  )
}

export function ConcentrationAlertBadge({
  holdings,
}: {
  holdings: HoldingExposureResponse[]
}): JSX.Element | null {
  /**
   * Renders the single largest look-through exposure across all holdings.
   *
   * Always mounted at the top of the Portfolio page body so the user's
   * top concentration risk is visible with no interaction required.
   * Applies warning styling when the top exposure is strictly greater
   * than 10% — a stock sitting exactly at the 10% line is at the limit,
   * not yet over it.
   *
   * Args:
   *   holdings: Full look-through exposure list from
   *             GET /portfolio/holdings/exposure, passed by
   *             PortfolioPageClient.
   *
   * Returns:
   *   JSX badge, or null when holdings is empty.
   */
  const top = maxExposure(holdings)
  if (!top) return null

  const isWarning = top.total_weight_percentage > WARNING_THRESHOLD_PCT
  const accentClass = isWarning ? 'text-roman-terracotta' : 'text-roman-gold'
  const label = top.stock_ticker ?? top.stock_isin ?? top.stock_name

  return (
    <div className="mb-6 flex items-center gap-4 rounded-2xl border border-roman-stone/10 bg-white/5 dark:bg-roman-obsidian/50 p-6 backdrop-blur-sm">
      {isWarning && (
        <TriangleAlert className="h-8 w-8 shrink-0 text-roman-terracotta" />
      )}
      <div>
        <p className="text-sm text-roman-stone">Largest single-stock exposure</p>
        <p className={`text-2xl font-bold ${accentClass}`}>
          {label} — {top.total_weight_percentage.toFixed(2)}%
        </p>
        <p className="text-sm text-roman-stone">{top.stock_name}</p>
      </div>
    </div>
  )
}
