# #issue-000: Dashboard Alert Banner & Badge

**GitHub Issue:** [issue-000 — Dashboard Alert Banner & Badge](https://github.com/Volscente/aerarium-saturni/issues/issue-000)
**GitHub Milestone:** Dashboard Alert Banner & Badge

---

## Technical Scope

**In scope:**

- `frontend/app/(tabularium)/tabularium/portfolio/components/RiskAlertPanel.tsx` — new component
- `frontend/app/(tabularium)/tabularium/portfolio/utils/concentrationAlerts.ts` — new shared helper
- `frontend/app/(tabularium)/tabularium/portfolio/components/PortfolioPageClient.tsx` — mount `<RiskAlertPanel>`; export `RiskAlert` interface; `alerts` field on `HoldingsExposureResponse`; pass `alerts` down to the three components below
- `frontend/app/(tabularium)/tabularium/portfolio/components/ConcentrationAlertBadge.tsx`, `HoldingsBarChart.tsx`, `HoldingsTreemap.tsx` — replace each component's local `total_weight_percentage > WARNING_THRESHOLD_PCT` comparison with a membership check against the backend's alert list

**Out of scope:**

- Computing the alerts themselves — depends on TASK-2's `alerts` field already existing on `HoldingsExposureResponse`
- The cache-invalidation fix — TASK-1; this task renders whatever `exposureData.alerts` the page fetch returns, however fresh that happens to be
- `HoldingsExposureTable.tsx` — the Detailed Table's own coloring/threshold logic isn't touched by this task; it currently has no warning-coloring of its own to consolidate (it renders raw percentages, not colored bars/cells)

---

## Architecture

```txt
PortfolioPageClient (exposureData: HoldingsExposureResponse — now includes `alerts: RiskAlert[]`)
          │
          ├── <RiskAlertPanel alerts={exposureData.alerts} />          ── NEW, mounted above ConcentrationAlertBadge
          │         renders null when alerts.length === 0
          │         collapsed (badge): "⚠ N alerts: X concentration, Y stale holding(s)"
          │         expanded (banner, default when alerts.length > 0): one line per alert.message
          │
          ├── <ConcentrationAlertBadge holdings={...} alerts={exposureData.alerts} />   ── alerts prop ADDED
          ├── <HoldingsBarChart holdings={...} alerts={exposureData.alerts} />          ── alerts prop ADDED
          ├── <HoldingsTreemap holdings={...} alerts={exposureData.alerts} />           ── alerts prop ADDED
          └── <HoldingsExposureTable holdings={...} />                                  ── UNCHANGED

Each of the three components:
          concentratedKeys = concentrationAlerts.concentratedStockKeys(alerts)   ── from new shared util
          isWarning = concentratedKeys.has(<same inline key expression the component already uses>)
          (was: h.total_weight_percentage > WARNING_THRESHOLD_PCT)
```

### Why one new shared util (`concentrationAlerts.ts`), not three local copies

`WARNING_THRESHOLD_PCT` is already independently defined in all three components — duplicating the *new* "check the alert list" logic three times as well would only partially achieve this initiative's stated goal of removing duplication. `frontend/.../portfolio/utils/` already exists and already holds exactly this kind of small, page-scoped, cross-component helper (`brokerLogo.ts`, `perfClass.ts`), so `concentrationAlerts.ts` follows an established pattern rather than introducing a new one.

### Why the bar chart keeps a local constant for its axis marker, not a duplicated comparison

`HoldingsBarChart`'s dashed vertical line and `scaleMax`'s "never below 10" floor are a fixed visual reference position, not a business-rule comparison — after this task, `10` is compared against a stock's `total_weight_percentage` in exactly one place (TASK-2's backend rule); the bar chart's constant only decides *where a gridline is drawn*, and is renamed to make that distinction explicit rather than reading as a second copy of the threshold check.

### Why `RiskAlertPanel` is one component playing both roles, not two

Collapsed-badge / expanded-banner is exactly the interaction already shipped for `ConcentrationAlertBadge` and `HoldingsTreemap` (a clickable `▸`/`▾` header, `useState`-backed). Reusing it here means one component, one state variable, and one visual language for "collapsed summary vs. expanded detail" across the whole page, instead of a separate badge component and a separate banner component that would need to stay in sync with each other's open/closed state.

---

## Tech Stack

No new packages — same `lucide-react` `TriangleAlert` icon and `roman-terracotta` color token already used by `ConcentrationAlertBadge`.

---

## Implementation Details

### Modules / Files

| File | Action | Description |
| --- | --- | --- |
| `frontend/app/(tabularium)/tabularium/portfolio/components/RiskAlertPanel.tsx` | Create | Collapsible alert badge/banner |
| `frontend/app/(tabularium)/tabularium/portfolio/utils/concentrationAlerts.ts` | Create | `concentratedStockKeys(alerts)` shared helper |
| `frontend/app/(tabularium)/tabularium/portfolio/components/PortfolioPageClient.tsx` | Modify | New `RiskAlert` interface; `alerts` field; mount `<RiskAlertPanel>`; pass `alerts` prop to 3 components |
| `frontend/app/(tabularium)/tabularium/portfolio/components/ConcentrationAlertBadge.tsx` | Modify | Accept `alerts` prop; `isWarning` derived from `concentratedStockKeys(alerts)` instead of `WARNING_THRESHOLD_PCT` |
| `frontend/app/(tabularium)/tabularium/portfolio/components/HoldingsBarChart.tsx` | Modify | Accept `alerts` prop; per-bar `isWarning` derived the same way; local threshold constant renamed and scoped to axis-marker placement only |
| `frontend/app/(tabularium)/tabularium/portfolio/components/HoldingsTreemap.tsx` | Modify | Accept `alerts` prop; `treemapCellFill` takes a boolean instead of a raw percentage |

