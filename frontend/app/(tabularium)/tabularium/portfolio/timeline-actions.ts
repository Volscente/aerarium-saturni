'use server'

import type { PortfolioTimelineResponse } from './components/PortfolioPageClient'

export async function fetchPortfolioTimeline(): Promise<
  PortfolioTimelineResponse | { error: string }
> {
  /**
   * Server Action: load the daily holdings-value timeline for the Timeline tab.
   *
   * GETs ${BACKEND_URL}/portfolio/timeline tagged 'portfolio-timeline', the tag
   * every write path revalidates. Unlike the page-level fetchers, which swallow
   * failures into empty payloads, this returns { error } so the UI can tell
   * "no data" from "request failed". The response is not Zod-validated (as in
   * fetchPriceHistory): the backend's Pydantic model is the contract, mirrored
   * by the Timeline* interfaces in PortfolioPageClient.tsx.
   *
   * Returns:
   *   The parsed PortfolioTimelineResponse on HTTP 200, or { error: string } on
   *   a non-OK status or a network failure.
   */
  try {
    const res = await fetch(`${process.env.BACKEND_URL}/portfolio/timeline`, {
      next: { tags: ['portfolio-timeline'] },
    })
    if (!res.ok) return { error: `Backend error ${res.status}` }
    return (await res.json()) as PortfolioTimelineResponse
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' }
  }
}
