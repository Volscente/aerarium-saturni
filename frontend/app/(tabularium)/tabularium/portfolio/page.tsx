export const dynamic = 'force-dynamic'

import { PortfolioPageClient } from './components/PortfolioPageClient'
import type {
  PortfolioOverviewResponse,
  HoldingsExposureResponse,
} from './components/PortfolioPageClient'

async function fetchPortfolioOverview(): Promise<PortfolioOverviewResponse> {
  try {
    const res = await fetch(
      `${process.env.BACKEND_URL}/portfolio/overview`,
      { next: { tags: ['portfolio-overview'] } }
    )
    if (!res.ok) return { rows: [] }
    return res.json()
  } catch {
    return { rows: [] }
  }
}

async function fetchHoldingsExposure(): Promise<HoldingsExposureResponse> {
  try {
    const res = await fetch(
      `${process.env.BACKEND_URL}/portfolio/holdings/exposure`,
      { next: { tags: ['holdings-exposure'] } }
    )
    if (!res.ok) return { holdings: [], skipped_etfs: [], alerts: [] }
    return res.json()
  } catch {
    return { holdings: [], skipped_etfs: [], alerts: [] }
  }
}

export default async function PortfolioPage() {
  const [overviewData, exposureData] = await Promise.all([
    fetchPortfolioOverview(),
    fetchHoldingsExposure(),
  ])
  return (
    <PortfolioPageClient
      overviewData={overviewData}
      exposureData={exposureData}
    />
  )
}
