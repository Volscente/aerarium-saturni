# #50: Overview Table

**GitHub Issue:** [#50 — Overview Table](https://github.com/Volscente/aerarium-saturni/issues/50)
**GitHub Milestone:** [10-portfolio-overview-dashboard](https://github.com/Volscente/aerarium-saturni/milestone/8)
**Notion page:** [Portfolio Overview Dashboard](https://app.notion.com/p/10-Portfolio-Overview-Dashboard-3865cc6c0f078033920ad103c2d83d9a)

---

## Technical Scope

**In scope:**

- `app/(tabularium)/tabularium/portfolio/components/PortfolioOverviewTable.tsx` — Replace typed placeholder with full interactive table: checkbox selection, master toggle, bidirectional column sorting, dynamic Total footer with weighted return, Share column, performance colour indicators, broker logos with fallback
- `app/(tabularium)/tabularium/portfolio/utils/brokerLogo.ts` — `brokerLogoPath` lookup helper mapping normalised broker platform names to static SVG paths under `/brokers/`
- `app/(tabularium)/tabularium/portfolio/utils/perfClass.ts` — `perfClass` Tailwind colour-class utility for performance values
- `public/brokers/*.svg` — Brand logo static assets; only logos with confirmed permissive licences committed; generic `Building2` fallback for all others

**Out of scope:**

- Backend changes — `GET /portfolio/overview` is already implemented (TASK-1 / [#48](https://github.com/Volscente/aerarium-saturni/issues/48))
- Tab shell, parallel data-fetch, and `revalidateTag` wiring — already implemented (TASK-2 / [#49](https://github.com/Volscente/aerarium-saturni/issues/49))
- `PortfolioRowResponse` / `PortfolioOverviewResponse` TypeScript interface definitions — already exported from `PortfolioPageClient.tsx`
- URL-based tab routing — no new routes; tab state stays in `PortfolioPageClient` via `useState`
- Portfolio metric calculations (TWR, MWR, cost basis) — future analytics initiative

---

## Architecture

```txt
PortfolioPageClient ('use client', existing)
  │  props: overviewData: PortfolioOverviewResponse, etfs: EtfResponse[]
  │  state: activeTab: 'portfolio' | 'etf-registry'
  │
  └── <PortfolioOverviewTable rows={overviewData.rows} />
           │  props: rows: PortfolioRowResponse[]
           │
           ├── State
           │     selected:       Set<string>   ← "${owner}::${broker_platform}"
           │     sortColumn:     SortColumn | null
           │     sortDirection:  'asc' | 'desc'
           │
           ├── Derived (useMemo)
           │     selectedRows   = rows.filter(r => selected.has(rowKey(r)))
           │     selectedTotal  = Σ total_invested of selectedRows
           │     sortedRows     = sortRows(rows, sortColumn, sortDirection)
           │     totals         = computeTotals(selectedRows)
           │
           ├── <thead>
           │     <th> master toggle checkbox
           │           checked = all rows selected; indeterminate = partial
           │     <th> Owner ▲▼ (sortable)
           │     <th> Broker (not sortable — no meaningful order)
           │     <th> Invested ▲▼ (sortable)
           │     <th> Value ▲▼ (sortable, nulls last)
           │     <th> Performance ▲▼ (sorts by performance_pct, nulls last)
           │     <th> Share (not sortable — derived from selection)
           │
           ├── <tbody> (sortedRows)
           │     <td> checkbox — toggles row in/out of selected
           │     <td> row.owner
           │     <td> brokerLogoPath(platform) → <Image> | <Building2 />
           │     <td> formatCurrency(row.total_invested)
           │     <td> row.current_value ? formatCurrency(...) : '—'
           │     <td> perfClass(row.performance_pct) on abs + pct side-by-side
           │           row.performance_abs / row.performance_pct : '—' if null
           │     <td> selected.has(key)
           │           ? (total_invested / selectedTotal * 100).toFixed(2) + '%'
           │           : '—'   ← unselected rows show dash, not 0%
           │
           └── <tfoot> Total row (always visible)
                 total_invested  = Σ selected
                 current_value   = null if any selected row has null current_value,
                                   else Σ selected
                 performance_abs = null if any selected row has null performance_abs,
                                   else Σ selected
                 performance_pct = Σ(performance_abs of non-null rows)
                                   / Σ(total_invested of non-null rows) * 100
                                   (weighted; null rows excluded from both Σ)
                 share           = 100% (always)
```

### Why sorting applies to all rows, not only selected rows

Sorting operates on the full `rows` array before the selection filter so that the visual row order is stable and predictable regardless of which rows are checked. Limiting sort to `selectedRows` would reorder the table on every checkbox click, which is disorienting.

### Why selectedTotal guards against division by zero

When all rows are unchecked, `selectedTotal = 0`. The Share cell falls back to `'—'` instead of attempting `n / 0`, keeping the UI coherent when nothing is selected.

---

## Tech Stack

No new packages required.

- `next/image` — `<Image>` with `onError` prop handles broker logo load failures gracefully
- `lucide-react` — `Building2` icon as the generic broker fallback (already in the project; used by `Footer.tsx` and `AddTransactionButton.tsx`)

---

## Implementation Details

### Modules / Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `app/(tabularium)/tabularium/portfolio/components/PortfolioOverviewTable.tsx` | Edit | Replace typed placeholder with full interactive overview table |
| `app/(tabularium)/tabularium/portfolio/utils/brokerLogo.ts` | Create | `brokerLogoPath` — maps known broker platform names to `/brokers/{slug}.svg` |
| `app/(tabularium)/tabularium/portfolio/utils/perfClass.ts` | Create | `perfClass` — returns Tailwind text-colour class for a numeric performance value |
| `public/brokers/*.svg` | Create | Static SVG brand logos; only licence-verified assets committed |

---

### Key Functions

```typescript
// utils/brokerLogo.ts

/**
 * Maps a broker platform name to its static SVG logo path.
 *
 * Normalises the input to lowercase, strips spaces and hyphens
 * before lookup. Returns null for any unrecognised platform so
 * callers can render the Building2 fallback icon instead.
 *
 * @param platform - The broker_platform string from PortfolioRowResponse.
 * @returns Path to the SVG asset under /brokers/, or null if unknown.
 */
function brokerLogoPath(platform: string): string | null
```

```typescript
// utils/perfClass.ts

/**
 * Returns a Tailwind text-colour class for a performance value.
 *
 * Positive  → 'text-green-600'
 * Negative  → 'text-red-600'
 * Zero/null → 'text-neutral-500'
 *
 * @param value - Performance value (absolute fiat or percentage); null when unavailable.
 * @returns A Tailwind CSS class string.
 */
function perfClass(value: number | null): string
```

```typescript
// PortfolioOverviewTable.tsx — internal helpers

/**
 * Returns a stable unique key for a portfolio row.
 *
 * @param row - A PortfolioRowResponse.
 * @returns "${row.owner}::${row.broker_platform}"
 */
function rowKey(row: PortfolioRowResponse): string

/**
 * Aggregates selected rows into a Total footer object.
 *
 * current_value and performance_abs are null if any row in the
 * selection has a null value — avoids a misleadingly partial total.
 *
 * performance_pct uses a weighted return:
 *   Σ(performance_abs of non-null rows) / Σ(total_invested of non-null rows) * 100
 * Rows with null performance_abs are excluded from both numerator and
 * denominator so partial price coverage does not distort the result.
 *
 * @param rows - The currently selected PortfolioRowResponse rows.
 * @returns Aggregated totals for the tfoot row.
 */
function computeTotals(rows: PortfolioRowResponse[]): {
  total_invested: number
  current_value: number | null
  performance_abs: number | null
  performance_pct: number | null
}

/**
 * Sorts rows by the given column in the given direction.
 *
 * Null values always sort last, in both ascending and descending order.
 * When column is null the original array order is preserved.
 * Returns a new array — does not mutate the input.
 *
 * @param rows - Rows to sort.
 * @param column - Column key to sort by, or null for no sort.
 * @param direction - Sort direction.
 * @returns New sorted array.
 */
function sortRows(
  rows: PortfolioRowResponse[],
  column: keyof PortfolioRowResponse | null,
  direction: 'asc' | 'desc',
): PortfolioRowResponse[]
```

---

### Data Models / Schemas

TypeScript interfaces already defined in `PortfolioPageClient.tsx` (TASK-2); import them from there:

```typescript
interface PortfolioRowResponse {
  owner: string
  broker_platform: string
  total_invested: number
  current_value: number | null
  performance_abs: number | null
  performance_pct: number | null
}

interface PortfolioOverviewResponse {
  rows: PortfolioRowResponse[]
}
```

**Currency formatting** — instantiated once at module level to avoid per-render object construction:

```typescript
const currencyFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
})
// produces: "10.000,00 €"
```

**Percentage formatting:**

```typescript
const pctFormatter = new Intl.NumberFormat('de-DE', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
// input: 0.1023 → "10,23 %"
// Note: performance_pct from the API is already 0–100 scale,
// so divide by 100 before passing to pctFormatter.
```

---

### Testing Strategy

The frontend does not have a Jest / React Testing Library suite. Verification is manual via the dev server.

**Manual smoke test:**

```bash
cd frontend
npm run dev
# → http://localhost:3000/tabularium/portfolio
```

Golden-path checks:

1. "Portfolio" tab is active by default; Overview table renders all rows with correct values.
2. Uncheck one row — Total footer and Share column update instantly with no page reload.
3. Uncheck all rows — Share shows `—`; Total shows `0,00 €`; no console errors.
4. Master toggle: deselects all in one click; re-click reselects all.
5. Click "Invested" header — rows sort ascending; click again — descending. Nulls last.
6. Click "Performance" header — sorts by `performance_pct` ascending; nulls last.
7. A row with `null` `current_value` shows `—` in Value and Performance cells.
8. Total footer `Share` always shows `100%` regardless of selection.
9. Positive `performance_pct` rows have green text; negative have red; null have neutral grey.
10. Known broker platforms render their SVG logo; unknown render `Building2` icon.
11. Run `lhci autorun` — performance score at `/tabularium/portfolio` must remain ≥ 90.

**Edge cases:**

- All rows unchecked → `selectedTotal = 0`; Share cells show `—`; no division by zero
- Single row selected → Share = `100%`; Total equals that row's values exactly
- All `current_value` null → Total footer performance = `—`; `total_invested` still shown
- Mixed null/non-null `performance_abs` → only non-null rows contribute to weighted `performance_pct`; this is intentional and matches the FAQ in the RFC

---

### Open Questions / Risks

- [ ] **`PortfolioRowResponse` numeric types:** Pydantic v2 serialises `Decimal` as JSON numbers by default, but verify with `curl http://localhost:8000/portfolio/overview` before writing the TypeScript interface. If the API returns strings, adjust the interface and formatting logic accordingly. **Target:** first integration run
- [ ] **Broker logo licensing:** SVGs for N26, IBKR, and any other brokers must be sourced from official brand kits only. Any broker without a confirmed permissive licence ships with the `Building2` fallback from day one. **Target:** before committing any SVG to `public/brokers/`. **Answer:** images of logos are in `public/brokers/`. They have jpeg and png extensions and they should be resize to be rendered with the same resolution and dimension.
- [ ] **`de-DE` locale assumption:** The RFC specifies German locale formatting (`10.000,00 €`). Confirm this matches the intended display locale before shipping. If locale should follow the user's browser, defer to a future i18n initiative. **Target:** M3 review. **Answer:** Yes, the German locale formatting is good.
