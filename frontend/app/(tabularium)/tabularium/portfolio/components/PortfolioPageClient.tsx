'use client'

import { PortfolioOverviewTable } from './PortfolioOverviewTable'
import { ConcentrationAlertBadge } from './ConcentrationAlertBadge'
import { HoldingsBarChart } from './HoldingsBarChart'

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

export interface HoldingsExposureResponse {
  holdings: HoldingExposureResponse[]
  skipped_etfs: string[]
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
      {exposureData.skipped_etfs.length > 0 && (
        <p className="mb-4 text-sm text-roman-stone">
          Excluded from concentration analysis (no price data):{' '}
          {exposureData.skipped_etfs.join(', ')}
        </p>
      )}
      <ConcentrationAlertBadge holdings={exposureData.holdings} />
      <HoldingsBarChart holdings={exposureData.holdings} />
      <PortfolioOverviewTable rows={overviewData.rows} />
    </div>
  )
}
