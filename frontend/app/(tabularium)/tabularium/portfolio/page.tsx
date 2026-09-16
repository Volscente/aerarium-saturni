export const dynamic = 'force-dynamic'

import { PortfolioPageClient } from './components/PortfolioPageClient'
import type {
  PortfolioOverviewResponse,
  HoldingsExposureResponse,
  HoldingsGeographyResponse,
  HoldingsSectorsResponse,
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

async function fetchHoldingsGeography(): Promise<HoldingsGeographyResponse> {
  try {
    const res = await fetch(
      `${process.env.BACKEND_URL}/portfolio/holdings/geography`,
      { next: { tags: ['holdings-geography'] } }
    )
    if (!res.ok) return { countries: [], skipped_etfs: [] }
    return res.json()
  } catch {
    return { countries: [], skipped_etfs: [] }
  }
}

async function fetchHoldingsSectors(): Promise<HoldingsSectorsResponse> {
  try {
    const res = await fetch(
      `${process.env.BACKEND_URL}/portfolio/holdings/sectors`,
      { next: { tags: ['holdings-sectors'] } }
    )
    if (!res.ok) return { sectors: [], skipped_etfs: [] }
    return res.json()
  } catch {
    return { sectors: [], skipped_etfs: [] }
  }
}

export default async function PortfolioPage() {
  const [overviewData, exposureData, geographyData, sectorsData] = await Promise.all([
    fetchPortfolioOverview(),
    fetchHoldingsExposure(),
    fetchHoldingsGeography(),
    fetchHoldingsSectors(),
  ])
  return (
    <PortfolioPageClient
      overviewData={overviewData}
      exposureData={exposureData}
      geographyData={geographyData}
      sectorsData={sectorsData}
    />
  )
}
