import type { RiskAlert } from '../components/PortfolioPageClient'

/**
 * Builds the set of holding identity keys currently flagged by a
 * concentration_risk alert.
 *
 * @param alerts - Full alert list from GET /portfolio/holdings/exposure.
 * @returns A Set of `stock_isin ?? stock_ticker ?? stock_name` keys, matching
 *          the same key convention already used for holdings elsewhere on
 *          this page (ConcentrationAlertBadge's `label`, HoldingsBarChart's/
 *          HoldingsTreemap's `key` props, HoldingsExposureTable's `holdingKey`).
 */
export function concentratedStockKeys(alerts: RiskAlert[]): Set<string> {
  return new Set(
    alerts
      .filter((a) => a.rule === 'concentration_risk')
      .map((a) => a.stock_isin ?? a.stock_ticker ?? a.stock_name ?? '')
      .filter((key) => key !== ''),
  )
}
