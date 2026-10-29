'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchPriceHistory } from '../etf-actions'
import type { EtfPriceEntry } from '../etf-actions'
import type { EtfResponse } from './EtfForm'

const CHART_HEIGHT_PX = 320
const MARGIN = { top: 12, right: 12, bottom: 24, left: 56 }
const TICK_COUNT = 5
const REBASE_BASE = 100
const SERIES_CURRENCY = 'EUR'
const MS_PER_DAY = 86_400_000

// Assigned by position in the registry list, so an ETF keeps its colour across selection changes.
const SERIES_COLORS = [
  'var(--color-roman-gold)',
  'var(--color-roman-terracotta)',
  '#3B6EA5',
  '#4E8F5B',
  '#7A5C9E',
  '#2A9D8F',
]

export interface SeriesPoint {
  date: string
  value: number
}

type ChartMode = 'rebased' | 'absolute'

interface ChartLine {
  etfId: string
  ticker: string
  points: SeriesPoint[]
}

type SeriesState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; points: SeriesPoint[] }

export interface TimelineChartProps {
  etfs: Pick<EtfResponse, 'id' | 'ticker' | 'name'>[]
  priceVersion: number
}

function toSeries(entries: EtfPriceEntry[]): SeriesPoint[] {
  /**
   * Converts the price-history response into an ascending daily series.
   *
   * The endpoint returns rows newest-first with the price as a decimal string.
   * Each row is keyed by the UTC day of its timestamp; if two rows share a day
   * (impossible after migration 006, kept as a guard) the last one wins. Rows
   * whose price is not a positive finite number, or whose currency is not EUR,
   * are skipped — the refresh path only stores EUR, so only legacy manual rows
   * can be affected, and they are not converted.
   *
   * Args:
   *   entries: Rows from GET /etfs/{id}/price-history, as returned by fetchPriceHistory.
   *
   * Returns:
   *   One SeriesPoint per UTC day, oldest first; empty when nothing is usable.
   */
  const byDay = new Map<string, number>()
  for (const entry of entries) {
    const value = Number(entry.price)
    if (!Number.isFinite(value) || value <= 0) continue
    if (entry.currency !== SERIES_CURRENCY) continue
    byDay.set(entry.timestamp.slice(0, 10), value)
  }
  return Array.from(byDay, ([date, value]) => ({ date, value })).sort((a, b) =>
    a.date.localeCompare(b.date)
  )
}

function buildChartLines(
  series: { etfId: string; ticker: string; points: SeriesPoint[] }[],
  mode: ChartMode,
): ChartLine[] {
  /**
   * Prepares the plotted lines for the selected mode.
   *
   * Absolute mode passes the series through. Rebased mode cuts every series at
   * the common start (the latest first date across the series) and indexes each
   * to 100 at its value on that day, or on its first day after it. If some
   * series ends before the common start there is no overlapping range, so each
   * series is indexed to its own first point instead. Series without points are
   * excluded; the caller reports them separately.
   *
   * Args:
   *   series: Selected ETFs with their ascending daily points.
   *   mode: "rebased" (index to 100) or "absolute" (raw closes).
   *
   * Returns:
   *   One ChartLine per series that has points.
   */
  const nonEmpty = series.filter((s) => s.points.length > 0)
  if (mode === 'absolute' || nonEmpty.length === 0) return nonEmpty

  const commonStart = nonEmpty.reduce(
    (latest, s) => (s.points[0].date > latest ? s.points[0].date : latest),
    nonEmpty[0].points[0].date
  )
  const hasOverlap = nonEmpty.every((s) => s.points[s.points.length - 1].date >= commonStart)

  return nonEmpty.map((s) => {
    const cut = hasOverlap ? s.points.filter((p) => p.date >= commonStart) : s.points
    const base = cut[0].value
    return {
      ...s,
      points: cut.map((p) => ({ date: p.date, value: (p.value / base) * REBASE_BASE })),
    }
  })
}

function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / MS_PER_DAY)
}

function dayToDate(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10)
}

