'use client'

import { PortfolioOverviewTable } from './PortfolioOverviewTable'
import { RiskAlertPanel } from './RiskAlertPanel'
import { ConcentrationAlertBadge } from './ConcentrationAlertBadge'
import { HoldingsBarChart } from './HoldingsBarChart'
import { HoldingsTreemap } from './HoldingsTreemap'
import { HoldingsExposureTable } from './HoldingsExposureTable'

export interface PortfolioRowResponse {
  owner: string
  broker_platform: string
  total_invested: number
  current_value: number | null
  performance_abs: number | null
  performance_pct: number | null
}

export interface PortfolioOverviewResponse {
  rows: PortfolioRowResponse[]
}

export interface HoldingContribution {
  etf_ticker: string
  etf_name: string
  etf_portfolio_weight_percentage: number
  stock_weight_in_etf_percentage: number
  contribution_weight_percentage: number
  snapshot_date: string
}

export interface HoldingExposureResponse {
  stock_isin: string | null
  stock_ticker: string | null
  stock_name: string
  total_weight_percentage: number
  contributions: HoldingContribution[]
}

export interface RiskAlert {
  rule: 'concentration_risk' | 'data_freshness_risk'
  message: string
  stock_isin: string | null
  stock_ticker: string | null
  stock_name: string | null
  total_weight_percentage: number | null
  etf_ticker: string | null
  etf_name: string | null
  snapshot_date: string | null
  days_stale: number | null
}

export interface HoldingsExposureResponse {
  holdings: HoldingExposureResponse[]
  skipped_etfs: string[]
  alerts: RiskAlert[]
}

export function PortfolioPageClient({
  overviewData,
  exposureData,
}: {
  overviewData: PortfolioOverviewResponse
  exposureData: HoldingsExposureResponse
}): JSX.Element {
  return (
    <div className="px-6 py-8">
      <PortfolioOverviewTable rows={overviewData.rows} />
      {exposureData.skipped_etfs.length > 0 && (
        <p className="mb-4 text-sm text-roman-stone">
          Excluded from concentration analysis (no price data):{' '}
          {exposureData.skipped_etfs.join(', ')}
        </p>
      )}
      <RiskAlertPanel alerts={exposureData.alerts} />
      <ConcentrationAlertBadge holdings={exposureData.holdings} alerts={exposureData.alerts} />
      <HoldingsBarChart holdings={exposureData.holdings} alerts={exposureData.alerts} />
      <HoldingsTreemap holdings={exposureData.holdings} alerts={exposureData.alerts} />
      <HoldingsExposureTable holdings={exposureData.holdings} />
    </div>
  )
}
