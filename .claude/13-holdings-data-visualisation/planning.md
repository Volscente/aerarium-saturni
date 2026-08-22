# Holdings Data Visualisation — High-Level Planning

**Project:** Aerarium Saturni
**GitHub repo:** [Volscente/aerarium-saturni](https://github.com/Volscente/aerarium-saturni)
**GitHub Milestone:** [13-holdings-data-visualisation](https://github.com/Volscente/aerarium-saturni/milestone/11)
**Notion page:** [13 - Holdings Data Visualisation](https://app.notion.com/p/13-Holdings-Data-Visualisation-3a45cc6c0f0780aa8c0cefdebc1eed9c)
**Total estimated effort:** 9.0 FTE-days (1 FTE = 1 day)

---

## Overview

This initiative adds look-through single-stock exposure analysis to the existing Portfolio page (`/tabularium/portfolio`): a holdings-upload fix resolves each stock's ISIN via the free OpenFIGI API so identity can be compared reliably across issuers, a new backend endpoint then aggregates each stock's weighted exposure across all owned ETFs, and four new frontend components (Alert Badge, Bar Chart, Treemap, Detailed Table) render that data without introducing a new Tabularium route or a full charting library.

### Dependency Order

```txt
TASK-1 ──► TASK-2 ──► TASK-3 (parallel)
                └──► TASK-4 (parallel)
```

---

## TASK-1 — Look-through Exposure Aggregation Engine

**GitHub Issue:** #69
**Effort estimate:** 4.5 FTE-days

### Scope

Two parts of one deliverable: an OpenFIGI-based reconciliation step (run after any holdings upload) that resolves Amundi's ISINs to their tickers and backfills matching ticker-only rows from the other ETFs, and the backend endpoint that aggregates each stock's total look-through weight across all owned ETFs on top of that reliable identity data.

### Goal

Provide the single, correct data source the entire dashboard renders from — a per-stock weighted exposure figure alongside the per-ETF contributions that produced it — with stock identity resolved reliably across issuers rather than guessed from names.

### Deliverables

- `backend/alembic/versions/004_add_etf_holdings_stock_country.py` — new migration adding a nullable `stock_country` (ISO 3166-1 alpha-2) column to `etf_holdings`
- `src/backend/models.py` — `EtfHolding.stock_country: Mapped[str | None]`
- `src/backend/converters/holdings_xlsx.py` — each converter now also emits `stock_country` (Amundi rows get it free from their own ISIN's first two characters; iShares rows are mapped from `Standort` via a small static lookup; Vanguard rows use `Region` directly); new `resolve_stock_isin_aliases()` reconciliation function, called from `upload_holdings` after any successful upload
- `backend/pyproject.toml` — `httpx` moved from the `dev` dependency group to runtime `dependencies` (same precedent as `openpyxl`'s earlier move)
- `src/backend/routers/portfolio.py` — new `GET /portfolio/holdings/exposure` route handler
- `src/backend/schemas/portfolio.py` — new `HoldingExposureResponse` and `HoldingContribution` Pydantic schemas
- `tests/converters/test_holdings_xlsx.py`, `tests/routers/test_etfs.py`, `tests/routers/test_portfolio.py` — new tests covering ISIN resolution, order-independence, aggregation correctness, and residual ISIN/ticker fallback grouping

### Technical Overview

OpenFIGI's `/v3/mapping` endpoint only accepts an ISIN as input to resolve a ticker — never the reverse — so identity resolution runs from Amundi's (LYP6) ISINs outward: resolve each of its ~608 distinct ISINs to a ticker via OpenFIGI, then update any other ETF's row still missing `stock_isin` whose `(stock_ticker, stock_country)` matches. Matching on country (not just ticker) avoids merging unrelated companies that coincidentally share a ticker on different exchanges, without needing to parse Bloomberg's exchange codes — the country comes for free from the ISIN's own first two characters. The reconciliation re-runs after every holdings upload (any issuer), so it's insensitive to upload order, and is idempotent and cheap enough (OpenFIGI is free and unrate-limited at this volume) that no separate persistent cache table is needed.

With `stock_isin` now reliably populated, the aggregation endpoint reuses the net-holdings CTE pattern from `_build_portfolio_query` to derive each owned ETF's share of total portfolio value (Phase 1), selects each ETF's latest `EtfHolding` snapshot (Phase 2, `MAX(snapshot_date)` per `etf_id` via the existing `(etf_id, snapshot_date)` composite index), and combines `etf_portfolio_weight × holding.weight_percentage` grouped by `COALESCE(stock_isin, stock_ticker)` (Phase 3) — now ISIN for the large majority of rows, with ticker remaining only as the residual fallback for the minority OpenFIGI could not resolve.

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
**Effort:** 4.5 FTE-days

#### Scope

Resolving stock identity reliably across issuers (OpenFIGI-based ISIN backfill at holdings upload) and the backend aggregation endpoint that computes look-through single-stock exposure across all owned ETFs from those holdings snapshots.

#### Goal

The dashboard has a correct, tested data source to render from before any frontend work begins — including reliable cross-issuer stock identity, not just the aggregation math.

#### Deliverables

- `stock_country` migration on `EtfHolding` and OpenFIGI-based ISIN resolution (ISIN → ticker, backfilled onto matching `(ticker, country)` rows)
- `GET /portfolio/holdings/exposure` endpoint
- `HoldingExposureResponse` / `HoldingContribution` schemas
- Aggregation query tests (correctness, residual ISIN/ticker fallback grouping)

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
