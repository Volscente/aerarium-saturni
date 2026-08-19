# Holdings Data Visualisation — High-Level Planning

**Project:** Aerarium Saturni
**GitHub repo:** [Volscente/aerarium-saturni](https://github.com/Volscente/aerarium-saturni)
**GitHub Milestone:** [13-holdings-data-visualisation](https://github.com/Volscente/aerarium-saturni/milestone/11)
**Notion page:** [13 - Holdings Data Visualisation](https://app.notion.com/p/13-Holdings-Data-Visualisation-3a45cc6c0f0780aa8c0cefdebc1eed9c)
**Total estimated effort:** 7 FTE-days (1 FTE = 1 day)

---

## Overview

This initiative adds look-through single-stock exposure analysis to the existing Portfolio page (`/tabularium/portfolio`): a new backend endpoint aggregates each stock's weighted exposure across all owned ETFs from already-stored holdings snapshots, and four new frontend components (Alert Badge, Bar Chart, Treemap, Detailed Table) render that data without introducing a new Tabularium route or a full charting library.

### Dependency Order

```txt
TASK-1 ──► TASK-2 ──► TASK-3 (parallel)
                └──► TASK-4 (parallel)
```

---

## TASK-1 — Look-through Exposure Aggregation Endpoint

**GitHub Issue:** #{number}
**Effort estimate:** 2.5 FTE-days

### Scope

Add a new backend endpoint that aggregates each stock's total look-through weight across all owned ETFs, including its response schemas and the multi-phase aggregation query.

### Goal

Provide the single data source the entire dashboard renders from: a per-stock weighted exposure figure alongside the per-ETF contributions that produced it.

### Deliverables

- `src/backend/routers/portfolio.py` — new `GET /portfolio/holdings/exposure` route handler
- `src/backend/schemas/portfolio.py` — new `HoldingExposureResponse` and `HoldingContribution` Pydantic schemas
- `tests/routers/test_portfolio.py` — new tests covering aggregation correctness and ISIN/ticker fallback grouping

### Technical Overview

Phase 1 reuses the net-holdings CTE pattern from `_build_portfolio_query` to derive each owned ETF's share of total portfolio value. Phase 2 selects each ETF's latest `EtfHolding` snapshot (`MAX(snapshot_date)` per `etf_id`, using the existing `(etf_id, snapshot_date)` composite index). Phase 3 combines `etf_portfolio_weight × holding.weight_percentage` and groups by stock identity, preferring `stock_isin` when present and falling back to `stock_ticker` otherwise.

---

## TASK-2 — Dashboard Data Wiring, Concentration Alert Badge & Bar Chart

**GitHub Issue:** #{number}
**Effort estimate:** 1.5 FTE-days

### Scope

Wire the new exposure endpoint into the Portfolio page's existing fetch, and build the two always-visible summary components.

### Goal

A user sees their largest single-stock exposure and a ranked view of concentrated holdings with no interaction required.

### Deliverables

- `app/(tabularium)/tabularium/portfolio/page.tsx` — second parallel fetch to `GET /portfolio/holdings/exposure` (`holdings-exposure` cache tag), alongside the existing `portfolio-overview` fetch
- `app/(tabularium)/tabularium/portfolio/components/ConcentrationAlertBadge.tsx`
- `app/(tabularium)/tabularium/portfolio/components/HoldingsBarChart.tsx`

### Technical Overview

The exposure response is fetched server-side and passed as a prop through `PortfolioPageClient`, alongside the existing `portfolio-overview` data (`PortfolioPageClient` currently renders a single view with no tabs; the `etfs` fetch used by the ETF Registry now lives on its own `/tabularium/etf-registry` route and is unaffected by this change). The badge highlights the row with the maximum `total_weight_percentage`, with warning styling above 10%. The bar chart renders the top 10–15 holdings as plain SVG/HTML bars with a 10% threshold marker — no charting library.

---

## TASK-3 — Interactive Treemap

**GitHub Issue:** #{number}
**Effort estimate:** 1.5 FTE-days

### Scope

Build the macro-view treemap covering all underlying holdings, scaled by look-through weight.

### Goal

Give users a full-portfolio visual of concentration risk beyond the top 10–15 holdings shown in the bar chart.

### Deliverables

- `app/(tabularium)/tabularium/portfolio/components/HoldingsTreemap.tsx`
- `d3-hierarchy` — new frontend dependency (layout algorithm only)

### Technical Overview

Uses `d3-hierarchy`'s `treemap()` layout function to compute rectangle geometry from `total_weight_percentage`, rendered as plain React/SVG. This avoids a full charting library's rendering/animation runtime, protecting the existing ≥ 90 Lighthouse budget.

---

## TASK-4 — Detailed Table

**GitHub Issue:** #{number}
**Effort estimate:** 1.5 FTE-days

### Scope

Build the searchable/sortable stock-level table with expandable per-ETF contribution rows.

### Goal

Let users investigate exactly which ETFs contribute to any stock's look-through exposure.

### Deliverables

- `app/(tabularium)/tabularium/portfolio/components/HoldingsExposureTable.tsx`

### Technical Overview

Mirrors the existing `EtfRegistryTable` expand-on-click pattern: search/sort over `stock_name`, `stock_isin`/`stock_ticker`, and `total_weight_percentage`; expanding a row renders its `contributions` list (source ETF, contribution weight, `snapshot_date`).

---

## GitHub Issues

### Milestone 1 — Look-through Exposure Aggregation Engine

**Tasks:** TASK-1
**Effort:** 2.5 FTE-days

#### Scope

The backend aggregation endpoint that computes look-through single-stock exposure across all owned ETFs from already-stored holdings snapshots.

#### Goal

The dashboard has a correct, tested data source to render from before any frontend work begins.

#### Deliverables

- `GET /portfolio/holdings/exposure` endpoint
- `HoldingExposureResponse` / `HoldingContribution` schemas
- Aggregation query tests (correctness, ISIN/ticker fallback grouping)

---

### Milestone 2 — Concentration Dashboard UI

**Tasks:** TASK-2, TASK-3, TASK-4
**Effort:** 4.5 FTE-days

#### Scope

The full four-component dashboard — Alert Badge, Bar Chart, Treemap, Detailed Table — rendered inside the existing Portfolio page from the M1 data source.

#### Goal

Users can see, drill into, and search their look-through concentration risk without leaving `/tabularium/portfolio` or a new sub-route being introduced.

#### Deliverables

- Data wiring in `portfolio/page.tsx` (`holdings-exposure` cache tag)
- Concentration Alert Badge
- Horizontal Bar Chart
- Interactive Treemap
- Detailed Table
