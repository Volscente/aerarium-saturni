'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { hierarchy, treemap, type HierarchyRectangularNode } from 'd3-hierarchy'
import type { HoldingExposureResponse, RiskAlert } from './PortfolioPageClient'
import { concentratedStockKeys } from '../utils/concentrationAlerts'

const LABEL_MIN_WIDTH_PX = 48
const LABEL_MIN_HEIGHT_PX = 24
const TREEMAP_HEIGHT_PX = 400

type TreemapDatum = { children: HoldingExposureResponse[] } | HoldingExposureResponse

function buildTreemapLayout(
  holdings: HoldingExposureResponse[],
  width: number,
  height: number,
): HierarchyRectangularNode<HoldingExposureResponse>[] {
  /**
   * Computes treemap rectangle geometry for all holdings, scaled by
   * total_weight_percentage.
   *
   * Wraps `holdings` in a synthetic root node (d3-hierarchy's treemap()
   * requires a single-root hierarchy), sums leaf values via
   * total_weight_percentage, and lays out non-overlapping rectangles
   * within [0, width] x [0, height]. Holdings with total_weight_percentage
   * of 0 are excluded before layout, since d3-hierarchy's sum() would
   * otherwise assign them a zero-area (invisible, unclickable) rectangle.
   *
   * Args:
   *   holdings: Full look-through exposure list from GET /portfolio/holdings/exposure.
   *   width: Available layout width in pixels.
   *   height: Available layout height in pixels.
   *
   * Returns:
   *   Positioned leaves, one per holding, each carrying x0/y0/x1/y1 and the source holding.
   */
  const positiveHoldings = holdings.filter((h) => h.total_weight_percentage > 0)
  if (positiveHoldings.length === 0 || width <= 0 || height <= 0) return []

  const root = hierarchy<TreemapDatum>(
    { children: positiveHoldings },
    (d) => ('children' in d ? d.children : undefined),
  )
    .sum((d) => ('children' in d ? 0 : d.total_weight_percentage))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))

  const laidOut = treemap<TreemapDatum>().size([width, height]).paddingInner(2)(root)

  return laidOut.leaves() as unknown as HierarchyRectangularNode<HoldingExposureResponse>[]
}

function canFitLabel(node: HierarchyRectangularNode<HoldingExposureResponse>): boolean {
  /**
   * Decides whether a leaf's rectangle is large enough to hold a legible
   * <text> label.
   *
   * Applied per-leaf after layout so small slivers stay unlabeled (but
   * remain hoverable via the <title> tooltip on every rect) instead of
   * rendering truncated or overlapping text.
   *
   * Args:
   *   node: A positioned leaf from buildTreemapLayout.
   *
   * Returns:
   *   True when both the leaf's width and height clear the minimum thresholds.
   */
  return node.x1 - node.x0 >= LABEL_MIN_WIDTH_PX && node.y1 - node.y0 >= LABEL_MIN_HEIGHT_PX
}

function treemapCellFill(isConcentrationAlert: boolean): string {
  /**
   * Returns the Tailwind fill class for a leaf.
   *
   * Was: compared totalWeightPercentage against a local WARNING_THRESHOLD_PCT.
   * Now: takes the caller's precomputed alert-membership check directly, so
   * the >10 comparison itself lives only in the backend's RiskAlert derivation.
   *
   * Args:
   *   isConcentrationAlert: Whether this holding's key is present in
   *                         concentratedStockKeys(alerts).
   *
   * Returns:
   *   'fill-roman-terracotta' when flagged, else 'fill-roman-gold'.
   */
  return isConcentrationAlert ? 'fill-roman-terracotta' : 'fill-roman-gold'
}

