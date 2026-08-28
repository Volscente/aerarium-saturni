# #70: Dashboard Data Wiring, Concentration Alert Badge & Bar Chart

**GitHub Issue:** [70 — Dashboard Data Wiring, Concentration Alert Badge & Bar Chart](https://github.com/Volscente/aerarium-saturni/issues/70)
**GitHub Milestone:** [13-holdings-data-visualisation](https://github.com/Volscente/aerarium-saturni/milestone/11)
**Notion page:** [13 - Holdings Data Visualisation](https://app.notion.com/p/13-Holdings-Data-Visualisation-3a45cc6c0f0780aa8c0cefdebc1eed9c)

---

## Technical Scope

**In scope:**

- `frontend/app/(tabularium)/tabularium/portfolio/page.tsx` — second parallel fetch to `GET /portfolio/holdings/exposure` (`holdings-exposure` cache tag), passed to `PortfolioPageClient` alongside the existing `overviewData` prop
- `frontend/app/(tabularium)/tabularium/portfolio/components/PortfolioPageClient.tsx` — accepts and forwards the new `exposureData` prop; exports `HoldingExposureResponse`/`HoldingContribution`/`HoldingsExposureResponse` TypeScript interfaces mirroring the backend Pydantic schemas
- `frontend/app/(tabularium)/tabularium/portfolio/components/ConcentrationAlertBadge.tsx` — new component
- `frontend/app/(tabularium)/tabularium/portfolio/components/HoldingsBarChart.tsx` — new component

**Out of scope:**

- Backend aggregation endpoint, ISIN resolution, and response schemas — already delivered in [#69](https://github.com/Volscente/aerarium-saturni/issues/69) ([69-look-through-exposure-aggregation-engine.md](69-look-through-exposure-aggregation-engine.md))
- Interactive Treemap (`HoldingsTreemap.tsx`, `d3-hierarchy` dependency) — tracked separately under TASK-3
- Detailed Table (`HoldingsExposureTable.tsx`) — tracked separately under TASK-4
- Any new Tabularium route — this ships inside the existing `/tabularium/portfolio` page

---

## Architecture

```txt
frontend/app/(tabularium)/tabularium/portfolio/page.tsx  (Server Component)
          │
          ├── fetch GET /portfolio/overview   { tags: ['portfolio-overview'] }   ── existing
          │
          └── fetch GET /portfolio/holdings/exposure  { tags: ['holdings-exposure'] }   ── NEW, parallel
                    │
                    ▼
          <PortfolioPageClient overviewData exposureData>   ('use client')
                    │
                    ├── <ConcentrationAlertBadge holdings={exposureData.holdings} />   ── always mounted, top of page body
                    │         picks max(total_weight_percentage) row
                    │
                    ├── <HoldingsBarChart holdings={exposureData.holdings} />          ── top 10-15 by total_weight_percentage
                    │         plain SVG/HTML bars, 10% threshold marker
                    │
                    └── <PortfolioOverviewTable rows={overviewData.rows} />            ── existing, unchanged
```

### Why one combined fetch round-trip, not two client-side requests

`portfolio/page.tsx` already fetches `GET /portfolio/overview` server-side with a cache tag; adding `GET /portfolio/holdings/exposure` as a second parallel `fetch` in the same Server Component keeps both requests off the client bundle and lets `revalidateTag('holdings-exposure')` invalidate it independently later (e.g. from a future holdings-upload action), following the exact pattern `etf-registry/page.tsx` already uses for its own `etfs` tag.

### Why the badge and bar chart derive their own view from one shared prop

Both components read the same `holdings: HoldingExposureResponse[]` array and derive what they need in-component (`Array.prototype.reduce` for the max row, `slice(0, 15)` for the top bars) rather than the page pre-computing two separate props — this mirrors `PortfolioOverviewTable`'s existing pattern of deriving `sortedRows`/`totals` via `useMemo` from a single `rows` prop, not the Server Component doing view-specific shaping.

---

## Tech Stack

No new packages required — both components render plain SVG/HTML, consistent with the RFC's decision to avoid a charting library.

---

## Implementation Details

### Modules / Files

| File | Action | Description |
| --- | --- | --- |
| `frontend/app/(tabularium)/tabularium/portfolio/page.tsx` | Modify | Add parallel `fetchHoldingsExposure()` call (mirrors existing `fetchPortfolioOverview()`); pass result to `PortfolioPageClient` as `exposureData` |
| `frontend/app/(tabularium)/tabularium/portfolio/components/PortfolioPageClient.tsx` | Modify | Add `exposureData: HoldingsExposureResponse` prop; export `HoldingContribution`, `HoldingExposureResponse`, `HoldingsExposureResponse` interfaces; render `ConcentrationAlertBadge` and `HoldingsBarChart` above the existing `PortfolioOverviewTable`; render a one-line `skipped_etfs` advisory when non-empty |
| `frontend/app/(tabularium)/tabularium/portfolio/components/ConcentrationAlertBadge.tsx` | Create | Client component; renders the single highest-`total_weight_percentage` holding |
| `frontend/app/(tabularium)/tabularium/portfolio/components/HoldingsBarChart.tsx` | Create | Client component; renders top 10-15 holdings as horizontal bars with a 10% threshold marker |
| `frontend/app/(tabularium)/tabularium/portfolio/components/PortfolioOverviewTable.tsx` | Reuse | No changes; existing `perfClass`/`roman-*` styling conventions followed by the two new components |

---

### Key Functions / Components

```typescript
// frontend/app/(tabularium)/tabularium/portfolio/page.tsx

/**
 * Fetches look-through single-stock exposure from the backend.
 *
 * Mirrors fetchPortfolioOverview(): swallows fetch/response errors and
 * returns an empty result so the page still renders when the backend
 * or the aggregation endpoint is unavailable.
 *
 * @returns HoldingsExposureResponse, or { holdings: [], skipped_etfs: [] } on failure.
 */
async function fetchHoldingsExposure(): Promise<HoldingsExposureResponse>
```

```typescript
// frontend/app/(tabularium)/tabularium/portfolio/components/ConcentrationAlertBadge.tsx

'use client'

/**
 * Renders the single largest look-through exposure across all holdings.
 *
 * Picks the row with the maximum total_weight_percentage from `holdings`
 * (already sorted DESC by the backend, but reduced defensively rather than
 * assuming order). Renders nothing when `holdings` is empty. Applies
 * warning styling (text-roman-terracotta) when the top exposure is
 * strictly greater than 10% (total_weight_percentage > 10) — a stock
 * sitting exactly at the 10% line reads as "at the limit", not yet "over" it.
 *
 * @param holdings - Full look-through exposure list from GET /portfolio/holdings/exposure.
 */
export function ConcentrationAlertBadge({
  holdings,
}: {
  holdings: HoldingExposureResponse[]
}): JSX.Element | null
```

```typescript
// frontend/app/(tabularium)/tabularium/portfolio/components/HoldingsBarChart.tsx

'use client'

/**
 * Renders the top 10-15 holdings by total_weight_percentage as horizontal
 * bars (plain div/SVG, no charting library), with a vertical marker at the
 * 10% threshold. Bars whose total_weight_percentage is strictly greater
 * than 10 use the existing roman-terracotta warning colour token instead
 * of roman-gold — same `> 10` rule as ConcentrationAlertBadge.
 *
 * @param holdings - Full look-through exposure list from GET /portfolio/holdings/exposure.
 */
export function HoldingsBarChart({
  holdings,
}: {
  holdings: HoldingExposureResponse[]
}): JSX.Element
```

---

### Data Models / Schemas

```typescript
// frontend/app/(tabularium)/tabularium/portfolio/components/PortfolioPageClient.tsx
// Mirrors backend/src/backend/schemas/portfolio.py — HoldingContribution / HoldingExposureResponse / HoldingsExposureResponse

export interface HoldingContribution {
  etf_ticker: string
  etf_name: string
  contribution_weight_percentage: number
  snapshot_date: string
}

export interface HoldingExposureResponse {
  stock_isin: string | null
  stock_ticker: string | null
  stock_name: string
  total_weight_percentage: number
  contributions: HoldingContribution[]
}

export interface HoldingsExposureResponse {
  holdings: HoldingExposureResponse[]
  skipped_etfs: string[]
}
```

`PortfolioPageClient` renders a minimal advisory line when `exposureData.skipped_etfs.length > 0`, directly above `ConcentrationAlertBadge`:

```tsx
// frontend/app/(tabularium)/tabularium/portfolio/components/PortfolioPageClient.tsx

{exposureData.skipped_etfs.length > 0 && (
  <p className="text-sm text-roman-stone">
    Excluded from concentration analysis (no price data): {exposureData.skipped_etfs.join(', ')}
  </p>
)}
```

This is a one-line conditional in the page container, not a new component — the full per-stock/per-ETF breakdown these tickers would otherwise appear in is TASK-4's Detailed Table, but silently dropping them here would misrepresent the badge/bar chart as reflecting 100% of the owned ETFs when it does not (see Decisions below).

---

### Testing Strategy

**Manual verification (no existing frontend unit-test harness for this route — `PortfolioOverviewTable` and `EtfRegistryTable` have none either):**

```bash
just frontend-dev
# Navigate to http://localhost:3000/tabularium/portfolio
```

Verify:

- `ConcentrationAlertBadge` renders the correct top stock and percentage against a known `GET /portfolio/holdings/exposure` fixture response.
- Warning styling (roman-terracotta) appears only when the top exposure is above 10%.
- `HoldingsBarChart` shows at most 15 bars, ordered by `total_weight_percentage` descending, with the 10% marker positioned correctly.
- Bars above the 10% threshold render in the warning colour; bars below render in the default `roman-gold`.
- Both components render an empty/neutral state (no crash) when `holdings` is `[]` — e.g. before any ETF holdings have been uploaded.
- `lhci autorun` (`.lighthouserc.js`) still scores `/tabularium/portfolio` ≥ 90 after the two new components are added — no new client-side dependency is introduced, so this is a regression check, not a new risk.

**Edge cases:**

- `holdings.length === 0` → badge renders nothing (or an explicit "No holdings data" state); bar chart renders an empty state, not a crash on `Math.max` over an empty array.
- Fewer than 10 holdings exist → bar chart renders all of them, not padded to a fixed count.
- `total_weight_percentage` exactly `10` → below the `> 10` warning threshold (see Decisions below); renders in the default `roman-gold`, not the warning colour.
- A holding with `stock_isin: null` (residual ticker-only fallback from [#69](https://github.com/Volscente/aerarium-saturni/issues/69)) — badge/bar chart must key React lists on `stock_ticker` fallback, not assume `stock_isin` is always present.
- `exposureData.skipped_etfs` non-empty → the advisory line renders above the badge; `holdings` can still be non-empty at the same time (partial skip, not all-or-nothing).

---

### Decisions

- [x] **10% threshold boundary:** `total_weight_percentage > 10` (strict). The RFC's own wording — "exceeds 10%", "bars **crossing** the threshold" — reads as strictly-greater-than: a stock sitting exactly at 10% is at the limit, not over it. Applied identically in `ConcentrationAlertBadge` and `HoldingsBarChart` so the two components never disagree on which stocks are "in warning."
- [x] **`skipped_etfs` surfacing:** Render a single conditional advisory line in `PortfolioPageClient` (`Excluded from concentration analysis (no price data): <tickers>`) when `skipped_etfs.length > 0`, rather than silently dropping it or deferring all visibility to TASK-4. Rationale: the badge and bar chart otherwise imply full coverage of the owned portfolio; a priceless ETF being silently excluded from a "concentration risk" surface is exactly the kind of silent gap the RFC's Risks table already flags for staleness (`snapshot_date` visibility) — the same principle applies to completeness. TASK-4's Detailed Table remains the place for the full per-stock/per-ETF breakdown; this is only a one-line completeness signal, not a duplication of that table.
