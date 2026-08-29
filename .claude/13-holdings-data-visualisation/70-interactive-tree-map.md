# #70: Interactive Treemap

**GitHub Issue:** [70 — Concentration Dashboard UI](https://github.com/Volscente/aerarium-saturni/issues/70)
**GitHub Milestone:** [13-holdings-data-visualisation](https://github.com/Volscente/aerarium-saturni/milestone/11)
**Notion page:** [13 - Holdings Data Visualisation](https://app.notion.com/p/13-Holdings-Data-Visualisation-3a45cc6c0f0780aa8c0cefdebc1eed9c)

---

## Technical Scope

**In scope:**

- `frontend/app/(tabularium)/tabularium/portfolio/components/HoldingsTreemap.tsx` — new component
- `frontend/package.json` — `d3-hierarchy` (runtime) and `@types/d3-hierarchy` (dev) added as new dependencies
- `frontend/app/(tabularium)/tabularium/portfolio/components/PortfolioPageClient.tsx` — mount `<HoldingsTreemap>` below `HoldingsBarChart` and above `PortfolioOverviewTable`; a minimal, unavoidable integration step so the new component actually renders — no other change to this file

**Out of scope:**

- Backend aggregation endpoint, ISIN resolution, and response schemas — already delivered in [#69](https://github.com/Volscente/aerarium-saturni/issues/69) ([69-look-through-exposure-aggregation-engine.md](69-look-through-exposure-aggregation-engine.md))
- `ConcentrationAlertBadge.tsx` / `HoldingsBarChart.tsx` / the `holdings-exposure` data fetch — already delivered under TASK-2 ([70-dashboard-data-wiring.md](70-dashboard-data-wiring.md))
- Detailed Table (`HoldingsExposureTable.tsx`) — tracked separately under TASK-4
- Any new Tabularium route — this ships inside the existing `/tabularium/portfolio` page
- A general-purpose charting library (Recharts, Nivo, full D3) — only `d3-hierarchy`'s layout algorithm is introduced, per the RFC's Lighthouse-budget constraint

---

## Architecture

```txt
PortfolioPageClient (exposureData.holdings: HoldingExposureResponse[])
          │
          ▼
    <HoldingsTreemap holdings={exposureData.holdings} />   ('use client')
          │
          ├── buildTreemapLayout(holdings, width, height)
          │     │
          │     ├── d3.hierarchy({ children: holdings })
          │     │     .sum(d => d.total_weight_percentage)      ── STEP 1
          │     │
          │     └── d3.treemap<HoldingExposureResponse>()
          │           .size([width, height])
          │           .paddingInner(2)                          ── STEP 2
          │                 │
          │                 ▼
          │     leaves: { x0, y0, x1, y1, data: HoldingExposureResponse }[]
          │
          └── render one <rect> per leaf inside a width-measured <svg>  ── STEP 3
                    │
                    ├── fill: roman-terracotta when total_weight_percentage > 10,
                    │   else roman-gold (same binary rule as HoldingsBarChart)
                    │
                    ├── <text> label rendered only when the rect is large
                    │   enough to hold it legibly; omitted otherwise
                    │
                    └── <title> child on every <rect> — native hover tooltip
                        with stock name, ticker/ISIN, and exact percentage
```

### Why `d3-hierarchy` alone, not a full charting library

Only the `treemap()` layout algorithm is needed — it computes rectangle geometry from a value per leaf, nothing else. `d3-hierarchy` ships this without any DOM rendering, animation, or scale/axis machinery, so the component still renders as plain React `<svg>`/`<rect>` elements styled with the existing Tailwind `roman-*` tokens, matching `HoldingsBarChart`'s approach and keeping the `≥ 90` Lighthouse budget the RFC calls out as a specific risk for this task.

### Why layout is computed in a plain function, not inside the component body

`buildTreemapLayout` is a pure function (`holdings`, `width`, `height` in → array of positioned leaves out), matching the `topHoldings`/`scaleMax` pattern already established in `HoldingsBarChart.tsx` — keeps the geometry math unit-testable in isolation from React rendering, and lets the component wrap the call in `useMemo`.

---

## Tech Stack

| Package | Version | Justification |
| --- | --- | --- |
| `d3-hierarchy` | `^3.1.2` | Provides only the `treemap()` layout algorithm (no rendering/animation runtime) needed to compute rectangle geometry scaled by `total_weight_percentage`; RFC-mandated over a full charting library to protect the ≥ 90 Lighthouse budget. |
| `@types/d3-hierarchy` (dev) | `^3.1.7` | `d3-hierarchy` does not ship its own bundled TypeScript types; this project already carries the equivalent split for other untyped packages (e.g. `@types/react`, `@types/node` in `devDependencies`). |

---

## Implementation Details

### Modules / Files

| File | Action | Description |
| --- | --- | --- |
| `frontend/app/(tabularium)/tabularium/portfolio/components/HoldingsTreemap.tsx` | Create | Client component; computes and renders the treemap |
| `frontend/app/(tabularium)/tabularium/portfolio/components/PortfolioPageClient.tsx` | Modify | Mount `<HoldingsTreemap holdings={exposureData.holdings} />` below `HoldingsBarChart` |
| `frontend/package.json` | Modify | Add `d3-hierarchy` to `dependencies`, `@types/d3-hierarchy` to `devDependencies` |
| `frontend/app/(tabularium)/tabularium/portfolio/components/HoldingsBarChart.tsx` | Reuse | No changes; `topHoldings`-style pure-function pattern followed by `buildTreemapLayout` |

---

### Key Functions / Components

```typescript
// frontend/app/(tabularium)/tabularium/portfolio/components/HoldingsTreemap.tsx

import { hierarchy, treemap, type HierarchyRectangularNode } from 'd3-hierarchy'
import type { HoldingExposureResponse } from './PortfolioPageClient'

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
 * @param holdings - Full look-through exposure list from GET /portfolio/holdings/exposure.
 * @param width - Available layout width in pixels.
 * @param height - Available layout height in pixels.
 * @returns Positioned leaves, one per holding, each carrying x0/y0/x1/y1 and the source holding.
 */
function buildTreemapLayout(
  holdings: HoldingExposureResponse[],
  width: number,
  height: number,
): HierarchyRectangularNode<HoldingExposureResponse>[]
```

```typescript
// frontend/app/(tabularium)/tabularium/portfolio/components/HoldingsTreemap.tsx

'use client'

/**
 * Renders all holdings as a treemap, area-scaled by total_weight_percentage.
 *
 * Complements HoldingsBarChart (top 10-15 only) with a full-portfolio view.
 * Layout is recomputed via useMemo when `holdings` changes; rendering is
 * plain SVG <rect>/<text>, no charting library. Renders an empty-state
 * message when `holdings` is empty, matching HoldingsBarChart's pattern.
 *
 * @param holdings - Full look-through exposure list from
 *                   GET /portfolio/holdings/exposure, passed by
 *                   PortfolioPageClient.
 */
export function HoldingsTreemap({
  holdings,
}: {
  holdings: HoldingExposureResponse[]
}): JSX.Element
```

```typescript
// frontend/app/(tabularium)/tabularium/portfolio/components/HoldingsTreemap.tsx

const LABEL_MIN_WIDTH_PX = 48
const LABEL_MIN_HEIGHT_PX = 24

/**
 * Decides whether a leaf's rectangle is large enough to hold a legible
 * <text> label.
 *
 * Applied per-leaf after layout so small slivers stay unlabeled (but
 * remain hoverable via the <title> tooltip on every rect) instead of
 * rendering truncated or overlapping text.
 *
 * @param node - A positioned leaf from buildTreemapLayout.
 * @returns True when both the leaf's width and height clear the minimum thresholds.
 */
function canFitLabel(node: HierarchyRectangularNode<HoldingExposureResponse>): boolean {
  return (node.x1 - node.x0) >= LABEL_MIN_WIDTH_PX && (node.y1 - node.y0) >= LABEL_MIN_HEIGHT_PX
}

/**
 * Returns the Tailwind fill class for a leaf, matching the same
 * `> 10` warning rule already applied by ConcentrationAlertBadge and
 * HoldingsBarChart.
 *
 * @param totalWeightPercentage - The holding's total_weight_percentage.
 * @returns 'fill-roman-terracotta' when > 10, else 'fill-roman-gold'.
 */
function treemapCellFill(totalWeightPercentage: number): string {
  return totalWeightPercentage > 10 ? 'fill-roman-terracotta' : 'fill-roman-gold'
}
```

`HoldingsTreemap` measures its own container width via a `ResizeObserver` (no fixed pixel width hardcoded), and renders the `<svg>` with `viewBox={`0 0 ${width} ${height}`}` and `width="100%"` so it scales fluidly at any viewport — the same "derive from the DOM" approach already used elsewhere in this codebase (e.g. `brokerLogoPath`'s runtime lookup pattern), rather than a fixed desktop-only size.

---

### Data Models / Schemas

No new schema — `HoldingsTreemap` consumes the existing `HoldingExposureResponse` interface exported from `PortfolioPageClient.tsx` (see [70-dashboard-data-wiring.md](70-dashboard-data-wiring.md)). No changes to that interface are required for this task.

---

### Testing Strategy

**Manual verification (no existing frontend unit-test harness for this route):**

```bash
just frontend-dev
# Navigate to http://localhost:3000/tabularium/portfolio
```

Verify:

- Every holding renders as exactly one non-overlapping rectangle, area-proportional to `total_weight_percentage`.
- The largest holding's rectangle is visibly the largest area on screen; a sub-1% holding still renders a (tiny, unlabeled) hoverable rectangle rather than disappearing.
- Cells above 10% render in `roman-terracotta`, others in `roman-gold` — same rule, same colours as `ConcentrationAlertBadge`/`HoldingsBarChart`.
- Only rectangles clearing `LABEL_MIN_WIDTH_PX`/`LABEL_MIN_HEIGHT_PX` show a `<text>` label; smaller ones don't show truncated/overlapping text.
- Hovering any cell — labeled or not — surfaces the stock's name, ticker/ISIN, and exact percentage via its `<title>`.
- The treemap renders an empty-state message (not a crash) when `holdings` is `[]`.
- Resizing the browser window (or viewing on a narrow/mobile viewport) reflows the treemap fluidly via the `ResizeObserver`-driven `viewBox`, with no fixed-width overflow or clipped rectangles.
- `lhci autorun` (`.lighthouserc.js`) still scores `/tabularium/portfolio` ≥ 90 after adding `d3-hierarchy` — this is the RFC's explicitly called-out risk for this task, not a generic regression check.

**Edge cases:**

- `holdings.length === 0` → empty-state message, no call into `d3.hierarchy()` with an empty children array.
- A single holding → treemap renders one rectangle filling the entire area (100%), with its own label since it easily clears the minimum size.
- Multiple holdings with identical `total_weight_percentage` → `d3-hierarchy`'s default ordering is stable but not guaranteed sorted; confirm no jitter/reflow on re-render with the same input.
- A holding with `total_weight_percentage` of exactly `0` (theoretically possible if OpenFIGI/aggregation rounding underflows) → excluded from layout per `buildTreemapLayout`'s stated behaviour, not rendered as a zero-area rectangle.
- `total_weight_percentage` exactly `10` → renders `fill-roman-gold`, not the warning colour (strict `> 10`, matching TASK-2's boundary decision).
- Container resized to a very narrow width (mobile) → `canFitLabel` naturally suppresses more labels as rectangles shrink; no separate mobile code path is exercised because none exists by design.

---

### Decisions

- [x] **Cell coloring scheme:** Reuse the same binary `total_weight_percentage > 10` warning/default split as `ConcentrationAlertBadge` and `HoldingsBarChart` (`roman-terracotta` vs `roman-gold`), not a continuous sequential scale. Rationale: the dashboard already has one established visual grammar for "this stock is a concentration risk" — introducing a second, continuous color language for the same underlying signal in the same page would read as inconsistent, cost extra bundle weight (a d3 color scale + legend), and add a design decision (which scale, how many stops) nothing in the RFC asks for. The strict `> 10` boundary matches the decision already recorded in [70-dashboard-data-wiring.md](70-dashboard-data-wiring.md).
- [x] **Interactivity definition:** A native SVG `<title>` element per rectangle, surfacing stock name, ticker/ISIN, and exact `total_weight_percentage` on hover — no click-to-drill-in. Rationale: `<title>` costs zero extra JS or bundle weight (it's a browser-native tooltip), which matters directly for the Lighthouse-budget risk this task itself calls out. Click-to-drill-in would duplicate the `contributions` breakdown that TASK-4's Detailed Table already owns exclusively (per the RFC's own reasoning for giving the table its own row-expansion UI) — the treemap's job is the at-a-glance macro view, not per-stock investigation.
- [x] **Small-slice legibility:** No minimum rectangle size and no "long tail" bucket — every holding gets its true area-proportional rectangle, per the RFC's explicit "scaled by weight" requirement (flooring a minimum size would misrepresent that scaling, and bucketing introduces a grouping UX nothing in the RFC or planning doc asks for). Instead, `<text>` labels render conditionally: only when a leaf's `x1 - x0` and `y1 - y0` exceed a small pixel threshold (e.g. wide/tall enough for a legible label). Slivers below that threshold render unlabeled but remain hoverable — the `<title>` tooltip from the previous decision is the fallback for exactly this case, so no detail is ever fully lost.
- [x] **Responsive sizing on mobile:** No special-cased mobile fallback or minimum-viewport gate. The SVG uses a `viewBox` sized to the measured container width (via `ResizeObserver`, following the same "derive from the DOM, don't hardcode" spirit as `brokerLogoPath`'s runtime lookup) with `width="100%"`, so it scales fluidly at any viewport like any other responsive block on the page — consistent with `PortfolioOverviewTable`'s own `overflow-x-auto` approach of not hard-coding a breakpoint-specific layout. A dedicated mobile redesign is not requested anywhere in the RFC or planning doc, so it is treated as out of scope rather than speculative future-proofing (per this project's Simplicity First guideline), not as an unresolved risk.