export function HoldingsTreemap({
  holdings,
  alerts,
}: {
  holdings: HoldingExposureResponse[]
  alerts: RiskAlert[]
}): JSX.Element {
  /**
   * Renders all holdings as a treemap, area-scaled by total_weight_percentage.
   *
   * Collapsible via a clickable header (▸/▾), matching the expand/collapse
   * pattern already used by EtfRegistryTable and HoldingsExposureTable —
   * defaults to collapsed, since with few ETFs held this view tends to
   * duplicate HoldingsBarChart's top-15 view rather than add new
   * information; it becomes more useful as the number of distinct
   * holdings grows and the full-portfolio "shape" of concentration is no
   * longer visible in a top-15 list. The ResizeObserver effect re-runs on
   * `isOpen` (not just on mount) so re-expanding after a collapse
   * re-attaches the observer to the (re-mounted) container div and
   * recovers a real width rather than staying stuck at 0.
   *
   * Measures its own container width via ResizeObserver (no fixed pixel
   * width hardcoded) and renders a fluid <svg viewBox>, so the layout
   * reflows at any viewport with no special-cased mobile behaviour.
   * Layout is recomputed via useMemo when holdings or the measured width
   * change; rendering is plain SVG <rect>/<text>/<title>, no charting
   * library. Renders an empty-state message when holdings has no
   * positive-weight rows, matching HoldingsBarChart's pattern.
   *
   * Cells whose key is flagged by a concentration_risk alert (see
   * concentratedStockKeys) render in roman-terracotta instead of
   * roman-gold — the backend's RiskAlert list is now the single source
   * of truth for the 10% limit, not a locally duplicated comparison.
   *
   * Args:
   *   holdings: Full look-through exposure list from
   *             GET /portfolio/holdings/exposure, passed by
   *             PortfolioPageClient.
   *   alerts: Full alert list from the same response.
   *
   * Returns:
   *   JSX treemap, or an empty-state message when there is no data to show.
   */
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    if (!isOpen) return
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [isOpen])

  const hasHoldings = holdings.some((h) => h.total_weight_percentage > 0)
  const concentratedKeys = useMemo(() => concentratedStockKeys(alerts), [alerts])

  const leaves = useMemo(
    () => buildTreemapLayout(holdings, width, TREEMAP_HEIGHT_PX),
    [holdings, width],
  )

  return (
    <div className="mb-6 rounded-2xl border border-roman-stone/10 bg-white/5 dark:bg-roman-obsidian/50 p-6 backdrop-blur-sm">
      <h2
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex cursor-pointer select-none items-center gap-2 font-roman text-xl font-bold text-roman-gold"
      >
        <span className="text-roman-stone/40">{isOpen ? '▾' : '▸'}</span>
        Portfolio Holdings Treemap
      </h2>
      {isOpen && (
        <div ref={containerRef} className="mt-6 w-full">
          {!hasHoldings ? (
            <p className="text-roman-stone">No holdings data available.</p>
          ) : (
            <svg
              viewBox={`0 0 ${width} ${TREEMAP_HEIGHT_PX}`}
              width="100%"
              height={TREEMAP_HEIGHT_PX}
              role="img"
              aria-label="Treemap of look-through holdings exposure"
            >
              {leaves.map((leaf) => {
                const holding = leaf.data
                const key = holding.stock_isin ?? holding.stock_ticker ?? holding.stock_name
                const label = holding.stock_ticker ?? holding.stock_isin ?? holding.stock_name
                return (
                  <g key={key} transform={`translate(${leaf.x0}, ${leaf.y0})`}>
                    <rect
                      width={leaf.x1 - leaf.x0}
                      height={leaf.y1 - leaf.y0}
                      className={`${treemapCellFill(concentratedKeys.has(key))} stroke-1 stroke-roman-obsidian/20`}
                    >
                      <title>
                        {`${holding.stock_name} (${label}) — ${holding.total_weight_percentage.toFixed(2)}%`}
                      </title>
                    </rect>
                    {canFitLabel(leaf) && (
                      <text
                        x={6}
                        y={16}
                        className="pointer-events-none fill-roman-parchment text-xs font-medium"
                      >
                        {label}
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>
          )}
        </div>
      )}
    </div>
  )
}
