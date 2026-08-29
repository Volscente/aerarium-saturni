# #70: Detailed Table

**GitHub Issue:** [70 — Concentration Dashboard UI](https://github.com/Volscente/aerarium-saturni/issues/70)
**GitHub Milestone:** [13-holdings-data-visualisation](https://github.com/Volscente/aerarium-saturni/milestone/11)
**Notion page:** [13 - Holdings Data Visualisation](https://app.notion.com/p/13-Holdings-Data-Visualisation-3a45cc6c0f0780aa8c0cefdebc1eed9c)

---

## Technical Scope

**In scope:**

- `frontend/app/(tabularium)/tabularium/portfolio/components/HoldingsExposureTable.tsx` — new component
- `frontend/app/(tabularium)/tabularium/portfolio/components/PortfolioPageClient.tsx` — mount `<HoldingsExposureTable>` below `HoldingsTreemap` and above `PortfolioOverviewTable`; a minimal, unavoidable integration step so the new component actually renders — no other change to this file

**Out of scope:**

- Backend aggregation endpoint, ISIN resolution, and response schemas — already delivered in [#69](https://github.com/Volscente/aerarium-saturni/issues/69) ([69-look-through-exposure-aggregation-engine.md](69-look-through-exposure-aggregation-engine.md))
- `ConcentrationAlertBadge.tsx` / `HoldingsBarChart.tsx` / the `holdings-exposure` data fetch — already delivered under TASK-2 ([70-dashboard-data-wiring.md](70-dashboard-data-wiring.md))
- `HoldingsTreemap.tsx` / `d3-hierarchy` — already delivered under TASK-3 ([70-interactive-tree-map.md](70-interactive-tree-map.md))
- Any new Tabularium route — this ships inside the existing `/tabularium/portfolio` page
- Any additional data fetch — this component reads only the `holdings` (and per-row `contributions`) already present in the `exposureData` prop; no per-row network call, unlike `EtfRegistryTable`'s lazy `fetchPriceHistory`

---

## Architecture

```txt
PortfolioPageClient (exposureData.holdings: HoldingExposureResponse[])
          │
          ▼
    <HoldingsExposureTable holdings={exposureData.holdings} />   ('use client')
          │
          ├── search (single text input)
          │     matches stock_name / stock_ticker / stock_isin, case-insensitive substring
          │
          ├── sort (click a column header — mirrors PortfolioOverviewTable's
          │     handleSort/sortColumn/sortDirection/sortIndicator pattern,
          │     not EtfRegistryTable, which has no header-click sorting)
          │     columns: Ticker | ISIN | Name | Total Weight %
          │     nulls (stock_isin / stock_ticker) always sort last
          │
          └── expand-on-row-click (mirrors EtfRegistryTable's Fragment +
                expandedId + ▸/▾ chevron structure — but no lazy fetch:
                contributions are already present on the holding, so
                expanding just reveals data already in props)
                    │
                    ▼
              <tr> sub-table: one row per HoldingContribution
              (etf_ticker, etf_name, contribution_weight_percentage, snapshot_date)
```

### Why search is a single text input, not per-column filters like `EtfRegistryTable`

The RFC specifies one "searchable" table, not three independent filter fields — `EtfRegistryTable`'s three separate ticker/asset-class/issuer inputs filter three semantically distinct dimensions (identity, category, vendor). Here, `stock_name`, `stock_ticker`, and `stock_isin` are all the *same* dimension (the stock's identity), just spread across fields because at most one of `stock_isin`/`stock_ticker` is populated per row (see [69-look-through-exposure-aggregation-engine.md](69-look-through-exposure-aggregation-engine.md)) — so one query box matching across all three, the way a user would naturally search "by name or ticker or ISIN, whichever I remember," is the more accurate mirror of intent than three boxes that would often be empty for a given row.

### Why sorting mirrors `PortfolioOverviewTable`, not `EtfRegistryTable`

`EtfRegistryTable` has no column-header sorting at all (only filters), so it is not a usable analog for the "sortable" half of this task's requirement. `PortfolioOverviewTable` already established this codebase's sortable-table pattern (`SortColumn` type, `handleSort`, `sortIndicator`, nulls-sort-last comparator) for a table with the same shape of problem — a small, entirely client-side row set with nullable fields — so `HoldingsExposureTable` reuses that pattern rather than inventing a second one.

### Why expansion reads directly from `contributions`, not a lazy fetch

`EtfRegistryTable`'s price history is fetched lazily per row because it lives in a separate table with its own endpoint. `HoldingExposureResponse.contributions` is already a nested array on every row returned by `GET /portfolio/holdings/exposure` (see [69-look-through-exposure-aggregation-engine.md](69-look-through-exposure-aggregation-engine.md)) — there is nothing to fetch. Expansion only needs a `Set<string>`/`string | null` of which row is open, not a `Record<id, data | 'loading' | 'error'>` cache.

---

## Tech Stack

No new packages required — plain HTML `<table>`, matching `PortfolioOverviewTable` and `EtfRegistryTable`.

---

## Implementation Details

### Modules / Files

| File | Action | Description |
| --- | --- | --- |
| `frontend/app/(tabularium)/tabularium/portfolio/components/HoldingsExposureTable.tsx` | Create | Client component; search, sort, and expand-on-click over `holdings` |
| `frontend/app/(tabularium)/tabularium/portfolio/components/PortfolioPageClient.tsx` | Modify | Mount `<HoldingsExposureTable holdings={exposureData.holdings} />` below `HoldingsTreemap` |
| `frontend/app/(tabularium)/tabularium/portfolio/components/PortfolioOverviewTable.tsx` | Reuse | No changes; `SortColumn`/`handleSort`/`sortIndicator`/nulls-last pattern followed by this table |
| `frontend/app/(tabularium)/tabularium/components/EtfRegistryTable.tsx` | Reuse | No changes; `Fragment` + expand-on-row-click structure followed by this table |

---

### Key Functions / Components

```typescript
// frontend/app/(tabularium)/tabularium/portfolio/components/HoldingsExposureTable.tsx

import type { HoldingExposureResponse } from './PortfolioPageClient'

type SortColumn = 'stock_ticker' | 'stock_isin' | 'stock_name' | 'total_weight_percentage'

/**
 * Returns the stable identity key for a holding.
 *
 * Same fallback order already used by ConcentrationAlertBadge and
 * HoldingsBarChart (stock_isin ?? stock_ticker ?? stock_name), reused
 * here as the row key and the expand/collapse identifier.
 *
 * Args:
 *   holding: A single look-through exposure row.
 *
 * Returns:
 *   A non-null string uniquely identifying the row within the response.
 */
function holdingKey(holding: HoldingExposureResponse): string

/**
 * Filters holdings by a case-insensitive substring match against
 * stock_name, stock_ticker, and stock_isin.
 *
 * A holding matches if ANY of the three fields contains the query;
 * null identifier fields are skipped, not treated as a match for an
 * empty query. An empty/whitespace-only query returns all holdings
 * unfiltered.
 *
 * Args:
 *   holdings: Full look-through exposure list.
 *   query: The current search box value.
 *
 * Returns:
 *   The subset of holdings matching the query.
 */
function searchHoldings(
  holdings: HoldingExposureResponse[],
  query: string,
): HoldingExposureResponse[]

/**
 * Sorts holdings by the given column in the given direction.
 *
 * Mirrors PortfolioOverviewTable's sortRows: null values (stock_isin,
 * stock_ticker) always sort last in both directions; returns a new
 * array without mutating the input.
 *
 * Args:
 *   holdings: Holdings to sort (typically the already-searched subset).
 *   column: Column key to sort by, or null for no sort.
 *   direction: Sort direction.
 *
 * Returns:
 *   New sorted array.
 */
function sortHoldings(
  holdings: HoldingExposureResponse[],
  column: SortColumn | null,
  direction: 'asc' | 'desc',
): HoldingExposureResponse[]
```

```typescript
// frontend/app/(tabularium)/tabularium/portfolio/components/HoldingsExposureTable.tsx

'use client'

/**
 * Searchable, sortable table of all look-through holdings, with
 * per-row expansion revealing the contributing ETFs.
 *
 * Owns searchQuery, sortColumn/sortDirection, and expandedKeys
 * (Set<string>) state — independent multi-row expansion, not a single
 * expandedId, since there is no fetch cost here to bound (see Decisions).
 * Search and sort are applied client-side via useMemo (searchHoldings
 * then sortHoldings) — no additional network requests. Clicking a row
 * toggles its contributions sub-table open/closed independently of any
 * other expanded row; contributions are already present on the holding
 * (no lazy fetch, unlike EtfRegistryTable's price history expansion).
 * Renders its own card with its own heading, matching HoldingsBarChart/
 * HoldingsTreemap/PortfolioOverviewTable's convention (see Decisions).
 * Renders an empty-state message when holdings is empty, and a distinct
 * "no matches" message when a search query matches nothing.
 *
 * Args:
 *   holdings: Full look-through exposure list from
 *             GET /portfolio/holdings/exposure, passed by
 *             PortfolioPageClient.
 *
 * Returns:
 *   JSX table with search input, sortable thead, and expandable tbody rows.
 */
export function HoldingsExposureTable({
  holdings,
}: {
  holdings: HoldingExposureResponse[]
}): JSX.Element
```

---

### Data Models / Schemas

No new schema — `HoldingsExposureTable` consumes the existing `HoldingExposureResponse`/`HoldingContribution` interfaces exported from `PortfolioPageClient.tsx` (see [70-dashboard-data-wiring.md](70-dashboard-data-wiring.md)). No changes to those interfaces are required for this task.

Contribution sub-table columns, straight from `HoldingContribution`:

| Column | Field |
| --- | --- |
| ETF | `etf_ticker` (primary) — `etf_name` shown alongside or on hover |
| Contribution | `contribution_weight_percentage` |
| As of | `snapshot_date` |

---

### Testing Strategy

**Manual verification (no existing frontend unit-test harness for this route):**

```bash
just frontend-dev
# Navigate to http://localhost:3000/tabularium/portfolio
```

Verify:

- Typing in the search box filters rows by partial, case-insensitive match against name, ticker, or ISIN; clearing it restores the full list.
- Clicking each of the four sortable column headers (Ticker, ISIN, Name, Total Weight %) toggles ascending/descending and updates the `▲`/`▼`/`↕` indicator, matching `PortfolioOverviewTable`'s existing indicator convention.
- Rows with a null `stock_isin` or `stock_ticker` always sort to the bottom of that column's sort, in both directions.
- Clicking a row expands a sub-table listing every `HoldingContribution` (ETF ticker/name, contribution weight, snapshot date); clicking again collapses it; expanding a second row does not require re-collapsing the first — independent multi-row expansion is the intended UX here (see Decisions below), unlike `EtfRegistryTable`'s single `expandedEtfId`.
- The table renders a "No holdings data available." message when `holdings` is empty, and a distinct "No stocks match your search." message when a query matches zero rows.
- No additional network request fires when expanding a row (open the Network tab — contributions render from props alone).

**Edge cases:**

- `holdings.length === 0` → empty-state message, no table chrome rendered.
- Search query matches zero rows → distinct message from the true-empty state above, so a user can tell "no data" apart from "no matches."
- A holding with an empty `contributions` array (should not occur per the aggregation's own invariants, but not structurally impossible) → expanding it renders no sub-rows rather than crashing.
- Sorting by `total_weight_percentage` while a search query is active → sort applies to the already-filtered subset, not the full list.
- A holding with both `stock_isin` and `stock_ticker` present (the majority case after TASK-1's OpenFIGI backfill) → search matches on either field; sorting by ISIN and by Ticker can therefore produce different row orders for the same holding relative to others still missing one identifier.

---

### Decisions

- [x] **Multiple rows expanded at once:** `HoldingsExposureTable` uses independent multi-row expansion (`expandedKeys: Set<string>`), not `EtfRegistryTable`'s single `expandedEtfId: string | null`. Rationale: `EtfRegistryTable`'s single-expand constraint exists to bound its lazy per-row `fetchPriceHistory` network call and its `Record<id, data | 'loading' | 'error'>` cache — neither applies here, since `contributions` is already in props (see "Why expansion reads directly from `contributions`" above). With that constraint gone, restricting to one open row at a time would only get in the way of this table's own stated Goal — investigating "exactly which ETFs contribute to *any* stock's" exposure naturally extends to comparing more than one stock's contributions side by side in the same session.
- [x] **Table placement relative to `PortfolioOverviewTable`:** No new divider or section heading is needed. Every existing component in this stack — `HoldingsBarChart` ("Top Holdings by Look-Through Exposure"), `HoldingsTreemap` ("Portfolio Holdings Treemap"), and `PortfolioOverviewTable` ("Portfolio Overview") — already renders as its own visually distinct card (`rounded-2xl border ... bg-white/5 dark:bg-roman-obsidian/50 p-6 backdrop-blur-sm`) with its own heading; only `ConcentrationAlertBadge` omits a heading, being a single-line callout by design. `HoldingsExposureTable` follows this same established convention — its own card, its own heading (e.g. "Look-Through Exposure by Stock") — which already gives it clear visual separation from `PortfolioOverviewTable` below it. The stack was never actually undifferentiated; no `PortfolioPageClient`-level change is needed beyond the one-line mount already specified.