function makeScales(
  lines: ChartLine[],
  width: number,
  height: number,
): {
  x: (date: string) => number
  y: (value: number) => number
  xTicks: string[]
  yTicks: number[]
} {
  /**
   * Builds the linear scales that map dates and values into the plot box.
   *
   * X is linear over day numbers across all lines (so gaps such as weekends
   * stay proportional); Y is linear over the value range padded by 5%. A single
   * date or a flat series would collapse a domain to zero width, so those get
   * a small artificial span and the line is not drawn on an axis.
   *
   * Args:
   *   lines: Lines to plot; must contain at least one point.
   *   width: Plot box width in pixels (excluding margins).
   *   height: Plot box height in pixels (excluding margins).
   *
   * Returns:
   *   x/y mapping functions plus evenly spaced tick positions (dates, values).
   */
  const days = lines.flatMap((l) => l.points.map((p) => dayNumber(p.date)))
  const values = lines.flatMap((l) => l.points.map((p) => p.value))
  let dayMin = Math.min(...days)
  let dayMax = Math.max(...days)
  if (dayMin === dayMax) {
    dayMin -= 1
    dayMax += 1
  }
  let valueMin = Math.min(...values)
  let valueMax = Math.max(...values)
  if (valueMin === valueMax) {
    valueMin *= 0.99
    valueMax *= 1.01
  }
  const pad = (valueMax - valueMin) * 0.05
  valueMin -= pad
  valueMax += pad

  const ticks = (min: number, max: number) =>
    Array.from({ length: TICK_COUNT }, (_, i) => min + ((max - min) * i) / (TICK_COUNT - 1))

  return {
    x: (date) => ((dayNumber(date) - dayMin) / (dayMax - dayMin)) * width,
    y: (value) => height - ((value - valueMin) / (valueMax - valueMin)) * height,
    xTicks: ticks(dayMin, dayMax).map((d) => dayToDate(Math.round(d))),
    yTicks: ticks(valueMin, valueMax),
  }
}

function nearestPointIndex(
  dates: string[],
  pointerX: number,
  x: (date: string) => number,
): number {
  /**
   * Finds the date closest to the pointer, for the hover crosshair.
   *
   * Binary search over the ascending date axis for the first date at or right of
   * the pointer, then picks whichever neighbour is nearer.
   *
   * Args:
   *   dates: Ascending, de-duplicated dates of all plotted points.
   *   pointerX: Pointer x position in plot-box pixels.
   *   x: Date-to-pixel scale from makeScales.
   *
   * Returns:
   *   Index into `dates` of the nearest date.
   */
  let lo = 0
  let hi = dates.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (x(dates[mid]) < pointerX) lo = mid + 1
    else hi = mid
  }
  if (lo > 0 && pointerX - x(dates[lo - 1]) < x(dates[lo]) - pointerX) return lo - 1
  return lo
}

