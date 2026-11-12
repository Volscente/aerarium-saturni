'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { LineChart } from 'lucide-react'
import { fetchPortfolioTimeline } from '../timeline-actions'
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

export interface TimelinePoint {
  date: string
  value: number
  net_flow: number
}

export interface TimelineEtfSeries {
  isin: string
  etf_ticker: string
  etf_name: string
  points: TimelinePoint[]
}

export interface TimelineBrokerSeries {
  broker_platform: string
  points: TimelinePoint[]
  etfs: TimelineEtfSeries[]
}

export interface TimelineOwnerSeries {
  owner: string
  points: TimelinePoint[]
  brokers: TimelineBrokerSeries[]
}

export interface PortfolioTimelineResponse {
  owners: TimelineOwnerSeries[]
  skipped_transactions: number
}

type TimelineState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: PortfolioTimelineResponse }
  | { status: 'error'; message: string }

type PortfolioTab = 'overview' | 'holdings' | 'geography' | 'sectors' | 'timeline'

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
  const [timeline, setTimeline] = useState<TimelineState>({ status: 'idle' })
  // Identifies the latest timeline request so a response from a superseded one is dropped.
  const requestId = useRef(0)
  const isFirstRender = useRef(true)

  const loadTimeline = useCallback(async () => {
    /**
     * Fetches the timeline once and stores the result in component state.
     *
     * Sets 'loading' first, so callers that gate on 'idle' cannot start a second
     * request. The result is applied only if no newer request or reset has
     * happened meanwhile (requestId check).
     */
    const id = ++requestId.current
    setTimeline({ status: 'loading' })
    const result = await fetchPortfolioTimeline()
    if (id !== requestId.current) return
    setTimeline(
      'error' in result
        ? { status: 'error', message: result.error }
        : { status: 'ready', data: result }
    )
  }, [])

  // First open (and re-open after an invalidation reset): fetch only while idle.
  useEffect(() => {
    if (activeTab === 'timeline' && timeline.status === 'idle') void loadTimeline()
  }, [activeTab, timeline.status, loadTimeline])

  // A write action revalidates the route, so the Server Component hands down fresh props.
  // Drop the cached timeline then. This relies on prop identity: it stops working if
  // overviewData is ever memoized so that it keeps the same reference across refreshes.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    requestId.current++
    setTimeline({ status: 'idle' })
  }, [overviewData])

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
        <span aria-hidden="true" className="mx-2 self-stretch border-l border-roman-stone/20" />
        <button
          type="button"
          onClick={() => setActiveTab('timeline')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all ${
            activeTab === 'timeline'
              ? 'border-b-2 border-roman-terracotta text-roman-terracotta'
              : 'text-roman-stone hover:text-roman-gold'
          }`}
        >
          <LineChart aria-hidden="true" className="h-4 w-4" />
          Timeline
        </button>
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

      {activeTab === 'timeline' && (
        <>
          {(timeline.status === 'idle' || timeline.status === 'loading') && (
            <p className="rounded border border-roman-stone/30 p-6 text-center text-sm text-roman-stone">
              Loading timeline…
            </p>
          )}
          {timeline.status === 'error' && (
            <div className="rounded border border-roman-terracotta/40 p-6 text-center text-sm text-roman-terracotta">
              <p className="mb-3">Could not load the timeline: {timeline.message}</p>
              <button
                type="button"
                onClick={() => void loadTimeline()}
                className="rounded border border-roman-terracotta/40 px-3 py-1 hover:bg-roman-terracotta/10"
              >
                Retry
              </button>
            </div>
          )}
          {timeline.status === 'ready' && (
            <>
              {timeline.data.skipped_transactions > 0 && (
                <p className="mb-4 text-sm text-roman-stone">
                  {timeline.data.skipped_transactions} transaction(s) skipped (non-EUR, missing
                  price or invalid).
                </p>
              )}
              {timeline.data.owners.length === 0 ? (
                <p className="rounded border border-roman-stone/30 p-6 text-center text-sm text-roman-stone">
                  No priced transactions to plot yet.
                </p>
              ) : (
                // TASK-4 mounts the macro and micro charts here.
                <p className="rounded border border-roman-stone/30 p-6 text-center text-sm text-roman-stone">
                  Timeline loaded: {timeline.data.owners.length} owner(s),{' '}
                  {timeline.data.owners.reduce((n, o) => n + o.brokers.length, 0)} broker
                  position(s).
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