---

### Key Functions / Components

```typescript
// frontend/app/(tabularium)/tabularium/portfolio/utils/concentrationAlerts.ts

import type { RiskAlert } from '../components/PortfolioPageClient'

/**
 * Builds the set of holding identity keys currently flagged by a
 * concentration_risk alert.
 *
 * @param alerts - Full alert list from GET /portfolio/holdings/exposure.
 * @returns A Set of `stock_isin ?? stock_ticker ?? stock_name` keys, matching
 *          the same key convention already used for holdings elsewhere on
 *          this page (ConcentrationAlertBadge's `label`, HoldingsBarChart's/
 *          HoldingsTreemap's `key` props, HoldingsExposureTable's `holdingKey`).
 */
export function concentratedStockKeys(alerts: RiskAlert[]): Set<string> {
  return new Set(
    alerts
      .filter((a) => a.rule === 'concentration_risk')
      .map((a) => a.stock_isin ?? a.stock_ticker ?? a.stock_name ?? '')
      .filter((key) => key !== ''),
  )
}
```

```typescript
// frontend/app/(tabularium)/tabularium/portfolio/components/RiskAlertPanel.tsx

'use client'

/**
 * Collapsible risk-alert badge/banner.
 *
 * Renders nothing when alerts is empty. Collapsed state (the "badge") shows
 * a one-line count summary; expanded state (the "banner") lists every
 * alert.message. Defaults to expanded — an active warning should not require
 * an extra click to see, mirroring why ConcentrationAlertBadge itself
 * defaults open. Uses the same ▸/▾ clickable-header pattern already shipped
 * for ConcentrationAlertBadge/HoldingsTreemap, and the same roman-terracotta
 * warning color / TriangleAlert icon already used by ConcentrationAlertBadge.
 *
 * @param alerts - Full alert list from GET /portfolio/holdings/exposure.
 */
export function RiskAlertPanel({ alerts }: { alerts: RiskAlert[] }): JSX.Element | null
```

```typescript
// frontend/app/(tabularium)/tabularium/portfolio/components/HoldingsTreemap.tsx — signature change only

function treemapCellFill(isConcentrationAlert: boolean): string {
  /**
   * Returns the Tailwind fill class for a leaf.
   *
   * Was: compared totalWeightPercentage against a local WARNING_THRESHOLD_PCT.
   * Now: takes the caller's precomputed alert-membership check directly, so
   * the >10 comparison itself lives only in the backend's RiskAlert derivation.
   *
   * @param isConcentrationAlert - Whether this holding's key is present in
   *                               concentratedStockKeys(alerts).
   * @returns 'fill-roman-terracotta' when flagged, else 'fill-roman-gold'.
   */
  return isConcentrationAlert ? 'fill-roman-terracotta' : 'fill-roman-gold'
}
```

---

### Data Models / Schemas

```typescript
// frontend/app/(tabularium)/tabularium/portfolio/components/PortfolioPageClient.tsx — additions

export interface RiskAlert {
  rule: 'concentration_risk' | 'data_freshness_risk'
  message: string
  stock_isin: string | null
  stock_ticker: string | null
  stock_name: string | null
  total_weight_percentage: number | null
  etf_ticker: string | null
  etf_name: string | null
  snapshot_date: string | null
  days_stale: number | null
}

export interface HoldingsExposureResponse {
  holdings: HoldingExposureResponse[]
  skipped_etfs: string[]
  alerts: RiskAlert[]
}
```

---

### Testing Strategy

**Manual verification (no existing frontend unit-test harness for this route, consistent with every other component on this page):**

```bash
just frontend-dev
# Navigate to http://localhost:3000/tabularium/portfolio
```

Verify:

- With no active alerts: `RiskAlertPanel` renders nothing (not an empty card).
- With at least one active alert: the panel renders expanded by default, listing every `alert.message`; clicking its header collapses it to the one-line summary, clicking again re-expands.
- A stock flagged by a `concentration_risk` alert renders in `roman-terracotta` in the Badge, the Bar Chart, and the Treemap — all three agreeing, since all three now read the same backend-provided list.
- A stock at exactly 10% (not flagged, per TASK-2's strict `>` rule) still renders in the default `roman-gold` color in all three components — confirms the frontend isn't accidentally re-introducing its own `>=` or `>` comparison anywhere.
- The Bar Chart's dashed threshold marker still renders at the same visual position as before this task (its rename to an axis-only constant must not change its rendered location).

**Edge cases:**

- `alerts` containing only `data_freshness_risk` entries (no `concentration_risk`) → `concentratedStockKeys` returns an empty Set; all three components render entirely in `roman-gold`/default coloring, while `RiskAlertPanel` still renders and lists the freshness alert(s).
- A `RiskAlert` whose `stock_isin`/`stock_ticker`/`stock_name` are all null (should not occur per TASK-2's derivation, since every concentration alert is built from an existing `HoldingExposureResponse` that always has at least a `stock_name`) → filtered out of `concentratedStockKeys` by the trailing `.filter((key) => key !== '')` rather than producing a false-positive empty-string match.

---

### Open Questions / Risks

- [ ] **Collapsed-summary wording:** The exact phrasing of the collapsed one-line summary (e.g. "⚠ 2 alerts: 1 concentration, 1 stale holding" vs. a simpler "⚠ 2 active alerts") isn't specified by the RFC beyond "clear, non-intrusive." Any reasonable phrasing satisfies the stated success criteria; pick one during implementation rather than treating this as blocking. **Target:** implementation time.
