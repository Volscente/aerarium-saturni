import type { PortfolioRowResponse } from './PortfolioPageClient'

export function PortfolioOverviewTable({
  rows: _rows,
}: {
  rows: PortfolioRowResponse[]
}): JSX.Element {
  return (
    <p className="text-roman-stone">Portfolio overview coming soon.</p>
  )
}
