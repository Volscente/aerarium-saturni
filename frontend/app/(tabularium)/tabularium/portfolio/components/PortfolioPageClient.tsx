'use client'

import { PortfolioOverviewTable } from './PortfolioOverviewTable'

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

export function PortfolioPageClient({
  overviewData,
}: {
  overviewData: PortfolioOverviewResponse
}): JSX.Element {
  return (
    <div className="px-6 py-8">
      <PortfolioOverviewTable rows={overviewData.rows} />
    </div>
  )
}