export function TimelineChart({ etfs, priceVersion }: TimelineChartProps): JSX.Element {
  /**
   * Line chart of ETF price history with multi-ETF overlay.
   *
   * ETFs are chosen with toggle chips (default: the first ETF in the registry).
   * Each selected ETF's series is loaded through the fetchPriceHistory Server
   * Action and cached per ETF in component state; the cache is dropped when
   * `priceVersion` changes (an update finished), and the selected series are
   * re-fetched. Server Actions are queued by Next.js, so several newly selected
   * ETFs load one after another. A failed fetch is shown next to that ETF's
   * chip and does not block the other series; an ETF with no usable history is
   * listed in a notice instead of being plotted. Selected ids that no longer
   * exist in `etfs` (deleted ETF) are ignored.
   *
   * The default "rebased" mode indexes the lines to 100 on their common start
   * so ETFs at different price levels are comparable; "absolute" shows raw EUR
   * closes. Rendering is a plain fluid SVG (container width measured with a
   * ResizeObserver) with a pointer-driven crosshair and tooltip, no charting
   * library. Series are identified by colour and by legend/tooltip labels.
   *
   * Args:
   *   etfs: The registry's ETFs (id, ticker, name), passed from the Server Component.
   *   priceVersion: Counter incremented after each completed price update.
   *
   * Returns:
   *   JSX containing the controls, the plot (or an empty-state prompt) and the legend.
   */
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(etfs.length > 0 ? [etfs[0].id] : [])
  )
  const [mode, setMode] = useState<ChartMode>('rebased')
  const [series, setSeries] = useState<Record<string, SeriesState>>({})
  const [hoverDate, setHoverDate] = useState<string | null>(null)
  const [width, setWidth] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const requestedRef = useRef<Set<string>>(new Set())
  const versionRef = useRef(priceVersion)

  const selectedEtfs = etfs.filter((etf) => selected.has(etf.id))
  const selectedKey = selectedEtfs.map((etf) => etf.id).join(',')

  useEffect(() => {
    if (versionRef.current !== priceVersion) {
      versionRef.current = priceVersion
      requestedRef.current = new Set()
      setSeries({})
    }
    const version = versionRef.current
    for (const id of selectedKey.split(',').filter(Boolean)) {
      if (requestedRef.current.has(id)) continue
      requestedRef.current.add(id)
      setSeries((prev) => ({ ...prev, [id]: { status: 'loading' } }))
      fetchPriceHistory(id).then((response) => {
        if (versionRef.current !== version) return
        const next: SeriesState =
          'error' in response
            ? { status: 'error', error: response.error }
            : { status: 'ready', points: toSeries(response) }
        setSeries((prev) => ({ ...prev, [id]: next }))
      })
    }
  }, [selectedKey, priceVersion])

  const hasPlot = selectedEtfs.length > 0
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasPlot])

  const lines = useMemo(
    () =>
      buildChartLines(
        selectedEtfs.flatMap((etf) => {
          const state = series[etf.id]
          return state?.status === 'ready'
            ? [{ etfId: etf.id, ticker: etf.ticker, points: state.points }]
            : []
        }),
        mode
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedKey, series, mode]
  )

  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 0)
  const plotHeight = CHART_HEIGHT_PX - MARGIN.top - MARGIN.bottom
  const scales = useMemo(
    () => (lines.length > 0 && plotWidth > 0 ? makeScales(lines, plotWidth, plotHeight) : null),
    [lines, plotWidth, plotHeight]
  )
  const allDates = useMemo(
    () => Array.from(new Set(lines.flatMap((l) => l.points.map((p) => p.date)))).sort(),
    [lines]
  )
  const valueByDate = useMemo(
    () => new Map(lines.map((l) => [l.etfId, new Map(l.points.map((p) => [p.date, p.value]))])),
    [lines]
  )

  const colorOf = (id: string) =>
    SERIES_COLORS[etfs.findIndex((etf) => etf.id === id) % SERIES_COLORS.length]
  const emptyTickers = selectedEtfs
    .filter((etf) => {
      const state = series[etf.id]
      return state?.status === 'ready' && state.points.length === 0
    })
    .map((etf) => etf.ticker)
  const isLoading = selectedEtfs.some((etf) => series[etf.id]?.status === 'loading')
  const startsDiffer =
    mode === 'rebased' && new Set(lines.map((l) => l.points[0].date)).size > 1
  const formatValue = (value: number) => (mode === 'rebased' ? value.toFixed(1) : value.toFixed(2))

  const toggleEtf = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!scales || allDates.length === 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const pointerX = event.clientX - rect.left - MARGIN.left
    setHoverDate(allDates[nearestPointIndex(allDates, pointerX, scales.x)])
  }

  const hoverX = scales && hoverDate ? scales.x(hoverDate) + MARGIN.left : null

  return (
    <div className="mb-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {etfs.map((etf) => {
          const isSelected = selected.has(etf.id)
          const state = series[etf.id]
          return (
            <button
              key={etf.id}
              onClick={() => toggleEtf(etf.id)}
              aria-pressed={isSelected}
              title={etf.name}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-mono font-medium transition-colors ${
                isSelected
                  ? 'border-roman-gold/60 bg-roman-gold/10 text-roman-gold'
                  : 'border-roman-stone/30 text-roman-stone hover:border-roman-gold/50 hover:text-roman-gold'
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: isSelected ? colorOf(etf.id) : 'transparent' }}
              />
              {etf.ticker}
              {isSelected && state?.status === 'error' && (
                <span className="font-sans font-normal text-roman-terracotta">
                  · {state.error}
                </span>
              )}
            </button>
          )
        })}
        <div className="ml-auto flex overflow-hidden rounded border border-roman-stone/30 text-xs">
          {(['rebased', 'absolute'] as const).map((value) => (
            <button
              key={value}
              onClick={() => setMode(value)}
              aria-pressed={mode === value}
              className={`px-3 py-1 transition-colors ${
                mode === value
                  ? 'bg-roman-gold/10 text-roman-gold'
                  : 'text-roman-stone hover:text-roman-gold'
              }`}
            >
              {value === 'rebased' ? 'Rebased to 100' : 'Absolute'}
            </button>
          ))}
        </div>
      </div>

      {!hasPlot ? (
        <p className="rounded border border-roman-stone/30 p-6 text-center text-sm text-roman-stone">
          Select an ETF to see its price history.
        </p>
      ) : (
        <div ref={containerRef} className="relative w-full">
          {scales ? (
            <>
              <p className="mb-1 text-xs text-roman-stone">
                {mode === 'rebased' ? 'Index (start = 100)' : SERIES_CURRENCY}
              </p>
              <svg
                width={width}
                height={CHART_HEIGHT_PX}
                role="img"
                aria-label="ETF price history"
                onPointerMove={handlePointerMove}
                onPointerLeave={() => setHoverDate(null)}
              >
                <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
                  {scales.yTicks.map((tick) => (
                    <g key={tick}>
                      <line
                        x1={0}
                        x2={plotWidth}
                        y1={scales.y(tick)}
                        y2={scales.y(tick)}
                        className="stroke-roman-stone/20"
                      />
                      <text
                        x={-8}
                        y={scales.y(tick)}
                        textAnchor="end"
                        dominantBaseline="middle"
                        className="fill-roman-stone text-[10px]"
                      >
                        {formatValue(tick)}
                      </text>
                    </g>
                  ))}
                  {scales.xTicks.map((tick, i) => (
                    <text
                      key={tick}
                      x={scales.x(tick)}
                      y={plotHeight + 16}
                      textAnchor={i === 0 ? 'start' : i === TICK_COUNT - 1 ? 'end' : 'middle'}
                      className="fill-roman-stone text-[10px]"
                    >
                      {tick}
                    </text>
                  ))}
                  {lines.map((line) =>
                    line.points.length === 1 ? (
                      <circle
                        key={line.etfId}
                        cx={scales.x(line.points[0].date)}
                        cy={scales.y(line.points[0].value)}
                        r={3}
                        fill={colorOf(line.etfId)}
                      />
                    ) : (
                      <path
                        key={line.etfId}
                        d={line.points
                          .map(
                            (p, i) =>
                              `${i === 0 ? 'M' : 'L'}${scales.x(p.date).toFixed(1)},${scales.y(p.value).toFixed(1)}`
                          )
                          .join('')}
                        fill="none"
                        stroke={colorOf(line.etfId)}
                        strokeWidth={1.5}
                      />
                    )
                  )}
                  {hoverDate && (
                    <>
                      <line
                        x1={scales.x(hoverDate)}
                        x2={scales.x(hoverDate)}
                        y1={0}
                        y2={plotHeight}
                        className="stroke-roman-stone/60"
                      />
                      {lines.map((line) => {
                        const value = valueByDate.get(line.etfId)?.get(hoverDate)
                        return value === undefined ? null : (
                          <circle
                            key={line.etfId}
                            cx={scales.x(hoverDate)}
                            cy={scales.y(value)}
                            r={3}
                            fill={colorOf(line.etfId)}
                          />
                        )
                      })}
                    </>
                  )}
                </g>
              </svg>
              {hoverDate && hoverX !== null && (
                <div
                  className="pointer-events-none absolute top-6 z-10 rounded border border-roman-stone/30 bg-white px-2 py-1 text-xs text-roman-stone shadow dark:bg-black"
                  style={
                    hoverX > width / 2
                      ? { right: width - hoverX + 8 }
                      : { left: hoverX + 8 }
                  }
                >
                  <div className="font-medium">{hoverDate}</div>
                  {lines.map((line) => {
                    const value = valueByDate.get(line.etfId)?.get(hoverDate)
                    return (
                      <div key={line.etfId} className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: colorOf(line.etfId) }}
                        />
                        <span className="font-mono">{line.ticker}</span>
                        <span>{value === undefined ? '—' : formatValue(value)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            <p className="rounded border border-roman-stone/30 p-6 text-center text-sm text-roman-stone">
              {isLoading
                ? 'Loading price history…'
                : 'No price history yet — use "Update prices" to retrieve it.'}
            </p>
          )}
        </div>
      )}

      {lines.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-roman-stone">
          {lines.map((line) => (
            <span key={line.etfId} className="flex items-center gap-2">
              <span
                className="h-0.5 w-4"
                style={{ backgroundColor: colorOf(line.etfId) }}
              />
              <span className="font-mono font-medium">{line.ticker}</span>
            </span>
          ))}
        </div>
      )}
      {emptyTickers.length > 0 && lines.length > 0 && (
        <p className="mt-2 text-xs text-roman-stone/70">
          No price history for {emptyTickers.join(', ')}.
        </p>
      )}
      {startsDiffer && (
        <p className="mt-2 text-xs text-roman-stone/70">
          The selected ETFs share no overlapping date range, so each line starts at 100 on its own first day.
        </p>
      )}
    </div>
  )
}
