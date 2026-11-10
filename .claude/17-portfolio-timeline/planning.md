# Portfolio Timeline — High-Level Planning

**Project:** Aerarium Saturni
**GitHub Milestone:** [17-portfolio-timeline](https://github.com/Volscente/aerarium-saturni/milestone/13)
**Notion page:** [17 Portfolio Timeline](https://app.notion.com/p/17-Portfolio-Timeline-3f75cc6c0f078057b978ede9a2a0a52f)
**Total estimated effort:** 7.5 FTE-days (1 FTE = 1 day)

---

## Overview

The initiative adds a read-only `GET /portfolio/timeline` backend endpoint that replays transactions against `etf_price_history` to produce daily EUR holdings-value series per owner, per `(owner, broker)` and per `(owner, broker, ETF)`. The Portfolio page gains a lazily loaded, visually separated Timeline tab with two stacked SVG line charts, each driven by an independent tree selector and a shared Absolute / Normalized Growth (%) toggle. No schema change is planned.

### Dependency Order

```txt
TASK-1 ──► TASK-2 ──► TASK-3 ──► TASK-4 ──► TASK-5
```

---

## TASK-1 — Timeline Computation Engine

**GitHub Issue:** #82
**Effort estimate:** 2 FTE-days

### Scope

Backend logic that turns transactions and daily prices into per-day holdings value and net cash flow for every tree node.

### Goal

A tested pure function that, given transactions and price history, returns daily `value` and `net_flow` series per owner, `(owner, broker)` and `(owner, broker, ETF)`, plus a count of skipped transactions.

### Deliverables

- `backend/src/backend/routers/portfolio.py` (or a helper module beside it) — day-by-day replay tracking net quantity per `(owner, broker, ISIN)`
- `backend/tests/` — unit tests for buys, sells, splits, carry-forward, aggregation levels, series start date, and skipped transactions

### Technical Overview

Replay runs from the earliest transaction to the latest price date, one point per calendar day. Splits adjust quantity by `ratio`. Positions are valued at the latest close on or before each day (carry-forward over weekends, holidays and gaps). `net_flow` is buys minus sells at transaction price with fees counted. Non-EUR and price-less transactions are skipped and counted; dividends are ignored. Each series starts on the first day its node holds a non-zero position. Computation is done in Python (pandas), not SQL. Dates are UTC days matching the `etf_price_history` unique daily index.

---

## TASK-2 — Timeline API Endpoint

**GitHub Issue:** #82
**Effort estimate:** 1 FTE-day

### Scope

Expose the computation through `GET /portfolio/timeline` with typed Pydantic response models.

### Goal

An endpoint returning the Owner > Broker > ETF series tree, usable by the frontend, with route-level tests.

### Deliverables

- `backend/src/backend/schemas/portfolio.py` — response models mirroring the selection tree (`owners` > `brokers` > `etfs`, each with `points` of `{ date, value, net_flow }`) plus the skipped-transactions count
- `backend/src/backend/routers/portfolio.py` — `GET /portfolio/timeline` handler using `Depends(get_session)`
- `backend/tests/routers/test_portfolio.py` — empty case, multi-owner/broker shape, skipped count
- `backend/README.md` — new endpoint documented in Public interfaces and Changelog

### Technical Overview

Lives next to `/portfolio/overview` and `/portfolio/holdings/*`. Computes on request; no precomputation is planned given the expected volume (under ~100 transactions per year across all owners). The same ETF held at two brokers appears as two separate series.

---

## TASK-3 — Timeline Tab Shell and Data Plumbing

**GitHub Issue:** #83
**Effort estimate:** 1 FTE-day

### Scope

Frontend wiring: new tab, Server Action, TypeScript types and cache invalidation.

### Goal

A visually separated Timeline tab that lazily loads the timeline payload on first open, and a payload that every write path keeps fresh.

### Deliverables

- `frontend/app/(tabularium)/tabularium/portfolio/components/PortfolioPageClient.tsx` — `'timeline'` added to `activeTab`, divider and chart icon on the tab button, conditional mount, mirrored TypeScript interfaces
- A Server Action fetching `GET /portfolio/timeline` with the `portfolio-timeline` cache tag, following the `fetchPriceHistory` pattern
- `actions.ts`, `etf-actions.ts`, `app/api/etfs/[id]/holdings/upload/route.ts` — `revalidateTag('portfolio-timeline')` added to every write path, including price refresh

### Technical Overview

`page.tsx` is not changed to fetch eagerly, so other tabs' payload and the Lighthouse score are unaffected. Fetched data is cached in component state. The Timeline tab never reads the Global Scope Filter. No fourth Tabularium sub-route is added.

---

## TASK-4 — Tree Selectors and Macro Chart

**GitHub Issue:** #84
**Effort estimate:** 2 FTE-days

### Scope

The collapsible tree selector, the new SVG line chart component and the top (macro) chart.

### Goal

The macro chart plots one line per checked Owner or Owner > Broker node, with tooltip and daily ISO-date X-axis, in Absolute and Normalized Growth (%) modes.

### Deliverables

- A new Timeline chart component (hand-rolled SVG, no charting library), separate from the existing `TimelineChart`
- A collapsible tree selector component with independent checkboxes per node (checking a parent does not check its children; expand/collapse separate from check)
- Normalization logic chaining daily returns adjusted for `net_flow`, computed client-side from the fetched series
- Empty, loading and skipped-transactions notices

### Technical Overview

Each checked node plots its subtree's value. Normalized mode indexes each line to its own first valid day within the plotted range. The existing `TimelineChart`, used only by `RegistryPriceSection` on `/tabularium/etf-registry`, is left untouched; minimal chart geometry is duplicated instead.

---

## TASK-5 — Micro Chart and Polish

**GitHub Issue:** #84
**Effort estimate:** 1.5 FTE-days

### Scope

The bottom (micro) chart, the shared Y-axis toggle, performance checks and documentation.

### Goal

The micro chart plots ETF position-value lines from an Owner > Broker > ETF tree, both charts share one Y-axis toggle, and the page keeps Lighthouse ≥ 90.

### Deliverables

- Micro chart wired to the three-level tree, reusing the TASK-4 chart and selector components
- Shared Absolute € / Normalized % toggle applying to both charts
- Point downsampling if interactivity degrades with many daily points and checked nodes
- `frontend/README.md` — Timeline tab components and changelog
- Lighthouse run on `/tabularium/portfolio`

### Technical Overview

Absolute ETF lines show the owner's position value at that broker, so contributions raise the line; normalized lines strip contributions via `net_flow`. Tab content is mounted only when open, to protect the Lighthouse budget.

---

## GitHub Issues

### Milestone 1 — Timeline Backend

**Tasks:** TASK-1, TASK-2
**Effort:** 3 FTE-days

#### Scope

Replay computation of holdings value and net flow from transactions and prices, and the `GET /portfolio/timeline` endpoint exposing it.

#### Goal

The backend returns correct daily value and net-flow series for every owner, broker and ETF node, verified by unit and route tests.

#### Deliverables

- Replay computation with split, carry-forward and skip handling
- `GET /portfolio/timeline` endpoint and Pydantic response models
- Backend unit and route tests
- Updated `backend/README.md`

---

### Milestone 2 — Timeline Tab and Data Plumbing

**Tasks:** TASK-3
**Effort:** 1 FTE-day

#### Scope

The new Timeline tab, its lazy Server Action fetch and cache-tag invalidation on all write paths.

#### Goal

Opening the Timeline tab loads the series data once, and any transaction, ETF, price or holdings change refreshes it.

#### Deliverables

- Visually separated Timeline tab in `PortfolioPageClient`
- Timeline Server Action with `portfolio-timeline` tag
- `revalidateTag('portfolio-timeline')` on all write paths
- Mirrored TypeScript response interfaces

---

### Milestone 3 — Timeline Charts

**Tasks:** TASK-4, TASK-5
**Effort:** 3.5 FTE-days

#### Scope

Tree selectors, the two stacked line charts, the Absolute / Normalized Growth (%) toggle, performance verification and documentation.

#### Goal

Users can compare owners, brokers and ETF positions over time on independent charts, with Lighthouse performance ≥ 90 preserved.

#### Deliverables

- Collapsible tree selector component
- Macro and micro SVG line charts with tooltip and daily ISO-date axis
- Shared Absolute / Normalized toggle with `net_flow`-adjusted normalization
- Lighthouse verification and updated `frontend/README.md`
