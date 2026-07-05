export const dynamic = 'force-dynamic'

import { PortfolioPageClient } from './components/PortfolioPageClient'
import type {
  PortfolioOverviewResponse,
} from './components/PortfolioPageClient'
import type { EtfResponse } from '../components/EtfForm'

async function fetchPortfolioOverview(): Promise<PortfolioOverviewResponse> {
  /**
   * Fetch aggregated portfolio data from the backend.
   *
   * Calls GET ${process.env.BACKEND_URL}/portfolio/overview with a Next.js
   * data cache tag so that revalidateTag('portfolio-overview') in any server
   * action instantly stales this fetch for the next request. Returns
   * { rows: [] } on any network error or non-2xx response so the page
   * renders the empty-state UI without crashing.
   *
   * Returns:
   *   PortfolioOverviewResponse with a `rows` array of PortfolioRowResponse.
   *   Performance fields are null when price data is absent for any held ISIN.
   *
   * Throws:
   *   Error: if the fetch fails or the response is not ok.
   */
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

async function fetchEtfs(): Promise<EtfResponse[]> {
  /**
   * Fetch all ETFs from the backend with the Next.js on-demand cache tag.
   *
   * Calls GET ${process.env.BACKEND_URL}/etfs with { next: { tags: ['etfs'] } }
   * so that revalidateTag('etfs') in any Server Action immediately expires this
   * cached fetch result. Follows the same error-suppression pattern as
   * fetchTransactions in transactions/page.tsx — returns [] on any network
   * error or non-2xx response so the page renders the empty-state UI.
   *
   * Returns:
   *   Array of EtfResponse objects; empty array on any fetch or HTTP error.
   */
  try {
    const res = await fetch(`${process.env.BACKEND_URL}/etfs`, {
      next: { tags: ['etfs'] },
    })
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export default async function PortfolioPage() {
  const [overviewData, etfs] = await Promise.all([
    fetchPortfolioOverview(),
    fetchEtfs(),
  ])

  return <PortfolioPageClient overviewData={overviewData} etfs={etfs} />
}
