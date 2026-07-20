export const dynamic = 'force-dynamic'

import { PortfolioPageClient } from './components/PortfolioPageClient'
import type { PortfolioOverviewResponse } from './components/PortfolioPageClient'

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

export default async function PortfolioPage() {
  const overviewData = await fetchPortfolioOverview()
  return <PortfolioPageClient overviewData={overviewData} />
}
