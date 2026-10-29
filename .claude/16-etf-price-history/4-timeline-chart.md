# #76: Timeline Chart

**GitHub Issue:** [76 — Registry UI and Timeline Chart](https://github.com/Volscente/aerarium-saturni/issues/76)
**GitHub Milestone:** [16-etf-price-history](https://github.com/Volscente/aerarium-saturni/milestone/12)
**Notion page:** [ETF Price History](https://app.notion.com/p/16-ETF-Price-History-3f65cc6c0f0780ac9bbfe316750fcac2)

---

## Technical Scope

**In scope:**

- `frontend/app/(tabularium)/tabularium/components/TimelineChart.tsx` — new `'use client'` hand-rolled SVG line chart: ETF selection, multi-series overlay, legend, hover tooltip (date and value), rebased-to-100 default with an absolute-price toggle, empty state for ETFs without history; loads series through `fetchPriceHistory` with a client-side per-ETF cache
- `frontend/app/(tabularium)/tabularium/components/RegistryPriceSection.tsx` — new thin `'use client'` wrapper that renders `UpdatePricesButton` and `TimelineChart` together and owns a `priceVersion` counter, so a completed update invalidates the chart's cache
- `frontend/app/(tabularium)/tabularium/components/UpdatePricesButton.tsx` — optional `onUpdated` callback prop, called after a refresh returns results
- `frontend/app/(tabularium)/tabularium/etf-registry/page.tsx` — mounts `RegistryPriceSection` (replacing the bare `UpdatePricesButton`) above `EtfRegistryTable`
- `.lighthouserc.js` — add `/tabularium/etf-registry` to the audited URLs
- `frontend/README.md`, `README.md`, `CLAUDE.md`, `CHANGELOG.md` — document the chart (see Open Questions for the README wording TASK-3 deferred)

**Out of scope:**

- Any backend change: `GET /etfs/{id}/price-history` already returns what the chart needs
- A new Tabularium sub-route: the chart lives in the existing `/tabularium/etf-registry` page
- Adding the chart to `/tabularium/portfolio` (see the Lighthouse note below)
- Date-range presets (1M / 1Y / Max), zoom, brushing, log scale, export
- Downsampling of long series (see Risks)
- Re-introducing any manual price path; `fetchPriceHistory` and `EtfPriceEntry` stay as TASK-3 left them
- Frontend unit-test tooling: the frontend has no test runner, and this task does not add one

---

## Architecture

```txt
etf-registry/page.tsx  (Server Component, fetches GET /etfs, tag "etfs")
          │  etfs: EtfResponse[]
          ▼
RegistryPriceSection({ etfs })          'use client'   owns priceVersion
          │
          ├── UpdatePricesButton({ etfs, onUpdated })
          │         │  refreshEtfPrices() → revalidateTag × 5
          │         └─ onUpdated() → priceVersion += 1
          │
          └── TimelineChart({ etfs, priceVersion })
                    │
                    ├── selection state: Set<etf id>  (default: first ETF)
                    ├── cache: useRef<Map<etf id, SeriesPoint[]>>   cleared when priceVersion changes
                    │
                    │   for each selected id missing from cache
                    │   fetchPriceHistory(id)  ── Server Action ──► GET /etfs/{id}/price-history
                    │         │  EtfPriceEntry[] (price: string, newest first)
                    │         ▼
                    │   toSeries(entries) → SeriesPoint[]   (ascending, one per UTC day, numbers)
                    │
                    ▼
          buildChartModel(series[], mode) → { lines, xDomain, yDomain }
                    │   mode "rebased":  common start → each line / value@start × 100
                    │   mode "absolute": raw close prices
                    ▼
          <svg>  axes + gridlines + one <path> per ETF + hover crosshair
          legend (colour swatch + ticker)  ·  tooltip (date + value per ETF)
EtfRegistryTable({ etfs })
```

### Why a wrapper component instead of two siblings in the page

The chart's cache is client-side and `EtfResponse` carries no "latest price" field, so after `refreshEtfPrices` the chart cannot tell by itself that its cached series are stale: `revalidateTag` re-renders the Server Component, but the `etfs` prop is unchanged. Passing a `priceVersion` counter from one client parent is the smallest mechanism that works. Alternatives rejected: a `latest_price_at` field on `EtfResponse` (backend change, out of scope), and disabling the cache (re-fetches every series on every selection toggle). Tradeoff: one extra component whose only job is to share one number.

### Why rebased-to-100 is computed on the common range

Series of different ETFs start on different dates. Indexing each to 100 at its own first point makes the lines non-comparable. The rebased view therefore starts at the **latest first-date across the selected series** and indexes every series to 100 at its value on that day (or the first available day after it). With one ETF selected, the common range is its own range, so the line starts at 100. Absolute mode plots raw closes over the union of the date ranges.

---

## Tech Stack

No new packages required. The line geometry is a hand-written `path` string and linear scales are plain functions, matching `HoldingsTreemap`'s dependency-minimal precedent. `d3-scale` / `d3-shape` stay the only acceptable additions if the hand-rolled version proves unwieldy; they are not needed for a handful of straight-segment series.

---

## Implementation Details

### Modules / Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `frontend/app/(tabularium)/tabularium/components/TimelineChart.tsx` | Create | Chart component, selection controls, series loading and cache, SVG rendering, tooltip |
| `frontend/app/(tabularium)/tabularium/components/RegistryPriceSection.tsx` | Create | Wrapper holding `priceVersion`; renders `UpdatePricesButton` then `TimelineChart` |
| `frontend/app/(tabularium)/tabularium/components/UpdatePricesButton.tsx` | Modify | Add optional `onUpdated?: () => void`, called when a refresh returns `results` |
| `frontend/app/(tabularium)/tabularium/etf-registry/page.tsx` | Modify | Replace `<UpdatePricesButton etfs={etfs} />` with `<RegistryPriceSection etfs={etfs} />` |
| `frontend/app/(tabularium)/tabularium/etf-actions.ts` | Reuse | `fetchPriceHistory`, `EtfPriceEntry` — do not re-implement |
| `frontend/app/(tabularium)/tabularium/portfolio/components/HoldingsTreemap.tsx` | Reuse (pattern) | `ResizeObserver` container-width measurement and SVG `<title>` approach to follow; not modified |
| `.lighthouserc.js` | Modify | Add `http://localhost:3000/tabularium/etf-registry` to `collect.url` |

---

### Key Functions

All helpers live in `TimelineChart.tsx` (non-exported except the component), following `HoldingsTreemap.tsx`. Docstrings are written during implementation.

```ts
export interface SeriesPoint { date: string; value: number }   // date = UTC "YYYY-MM-DD"

function toSeries(entries: EtfPriceEntry[]): SeriesPoint[]
// Parse price strings to numbers, key by UTC day of `timestamp`, sort ascending.
```

- Notes: the endpoint returns newest-first. Two rows on one UTC day cannot exist after migration 006, but keep the last one per day defensively. Skip entries whose price is not a finite number or whose `currency` is not `EUR` (the refresh path is EUR-only, so only legacy manual rows can be affected).

```ts
type ChartMode = 'rebased' | 'absolute'

interface ChartLine { etfId: string; ticker: string; points: SeriesPoint[] }

function buildChartLines(
  series: { etfId: string; ticker: string; points: SeriesPoint[] }[],
  mode: ChartMode,
): ChartLine[]
// Rebased: cut every series at the common start date and index to 100; absolute: pass through.
```

- Notes: series with no points are excluded from the chart and listed in the empty-state message instead. If the series share no overlapping range (one ends before another begins), rebased mode falls back to each series' own first point and shows a one-line notice.

```ts
function makeScales(
  lines: ChartLine[],
  width: number,
  height: number,
): { x: (date: string) => number; y: (value: number) => number; xTicks: string[]; yTicks: number[] }
// Linear x over dates (by day index) and linear y with ~5% padding, both mapped into the plot box.
```

```ts
function nearestPointIndex(dates: string[], pointerX: number, x: (date: string) => number): number
// Binary search over the sorted date axis for the hover crosshair.
```

```ts
export function TimelineChart(props: TimelineChartProps): JSX.Element
// Selection chips, mode toggle, loading/error/empty states, SVG plot, legend, tooltip.
```

- Notes: selection is stored as a `Set<string>` of ETF ids; ids no longer present in `etfs` (deleted ETF after revalidation) are filtered out on render. Fetches fire in a `useEffect` keyed on the selected ids, skip ids already cached, and run through `useTransition`/local `loading` state; Server Actions are queued by Next.js, so several simultaneous selections load one after another. A failed fetch is stored per ETF as an error and rendered next to its chip, without blocking the other series. Container width comes from a `ResizeObserver`, fixed height.

```ts
// RegistryPriceSection.tsx
export function RegistryPriceSection(props: { etfs: EtfResponse[] }): JSX.Element
// Holds priceVersion, passes bump() to UpdatePricesButton.onUpdated and the version to TimelineChart.
```

---

### Data Models / Schemas

No backend or Zod schema changes. The chart consumes the existing response shape:

```ts
// etf-actions.ts (existing)
interface EtfPriceEntry { id: string; etf_id: string; price: string; currency: string; timestamp: string }
```

```ts
// TimelineChart.tsx
export interface TimelineChartProps {
  etfs: Pick<EtfResponse, 'id' | 'ticker' | 'name'>[]
  priceVersion: number   // increments after each completed price update; clears the series cache
}
```

Visual conventions: line colours come from a fixed palette array derived from the `roman-*` tokens plus enough distinct hues for up to ~6 simultaneous series, assigned by position in the registry list (stable across selection changes); axes and gridlines use `roman-stone`; chart works in the existing light and dark themes via Tailwind `dark:` variants. Series are distinguished by colour **and** by the legend label (and tooltip order) so the chart is not colour-only.

---

### Testing Strategy

No frontend test runner exists, so this task relies on type-checking, a production build and a browser walkthrough; no tests are added (consistent with the TASK-3 approach).

**Static checks:** `npx tsc --noEmit` clean; `npm run build` passes.

**Manual integration test** (throwaway Postgres + backend as in TASK-3, then the production build):

```bash
just run_stack_fresh          # then, from the host: cd backend && uv run alembic upgrade head
just seed_data                # ETFs, holdings, transactions
# open http://localhost:3000/tabularium/etf-registry, press "Update prices"
```

Verify:

- The chart appears above the registry table, showing the first ETF in the registry; after "Update prices", the first ETF's series is drawn without a page reload
- Selecting a second and third ETF overlays them; legend and tooltip list every visible ETF; hover shows the date and the value at the nearest point
- Rebased mode: all lines start at 100 on the same date; toggling to absolute shows raw EUR prices (y-axis labelled EUR)
- An ETF with no stored history (e.g. one whose price symbol failed) shows the empty state and does not break the other lines
- Running "Update prices" again with the chart open refreshes the drawn series (cache invalidation via `priceVersion`)
- Deselecting every ETF shows the "Select an ETF" prompt, not an empty SVG
- Light and dark theme, and a ~375px-wide viewport (no horizontal page scroll)

**Edge cases:**

- Single data point → rendered as a dot, no path; tooltip still works
- Series with different start dates → rebased lines start on the latest first-date
- Non-overlapping ranges → fallback notice, each series rebased to its own start
- Flat series (min = max) → y domain padded so the line is not drawn on the axis
- Row with `currency` other than `EUR` → dropped in `toSeries`; an ETF whose rows are all non-EUR shows the empty state
- Price `"0"` or non-numeric → dropped in `toSeries`; a zero first value in rebased mode excludes that series rather than dividing by zero
- ETF deleted while selected → silently dropped from the selection
- Fetch error for one ETF → error shown next to that chip; other series still render

**Performance check:** `npx lhci autorun` with `/tabularium/etf-registry` added; the performance score must be ≥ 90 on that page and unchanged on `/tabularium/portfolio`.

---

### Documentation updates

- `frontend/README.md`: key components for `TimelineChart` and `RegistryPriceSection`, the `onUpdated` prop on `UpdatePricesButton`, changelog entry
- `README.md` (root): ETF Registry bullets mention the price Timeline Chart (the wording TASK-3 deliberately left out until the chart existed)
- `CLAUDE.md`: routes-table row for `/tabularium/etf-registry` mentions the chart; add `/tabularium/etf-registry` to the Lighthouse invariant list
- `CHANGELOG.md`: new version entry (Added: chart, wrapper, Lighthouse URL; Changed: `UpdatePricesButton`, registry page)

---

### Decisions and Remaining Items

Resolved:

- [x] **Lighthouse target page:** `.lighthouserc.js` adds `/tabularium/etf-registry` and keeps `/tabularium/portfolio` as a regression guard. Both must stay ≥ 90.
- [x] **Default selection:** only the first ETF in the registry is selected on load; the user adds more from the selection chips.
- [x] **Non-EUR rows:** excluded from the chart in `toSeries` (EUR-only, consistent with the refresh rule); no currency conversion, y-axis labelled EUR.
- [x] **Long histories:** accepted as-is, no downsampling. Success criterion at execution: Lighthouse ≥ 90 on `/tabularium/etf-registry` and hover stays responsive with the three seeded ETFs at full history; if either fails, add downsampling then.
- [x] **Cache invalidation coupling:** the `priceVersion` wrapper is the chosen design (see Architecture). Removing it later requires a latest-price field on `EtfResponse`, which is not planned.
- [x] **README wording deferred from TASK-3:** in scope, listed under Documentation updates above.

Deferred:

- [ ] **Provider availability / staleness indicator:** the chart shows whatever was stored last when the provider is down, with no staleness hint. Out of scope. **Target:** revisit after the manual trigger is in use
