'use client'

import type { SectorExposureResponse } from './PortfolioPageClient'

const MAX_BARS = 15

function topSectors(sectors: SectorExposureResponse[]): SectorExposureResponse[] {
  /**
   * Selects the top MAX_BARS sectors by total_weight_percentage.
   *
   * Sorts defensively rather than assuming `sectors` is already sorted
   * DESC by the caller (even though the backend returns it that way).
   * Does not mutate the input array.
   */
  return [...sectors]
    .sort((a, b) => b.total_weight_percentage - a.total_weight_percentage)
    .slice(0, MAX_BARS)
}

function scaleMax(values: number[]): number {
  /**
   * Computes the chart's x-axis maximum, rounded up to the nearest
   * multiple of 5 above the largest bar (never below 5, so a thin bar
   * still renders with visible headroom).
   */
  const max = Math.max(5, ...values)
  return Math.ceil(max / 5) * 5
}

export function SectorBarChart({
  sectors,
}: {
  sectors: SectorExposureResponse[]
}): JSX.Element {
  /**
   * Renders the top 15 sectors by total_weight_percentage as plain
   * horizontal HTML/CSS bars, mirroring GeographyBarChart exactly but
   * keyed by `sector` instead of `country_code`.
   *
   * Args:
   *   sectors: Full look-through sector exposure list from
   *            GET /portfolio/holdings/sectors, passed by
   *            PortfolioPageClient.
   *
   * Returns:
   *   JSX bar chart, or an empty-state message when sectors is empty.
   */
  const bars = topSectors(sectors)

  if (bars.length === 0) {
    return (
      <div className="mb-6 rounded-2xl border border-roman-stone/10 bg-white/5 dark:bg-roman-obsidian/50 p-6 backdrop-blur-sm">
        <p className="text-roman-stone">No sector data available.</p>
      </div>
    )
  }

  const axisMax = scaleMax(bars.map((s) => s.total_weight_percentage))

  return (
    <div className="mb-6 rounded-2xl border border-roman-stone/10 bg-white/5 dark:bg-roman-obsidian/50 p-6 backdrop-blur-sm">
      <h2 className="mb-6 font-roman text-xl font-bold text-roman-gold">
        Top 15 Sectors by Exposure
      </h2>
      <div className="grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-x-4 gap-y-3">
        {bars.map((s) => {
          const barLeft = `${(s.total_weight_percentage / axisMax) * 100}%`
          return (
            <div key={s.sector ?? 'unknown'} className="contents">
              <span className="truncate text-sm text-roman-stone">
                {s.sector ?? 'Unknown'}
              </span>
              <div className="relative h-4 rounded bg-roman-stone/10">
                <div
                  className="absolute inset-y-0 left-0 rounded bg-roman-gold"
                  style={{ width: barLeft }}
                />
              </div>
              <span className="text-sm tabular-nums text-roman-stone">
                {s.total_weight_percentage.toFixed(2)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
