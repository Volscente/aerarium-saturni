'use client'

import type { CountryExposureResponse } from './PortfolioPageClient'
import { countryLabel } from '../utils/countryDisplay'

const MAX_BARS = 15

function topCountries(countries: CountryExposureResponse[]): CountryExposureResponse[] {
  /**
   * Selects the top MAX_BARS countries by total_weight_percentage.
   *
   * Sorts defensively rather than assuming `countries` is already sorted
   * DESC by the caller (even though the backend returns it that way).
   * Does not mutate the input array.
   */
  return [...countries]
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

export function GeographyBarChart({
  countries,
}: {
  countries: CountryExposureResponse[]
}): JSX.Element {
  /**
   * Renders the top 15 countries by total_weight_percentage as plain
   * horizontal HTML/CSS bars (no charting library), mirroring
   * HoldingsBarChart. There is no concentration-alert equivalent for
   * country buckets, so every bar renders in the same roman-gold color --
   * no warning-coloring logic here.
   *
   * Args:
   *   countries: Full look-through geography exposure list from
   *              GET /portfolio/holdings/geography, passed by
   *              PortfolioPageClient.
   *
   * Returns:
   *   JSX bar chart, or an empty-state message when countries is empty.
   */
  const bars = topCountries(countries)

  if (bars.length === 0) {
    return (
      <div className="mb-6 rounded-2xl border border-roman-stone/10 bg-white/5 dark:bg-roman-obsidian/50 p-6 backdrop-blur-sm">
        <p className="text-roman-stone">No geography data available.</p>
      </div>
    )
  }

  const axisMax = scaleMax(bars.map((c) => c.total_weight_percentage))

  return (
    <div className="mb-6 rounded-2xl border border-roman-stone/10 bg-white/5 dark:bg-roman-obsidian/50 p-6 backdrop-blur-sm">
      <h2 className="mb-6 font-roman text-xl font-bold text-roman-gold">
        Top 15 Countries by Exposure
      </h2>
      <div className="grid grid-cols-[minmax(8rem,14rem)_1fr_auto] items-center gap-x-4 gap-y-3">
        {bars.map((c) => {
          const barLeft = `${(c.total_weight_percentage / axisMax) * 100}%`
          return (
            <div key={c.country_code ?? 'unknown'} className="contents">
              <span
                className="truncate text-sm text-roman-stone"
                title={countryLabel(c.country_code)}
              >
                {countryLabel(c.country_code)}
              </span>
              <div className="relative h-4 rounded bg-roman-stone/10">
                <div
                  className="absolute inset-y-0 left-0 rounded bg-roman-gold"
                  style={{ width: barLeft }}
                />
              </div>
              <span className="text-sm tabular-nums text-roman-stone">
                {c.total_weight_percentage.toFixed(2)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
