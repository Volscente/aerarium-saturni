'use client'

import { useState } from 'react'
import { AddEtfButton } from '../../components/AddEtfButton'
import { EtfRegistryTable } from '../../components/EtfRegistryTable'
import { PortfolioOverviewTable } from './PortfolioOverviewTable'
import type { EtfResponse } from '../../components/EtfForm'

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

type ActiveTab = 'portfolio' | 'etf-registry'

export function PortfolioPageClient({
  overviewData,
  etfs,
}: {
  overviewData: PortfolioOverviewResponse
  etfs: EtfResponse[]
}): JSX.Element {
  /**
   * Tab container for the portfolio route.
   *
   * Owns activeTab state and renders the two-tab header ("Portfolio" | "ETF Registry")
   * plus the corresponding tab body. Tab switching is pure client-side state —
   * no URL changes, no server round-trips.
   *
   * The "Portfolio" tab is the default. It renders PortfolioOverviewTable (placeholder
   * until TASK-3). The "ETF Registry" tab renders AddEtfButton + EtfRegistryTable.
   *
   * Tab header styling uses roman-* Tailwind tokens to match the Tabularium design language.
   */
  const [activeTab, setActiveTab] = useState<ActiveTab>('portfolio')

  const tabClass = (tab: ActiveTab) =>
    `px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
      activeTab === tab
        ? 'border-roman-gold text-roman-gold'
        : 'border-transparent text-roman-stone hover:text-roman-parchment'
    }`

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex border-b border-roman-stone/30">
        <button
          onClick={() => setActiveTab('portfolio')}
          className={tabClass('portfolio')}
        >
          Portfolio
        </button>
        <button
          onClick={() => setActiveTab('etf-registry')}
          className={tabClass('etf-registry')}
        >
          ETF Registry
        </button>
      </div>

      {activeTab === 'portfolio' && (
        <PortfolioOverviewTable rows={overviewData.rows} />
      )}

      {activeTab === 'etf-registry' && (
        <>
          <div className="mb-6 flex items-center justify-between">
            <h1 className="font-roman text-3xl font-bold text-roman-gold">
              ETF Registry
            </h1>
            <AddEtfButton />
          </div>
          {etfs.length === 0 ? (
            <p className="text-roman-stone">No ETFs registered yet.</p>
          ) : (
            <EtfRegistryTable etfs={etfs} />
          )}
        </>
      )}
    </div>
  )
}
