'use client'

import { useMemo } from 'react'
import type { HoldingExposureResponse, RiskAlert } from './PortfolioPageClient'
import { concentratedStockKeys } from '../utils/concentrationAlerts'

const THRESHOLD_MARKER_PCT = 10
const MAX_BARS = 15

function topHoldings(holdings: HoldingExposureResponse[]): HoldingExposureResponse[] {
  /**
   * Selects the top MAX_BARS holdings by total_weight_percentage.
   *
   * Sorts defensively rather than assuming `holdings` is already
   * sorted DESC by the caller (even though the backend returns it
   * that way). Does not mutate the input array.
   *
   * Args:
   *   holdings: Full look-through exposure list.
   *
   * Returns:
   *   Up to MAX_BARS holdings, sorted by total_weight_percentage DESC.
   */
  return [...holdings]
    .sort((a, b) => b.total_weight_percentage - a.total_weight_percentage)
    .slice(0, MAX_BARS)
}

function scaleMax(values: number[]): number {
  /**
   * Computes the chart's x-axis maximum.
   *
   * Rounds up to the nearest multiple of 5, and never goes below the
   * threshold marker itself, so the 10% marker always falls within
   * the visible axis even when every bar is small.
   *
   * Args:
   *   values: total_weight_percentage of the holdings being charted.
   *
   * Returns:
   *   The axis maximum, in percentage points.
   */
  const max = Math.max(THRESHOLD_MARKER_PCT, ...values)
  return Math.ceil(max / 5) * 5
}

export function HoldingsBarChart({
  holdings,
  alerts,
}: {
  holdings: HoldingExposureResponse[]
  alerts: RiskAlert[]
}): JSX.Element {
  /**
   * Renders the top 10-15 holdings by total_weight_percentage as plain
   * horizontal HTML/CSS bars (no charting library), with a vertical
   * marker at the 10% threshold. Bars whose key is flagged by a
   * concentration_risk alert render in the existing roman-terracotta
   * warning colour instead of roman-gold — the backend's RiskAlert list
   * is now the single source of truth for the 10% limit, not a locally
   * duplicated comparison. THRESHOLD_MARKER_PCT only decides where the
   * dashed reference line is drawn; it no longer drives any coloring
   * decision.
   *
   * Args:
   *   holdings: Full look-through exposure list from
   *             GET /portfolio/holdings/exposure, passed by
   *             PortfolioPageClient.
   *   alerts: Full alert list from the same response.
   *
   * Returns:
   *   JSX bar chart, or an empty-state message when holdings is empty.
   */
  const bars = topHoldings(holdings)
  const concentratedKeys = useMemo(() => concentratedStockKeys(alerts), [alerts])

  if (bars.length === 0) {
    return (
      <div className="mb-6 rounded-2xl border border-roman-stone/10 bg-white/5 dark:bg-roman-obsidian/50 p-6 backdrop-blur-sm">
        <p className="text-roman-stone">No holdings data available.</p>
      </div>
    )
  }

  const axisMax = scaleMax(bars.map((h) => h.total_weight_percentage))
  const thresholdLeft = `${(THRESHOLD_MARKER_PCT / axisMax) * 100}%`

  return (
    <div className="mb-6 rounded-2xl border border-roman-stone/10 bg-white/5 dark:bg-roman-obsidian/50 p-6 backdrop-blur-sm">
      <h2 className="mb-6 font-roman text-xl font-bold text-roman-gold">
        Top Holdings by Look-Through Exposure
      </h2>
      <div className="grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-x-4 gap-y-3">
        {bars.map((h) => {
          const isWarning = concentratedKeys.has(h.stock_isin ?? h.stock_ticker ?? h.stock_name)
          const barLeft = `${(h.total_weight_percentage / axisMax) * 100}%`
          return (
            <div
              key={h.stock_isin ?? h.stock_ticker ?? h.stock_name}
              className="contents"
            >
              <span className="truncate text-sm text-roman-stone">
                {h.stock_ticker ?? h.stock_isin ?? h.stock_name}
              </span>
              <div className="relative h-4 rounded bg-roman-stone/10">
                <div
                  className={`absolute inset-y-0 left-0 rounded ${
                    isWarning ? 'bg-roman-terracotta' : 'bg-roman-gold'
                  }`}
                  style={{ width: barLeft }}
                />
                <div
                  className="absolute inset-y-0 border-l border-dashed border-roman-terracotta/60"
                  style={{ left: thresholdLeft }}
                />
              </div>
              <span
                className={`text-sm tabular-nums ${
                  isWarning ? 'text-roman-terracotta' : 'text-roman-stone'
                }`}
              >
                {h.total_weight_percentage.toFixed(2)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
