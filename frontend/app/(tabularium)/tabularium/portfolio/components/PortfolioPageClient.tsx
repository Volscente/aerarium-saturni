'use client'

import { useState } from 'react'
import { PortfolioOverviewTable } from './PortfolioOverviewTable'
import { RiskAlertPanel } from './RiskAlertPanel'
import { ConcentrationAlertBadge } from './ConcentrationAlertBadge'
import { HoldingsBarChart } from './HoldingsBarChart'
import { HoldingsTreemap } from './HoldingsTreemap'
import { HoldingsExposureTable } from './HoldingsExposureTable'
import { GeographyBarChart } from './GeographyBarChart'
import { GeographyExposureTable } from './GeographyExposureTable'
import { SectorBarChart } from './SectorBarChart'
import { SectorExposureTable } from './SectorExposureTable'

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

export interface BucketEtfContribution {
  etf_ticker: string
  etf_name: string
  etf_portfolio_weight_percentage: number
  bucket_weight_in_etf_percentage: number
  contribution_weight_percentage: number
  snapshot_date: string
}

export interface CountryExposureResponse {
  country_code: string | null
  total_weight_percentage: number
  contributions: BucketEtfContribution[]
}

export interface HoldingsGeographyResponse {
  countries: CountryExposureResponse[]
  skipped_etfs: string[]
}

export interface SectorExposureResponse {
  sector: string | null
  total_weight_percentage: number
  contributions: BucketEtfContribution[]
}

export interface HoldingsSectorsResponse {
  sectors: SectorExposureResponse[]
  skipped_etfs: string[]
}

type PortfolioTab = 'overview' | 'holdings' | 'geography' | 'sectors'

const TABS: { id: PortfolioTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'holdings', label: 'Holdings' },
  { id: 'geography', label: 'Geography' },
  { id: 'sectors', label: 'Sectors' },
]

export function PortfolioPageClient({
  overviewData,
  exposureData,
  geographyData,
  sectorsData,
}: {
  overviewData: PortfolioOverviewResponse
  exposureData: HoldingsExposureResponse
  geographyData: HoldingsGeographyResponse
  sectorsData: HoldingsSectorsResponse
}): JSX.Element {
  /**
   * Renders the Portfolio dashboard as a tabbed interface: Overview,
   * Holdings, Geography, and Sectors.
   *
   * Tab content is conditionally rendered rather than hidden via CSS, so
   * components for inactive tabs (the D3 treemap, the bar chart, the
   * expandable exposure table) are not mounted until their tab is
   * activated. overviewData, exposureData, geographyData, and sectorsData
   * are already fully fetched by the parent server component, so switching
   * tabs never re-fetches or loses data context.
   */
  const [activeTab, setActiveTab] = useState<PortfolioTab>('overview')

  return (
    <div className="px-6 py-8">
      <nav className="mb-6 flex gap-2 border-b border-roman-stone/10">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2 text-sm font-medium transition-all ${
              activeTab === id
                ? 'border-b-2 border-roman-terracotta text-roman-terracotta'
                : 'text-roman-stone hover:text-roman-gold'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' && (
        <>
          <PortfolioOverviewTable rows={overviewData.rows} />
          <ConcentrationAlertBadge holdings={exposureData.holdings} alerts={exposureData.alerts} />
        </>
      )}

      {activeTab === 'holdings' && (
        <>
          {exposureData.skipped_etfs.length > 0 && (
            <p className="mb-4 text-sm text-roman-stone">
              Excluded from concentration analysis (no price data):{' '}
              {exposureData.skipped_etfs.join(', ')}
            </p>
          )}
          <RiskAlertPanel alerts={exposureData.alerts} />
          <HoldingsBarChart holdings={exposureData.holdings} alerts={exposureData.alerts} />
          <HoldingsTreemap holdings={exposureData.holdings} alerts={exposureData.alerts} />
          <HoldingsExposureTable holdings={exposureData.holdings} />
        </>
      )}

      {activeTab === 'geography' && (
        <>
          {geographyData.skipped_etfs.length > 0 && (
            <p className="mb-4 text-sm text-roman-stone">
              Excluded from geography analysis (no price data):{' '}
              {geographyData.skipped_etfs.join(', ')}
            </p>
          )}
          <GeographyBarChart countries={geographyData.countries} />
          <GeographyExposureTable countries={geographyData.countries} />
        </>
      )}

      {activeTab === 'sectors' && (
        <>
          {sectorsData.skipped_etfs.length > 0 && (
            <p className="mb-4 text-sm text-roman-stone">
              Excluded from sector analysis (no price data):{' '}
              {sectorsData.skipped_etfs.join(', ')}
            </p>
          )}
          <SectorBarChart sectors={sectorsData.sectors} />
          <SectorExposureTable sectors={sectorsData.sectors} />
        </>
      )}
    </div>
  )
}
