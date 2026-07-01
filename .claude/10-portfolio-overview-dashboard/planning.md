# Portfolio Overview Dashboard — High-Level Planning

**Project:** Aerarium Saturni
**GitHub repo:** [Volscente/aerarium-saturni](https://github.com/Volscente/aerarium-saturni)
**GitHub Milestone:** [10-portfolio-overview-dashboard](https://github.com/Volscente/aerarium-saturni/milestone/8)
**Notion page:** [Portfolio Overview Dashboard](https://app.notion.com/p/10-Portfolio-Overview-Dashboard-3865cc6c0f078033920ad103c2d83d9a)
**Total estimated effort:** 3 FTE-days (1 FTE = 1 day)

---

## Overview

This initiative adds a Portfolio Overview visualisation to `/tabularium/portfolio` by introducing a tab shell that splits the route into two tabs: a new default "Portfolio" tab showing an interactive aggregation table (Owner × Broker Platform), and an "ETF Registry" tab relocating the existing ETF list. A new `GET /portfolio/overview` FastAPI endpoint provides the aggregated data by joining the existing `transactions`, `etfs`, and `etf_price_history` tables — no schema migrations required.

### Dependency Order

```txt
TASK-1 (Backend Aggregation Endpoint)
  └──► TASK-2 (Portfolio Tab Shell)
         └──► TASK-3 (Overview Table)
```

TASK-2 and TASK-3 can begin in parallel once TASK-1's data shape (`PortfolioRowResponse`) is finalised.

---

## TASK-1 — Backend Aggregation Endpoint

**GitHub Issue:** #{issue}
**Effort estimate:** 1 FTE-day

### Scope

Implement a new `GET /portfolio/overview` FastAPI route that aggregates transaction data by `(owner, broker_platform)`, computes `total_invested` and `current_value` (via a lateral join on the latest price from `etf_price_history`), and returns a typed Pydantic v2 response. Register the router in `main.py` and add unit tests.

### Goal

Deliver a functioning backend endpoint with a stable response schema so the frontend tab shell and Overview table can be built against real data. Performance metrics (`performance_abs`, `performance_pct`) are nullable where price data is absent — the endpoint must never substitute `total_invested` as a silent stand-in for `current_value`.

### Deliverables

- `src/backend/schemas/portfolio.py` — `PortfolioRowResponse` and `PortfolioOverviewResponse` Pydantic v2 schemas
- `src/backend/routers/portfolio.py` — `GET /portfolio/overview` route handler with two-phase SQLAlchemy async aggregation query
- `src/backend/main.py` — register `portfolio.router` at prefix `/portfolio`
- `tests/routers/test_portfolio.py` — unit tests covering empty result, single row, multiple rows, null current_value when no price data

### Technical Overview

The aggregation runs in two logical phases implemented as a single SQLAlchemy async query (CTE or correlated subquery — no raw SQL strings):

**Phase 1** — net holdings CTE: groups `transactions` by `(owner, broker_platform, isin)`, summing `quantity * price` for Buy minus Sell to produce `total_invested` and net `quantity` per ISIN.

**Phase 2** — current value join: left-joins the holdings CTE to `etfs` on `isin`, then uses a lateral correlated subquery on `etf_price_history` (ordered by `timestamp DESC LIMIT 1`) to get the latest price per ETF. `current_value = SUM(net_quantity * latest_price)` grouped by `(owner, broker_platform)`. `NULL` propagates when any ISIN in the group has no price record.

`performance_abs = current_value - total_invested` and `performance_pct = performance_abs / total_invested * 100` are computed in Python after the query, not in SQL, to keep null-handling explicit.

The composite index on `(etf_id, timestamp DESC)` is already present from Alembic migration `001`. Profile with `EXPLAIN ANALYZE` before shipping.

---

## TASK-2 — Portfolio Tab Shell

**GitHub Issue:** #{issue}
**Effort estimate:** 1 FTE-day

### Scope

Refactor `app/(tabularium)/tabularium/portfolio/page.tsx` from a single-purpose ETF Registry Server Component into a tab shell. Introduce a `'use client'` tab container (`PortfolioPageClient`) that owns `activeTab` state and renders either the new Overview table or the relocated ETF Registry. Add `revalidateTag('portfolio-overview')` to all five server actions that mutate data feeding the Overview.

### Goal

Establish the tab layout at `/tabularium/portfolio` without disrupting the existing ETF Registry functionality. After this task the route renders correctly with both tabs; TASK-3 slots `PortfolioOverviewTable` into the already-wired "Portfolio" tab slot.

### Deliverables

- `app/(tabularium)/tabularium/portfolio/page.tsx` — refactored to parallel-fetch `GET /portfolio/overview` and `GET /etfs`; renders `<PortfolioPageClient>`
- `app/(tabularium)/tabularium/portfolio/components/PortfolioPageClient.tsx` — `'use client'` tab container; `activeTab: 'portfolio' | 'etf-registry'` state; tab header styled with `roman-*` tokens
- `app/(tabularium)/tabularium/actions.ts` — `createTransaction` gains `revalidateTag('portfolio-overview')`
- `app/(tabularium)/tabularium/etf-actions.ts` — `createEtf`, `updateEtf`, `deleteEtf`, `addPriceSnapshot` each gain `revalidateTag('portfolio-overview')`

### Technical Overview

`portfolio/page.tsx` uses `Promise.all` to fetch both endpoints in parallel:

```ts
const [overviewData, etfs] = await Promise.all([
  fetchPortfolioOverview(), // { next: { tags: ['portfolio-overview'] } }
  fetchEtfs(),              // { next: { tags: ['etfs'] } } — unchanged
])
return <PortfolioPageClient overviewData={overviewData} etfs={etfs} />
```

`PortfolioPageClient` renders:
- **"Portfolio" tab** (default): `<PortfolioOverviewTable rows={overviewData.rows} />` (placeholder until TASK-3)
- **"ETF Registry" tab**: `<AddEtfButton />` + `<EtfRegistryTable etfs={etfs} />`

`TabulariumSubNav.tsx` requires no changes — its `usePathname()` prefix-match on `/tabularium/portfolio` remains valid regardless of active tab. No new Tabularium top-level sub-routes are introduced; tab switching is pure `useState`.

---

## TASK-3 — Overview Table

**GitHub Issue:** #{issue}
**Effort estimate:** 1 FTE-day

### Scope

Implement `PortfolioOverviewTable`, the `'use client'` interactive component that receives `PortfolioRowResponse[]` and handles all in-browser behaviour: checkbox selection, master toggle, dynamic "Total" footer with weighted return, "Share" column, bidirectional column sorting, visual performance indicators, broker logos with fallback icon, and localized financial formatting.

### Goal

Deliver the complete Overview visualisation matching the sketch — a fully interactive table where checking/unchecking rows instantly updates the Total footer and Share column without any server round-trip. Positive returns are green, negative red, neutral grey; rows with null data show a dash.

### Deliverables

- `app/(tabularium)/tabularium/portfolio/components/PortfolioOverviewTable.tsx` — `'use client'` interactive table
- `app/(tabularium)/tabularium/portfolio/utils/brokerLogo.ts` — `brokerLogoPath(platform: string): string | null` lookup helper
- `app/(tabularium)/tabularium/portfolio/utils/perfClass.ts` — `perfClass(value: Decimal | null): string` colour utility
- `public/brokers/*.svg` — brand logo static assets (only logos with confirmed permissive licences; generic fallback for all others)

### Technical Overview

**State:**

| Variable | Type | Initial value |
| :--- | :--- | :--- |
| `selected` | `Set<string>` | All row keys (`${owner}::${broker_platform}`) |
| `sortColumn` | `keyof PortfolioRowResponse \| null` | `null` |
| `sortDirection` | `'asc' \| 'desc'` | `'asc'` |

**Columns:** checkbox, Owner (alphabetical sort), Broker (logo + fallback), Invested (localized), Value (localized, dash if null), Performance (absolute + relative side-by-side, coloured, dash if null), Share (computed from `row.total_invested / selectedTotal * 100`).

**Total footer:** sums `total_invested`, `current_value`, `performance_abs` across selected rows. `performance_pct` = `Σ(performance_abs) / Σ(total_invested) * 100` (weighted — excludes null rows from both numerator and denominator). Share = 100%.

**Broker logos:** `public/brokers/{slug}.svg` (e.g., `n26.svg`, `ibkr.svg`). `brokerLogoPath` returns `null` for unknown brokers; the component falls back to a Lucide `Building2` icon. Next.js `<Image>` `onError` handles load failures.

**Sorting:** null values sort last in both directions.

---

## GitHub Issues

### Milestone 1 — Backend Aggregation Endpoint

**Tasks:** TASK-1
**Effort:** 1 FTE-day

#### Scope

Implement and test the `GET /portfolio/overview` FastAPI endpoint: Pydantic schemas, two-phase SQLAlchemy async aggregation query over `transactions` + `etfs` + `etf_price_history`, router registration in `main.py`.

#### Goal

A stable, tested backend endpoint returns `PortfolioOverviewResponse` with nullable performance fields and correct null propagation when price data is missing — unblocking frontend development.

#### Deliverables

- `src/backend/schemas/portfolio.py` with `PortfolioRowResponse` and `PortfolioOverviewResponse`
- `src/backend/routers/portfolio.py` with `GET /portfolio/overview` handler
- `src/backend/main.py` updated to register the `portfolio` router at `/portfolio`
- `tests/routers/test_portfolio.py` with unit tests covering empty, single-row, multi-row, and null-price-data cases

---

### Milestone 2 — Portfolio Tab Shell

**Tasks:** TASK-2
**Effort:** 1 FTE-day

#### Scope

Refactor `portfolio/page.tsx` into a tab shell with parallel data fetching; introduce `PortfolioPageClient` tab container; relocate `AddEtfButton` + `EtfRegistryTable` into the "ETF Registry" tab; wire `revalidateTag('portfolio-overview')` into all five data-mutation server actions.

#### Goal

`/tabularium/portfolio` renders with two tabs. The "ETF Registry" tab is fully functional. The "Portfolio" tab slot is wired but holds a placeholder until Milestone 3. Cache invalidation is correct and complete for all paths that modify Overview data.

#### Deliverables

- `app/(tabularium)/tabularium/portfolio/page.tsx` refactored to tab shell
- `app/(tabularium)/tabularium/portfolio/components/PortfolioPageClient.tsx` — `'use client'` tab container
- `app/(tabularium)/tabularium/actions.ts` — `revalidateTag('portfolio-overview')` added to `createTransaction`
- `app/(tabularium)/tabularium/etf-actions.ts` — `revalidateTag('portfolio-overview')` added to all four ETF mutation actions

---

### Milestone 3 — Overview Table

**Tasks:** TASK-3
**Effort:** 1 FTE-day

#### Scope

Implement `PortfolioOverviewTable` with all interactive features: checkbox selection, master toggle, dynamic Total footer (weighted return), Share column, bidirectional sorting, performance colour classes, broker logos with fallback, and localized financial formatting.

#### Goal

The "Portfolio" tab at `/tabularium/portfolio` displays the complete Overview visualisation. Users can isolate or combine sub-portfolios via checkboxes; the Total footer and Share column update instantly. Lighthouse performance score remains ≥ 90.

#### Deliverables

- `app/(tabularium)/tabularium/portfolio/components/PortfolioOverviewTable.tsx`
- `app/(tabularium)/tabularium/portfolio/utils/brokerLogo.ts`
- `app/(tabularium)/tabularium/portfolio/utils/perfClass.ts`
- `public/brokers/*.svg` — broker logo static assets (licence-verified only)
