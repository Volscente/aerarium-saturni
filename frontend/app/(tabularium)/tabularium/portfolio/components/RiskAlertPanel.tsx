'use client'

import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import type { RiskAlert } from './PortfolioPageClient'

function summarizeAlerts(alerts: RiskAlert[]): string {
  /**
   * Builds the collapsed-state one-line summary.
   *
   * Args:
   *   alerts: Full alert list from GET /portfolio/holdings/exposure.
   *
   * Returns:
   *   A short count summary, e.g. "2 alerts: 1 concentration, 1 stale holding".
   */
  const concentrationCount = alerts.filter((a) => a.rule === 'concentration_risk').length
  const freshnessCount = alerts.filter((a) => a.rule === 'data_freshness_risk').length
  const parts: string[] = []
  if (concentrationCount > 0) parts.push(`${concentrationCount} concentration`)
  if (freshnessCount > 0) {
    parts.push(`${freshnessCount} stale holding${freshnessCount === 1 ? '' : 's'}`)
  }
  return `${alerts.length} alert${alerts.length === 1 ? '' : 's'}: ${parts.join(', ')}`
}

export function RiskAlertPanel({ alerts }: { alerts: RiskAlert[] }): JSX.Element | null {
  /**
   * Collapsible risk-alert badge/banner.
   *
   * Renders nothing when alerts is empty. Collapsed state (the "badge")
   * shows a one-line count summary; expanded state (the "banner") lists
   * every alert.message. Defaults to expanded — an active warning should
   * not require an extra click to see, mirroring why ConcentrationAlertBadge
   * itself defaults open. Uses the same ▸/▾ clickable-header pattern already
   * shipped for ConcentrationAlertBadge/HoldingsTreemap, and the same
   * roman-terracotta warning color / TriangleAlert icon already used by
   * ConcentrationAlertBadge.
   *
   * Args:
   *   alerts: Full alert list from GET /portfolio/holdings/exposure.
   *
   * Returns:
   *   JSX panel, or null when alerts is empty.
   */
  const [isOpen, setIsOpen] = useState(alerts.length > 0)

  if (alerts.length === 0) return null

  return (
    <div className="mb-6 rounded-2xl border border-roman-terracotta/30 bg-roman-terracotta/5 p-6 backdrop-blur-sm">
      <h2
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex cursor-pointer select-none items-center gap-2 font-roman text-xl font-bold text-roman-terracotta"
      >
        <span className="text-roman-terracotta/60">{isOpen ? '▾' : '▸'}</span>
        <TriangleAlert className="h-5 w-5 shrink-0" />
        {isOpen ? 'Risk Alerts' : summarizeAlerts(alerts)}
      </h2>
      {isOpen && (
        <ul className="mt-4 flex flex-col gap-2">
          {alerts.map((alert, i) => (
            <li key={i} className="text-sm text-roman-terracotta">
              {alert.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
