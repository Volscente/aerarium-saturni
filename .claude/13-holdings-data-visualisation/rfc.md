# \[RFC\] Holdings Data Visualisation — Aerarium Saturni

| Author          | Simone Porreca                                                                                          |
| :--------------- | :-------------------------------------------------------------------------------------------------------- |
| **Project**     | Aerarium Saturni                                                                                        |
| **RFC status**  | Draft                                                                                                   |
| **Notion page** | [13 - Holdings Data Visualisation](https://app.notion.com/p/13-Holdings-Data-Visualisation-3a45cc6c0f0780aa8c0cefdebc1eed9c) |
| **GitHub repo** | [Volscente/aerarium-saturni](https://github.com/Volscente/aerarium-saturni)                             |
| **Milestone**   | [13-holdings-data-visualisation](https://github.com/Volscente/aerarium-saturni/milestone/11)             |

### Timeline

| Date       | Status | Note |
| :--------- | :----- | :--- |
| 2026-08-19 | Draft  |      |

### Table of contents

[Motivation](#motivation)

[Objectives](#objectives)

[Scope](#scope)

[Holdings Data Visualisation](#holdings-data-visualisation)

[Tech Stack](#tech-stack)

[Effort Estimations](#effort-estimations)

[FAQs](#faqs)

[Risks & Open Questions](#risks--open-questions)

[References](#references)

---

## Motivation {#motivation}

The Portfolio page (`/tabularium/portfolio`) currently aggregates holdings only at the ETF/broker level via `GET /portfolio/overview`, while `EtfHolding` rows are stored per-ETF, per-snapshot — neither view surfaces true single-stock exposure. When several owned ETFs hold overlapping constituents, a company's real weight in the combined portfolio is spread invisibly across multiple funds, so a user cannot detect over-concentration in a single stock without manually cross-referencing every ETF's holdings. This RFC must deliver the fix inside the existing `/tabularium/portfolio` page — as another lens on the portfolio data already shown there, not a new top-level route — and without regressing the platform's ≥ 90 Lighthouse performance budget. For full context, see the [Notion initiative page](https://app.notion.com/p/13-Holdings-Data-Visualisation-3a45cc6c0f0780aa8c0cefdebc1eed9c).

## Objectives {#objectives}

- **Compute look-through exposure**: a backend aggregation computes each stock's total weighted exposure across all owned ETFs from already-stored holdings snapshots.
- **Surface the top risk instantly**: a Concentration Alert Badge renders the largest single-stock exposure (ticker + percentage) with no user interaction required.
- **Visualize concentration at two scales**: a Horizontal Bar Chart (top 10–15 holdings, 10% threshold line) and an Interactive Treemap (all holdings, area-scaled) both render from the same aggregated dataset.
- **Enable per-stock investigation**: a searchable/sortable Detailed Table lets a user expand any stock row to see which source ETFs contribute to that exposure.
- **Preserve platform invariants**: the feature ships inside the existing `/tabularium/portfolio` route, with no new Tabularium sub-route and no Lighthouse regression.

## Scope {#scope}

**In-Scope:**

- Look-through aggregation of single-stock exposure across all owned ETFs
- Concentration Alert Badge showing the maximum single-stock exposure percentage and ticker
- Horizontal Bar Chart of the top 10-15 holdings with a 10% warning threshold line
- Interactive Treemap of all underlying holdings scaled by weight
- Searchable/sortable Detailed Table with per-stock expandable rows showing contributing ETFs

**Out-of-Scope:**

- **Real-time market data**: only static and calculated examples are supported by the platform today
- **Other portfolio performance metrics (cost basis, P&L, TWR, MWR)**: deferred to a dedicated future analytics initiative

**Constraints:**

- This feature must be delivered inside the existing `/tabularium/portfolio` page rather than as a new top-level route: concentration analysis is another lens on the same portfolio data already shown there, not a distinct data-management concern like the ETF Registry (which is why that one got its own `/tabularium/etf-registry` route).
- Lighthouse performance score must remain ≥ 90 on all audited routes, enforced by `lhci autorun` in CI.

---

# **Holdings Data Visualisation** {#holdings-data-visualisation}

## Approach Overview {#approach-overview}

The proposal's stated direction — sum, across all owned ETFs, the product of the ETF's weight in the portfolio and the stock's weight within that ETF, then present the result through a layered hierarchy of components — is adopted as-is; it matches the data already available (`EtfHolding.weight_percentage` per ETF snapshot, plus the ETF-level valuation logic already computed by `_build_portfolio_query` in `routers/portfolio.py`) and requires no new source data.

The design has three parts. First, a prerequisite fix at holdings-upload time resolves the missing ISIN for every ticker-only holding (iShares/Vanguard) via the free OpenFIGI mapping API, so stock identity can be compared reliably instead of guessed at read time. Second, a new backend endpoint reuses the existing two-phase query pattern (net-holdings CTE + correlated latest-price subquery) to derive each owned ETF's share of total portfolio value, then joins that against each ETF's most recent `EtfHolding` snapshot to compute a per-stock look-through weight, grouped and summed by stock identity (now reliably ISIN-based) across all contributing ETFs. Third, the frontend renders that single aggregated response through four components — badge, bar chart, treemap, table — added to the existing `/tabularium/portfolio` page in `PortfolioPageClient` (which today renders a single view, not tabs), fetched once alongside the existing `portfolio-overview` data.

### Stock ISIN Resolution at Holdings Upload {#stock-isin-resolution-at-holdings-upload}

A prerequisite for reliable grouping: iShares' and Vanguard's holdings exports report only a stock's ticker (confirmed empirically: 0 of 1231 EUNL rows and 0 of 3697 VWCE rows carry an ISIN), while Amundi's export reports only the ISIN. Grouping directly on whichever identifier happens to be present would silently fail to merge the same company's exposure across issuers — confirmed on the actual fixture data, where ~30-45% of Amundi's (LYP6) holdings also appear, under a ticker instead of an ISIN, in EUNL or VWCE (e.g. `RWE AG` reported as ticker `RWE` by EUNL and as ISIN `DE0007037129` by LYP6 — the same security, two different keys). A same-name heuristic was considered and rejected: normalizing and comparing `stock_name` catches most of these, but also produces false positives on the same fixture data (e.g. collapsing `EQT AB`, a Swedish private-equity firm, with the unrelated `EQT Corp`, a US gas company, and conflating `Heineken NV` with the distinct `Heineken Holding NV`) — an accuracy regression, not an improvement.

**Correction from an earlier draft of this RFC**: OpenFIGI's `/v3/mapping` endpoint (verified against its published API docs) never returns an ISIN in its response, regardless of what you query it with — it returns a Bloomberg FIGI plus descriptive metadata (`ticker`, `exchCode`, `name`...). So a ticker cannot be resolved *to* an ISIN via OpenFIGI. It can, however, resolve the other direction: query with `idType=ID_ISIN` and it returns that security's `ticker`. Since Amundi (LYP6) is the one issuer that already provides ISINs, the resolution runs from there: each of LYP6's ~608 distinct ISINs is resolved once to its ticker via OpenFIGI, and that ticker is used to backfill `stock_isin` on any other ETF's matching row — confirmed free of cost, with no payment or signup required at this volume (OpenFIGI's own docs: "free to use without daily, weekly or monthly limitations"; the unauthenticated tier alone, no registration needed, comfortably covers ~608 one-time lookups).

Matching purely on ticker would reintroduce a narrower version of the same collision risk the name-heuristic had (two unrelated companies coincidentally sharing a ticker on different exchanges). Rather than parsing OpenFIGI's Bloomberg exchange codes — which don't share a format with the source files' own country fields — the design uses a fact that's already free: **an ISIN's first two characters are its ISO 3166-1 country code** (e.g. `DE0007037129` → `DE`). `EtfHolding` gains a new nullable `stock_country` column, populated for every issuer: trivially from the ISIN for Amundi rows, from a small static German-name→ISO mapping of EUNL's `Standort` column, and directly from VWCE's `Region` column (already ISO alpha-2). The backfill then matches on `(stock_ticker, stock_country)`, not ticker alone. A ticker+country pair OpenFIGI cannot resolve simply keeps `stock_isin = NULL`, falling back to today's ticker-only behaviour — this fails safe (a missed merge, same as today) rather than failing dangerously (a wrong merge, as the name-heuristic could).

Because either identifier type can be uploaded in any order, the backfill runs as a reconciliation pass after *any* successful holdings upload (any issuer): it resolves every distinct ISIN currently stored in `etf_holdings`, then updates every row still missing `stock_isin` whose `(stock_ticker, stock_country)` matches. Re-running it after every upload is idempotent (the `WHERE stock_isin IS NULL` clause skips already-backfilled rows) and, since OpenFIGI is free and unrate-limited for this volume, cheap enough not to need a separate persistent cache table — the migration only adds the one `stock_country` column.

### Look-through Exposure Aggregation Engine {#look-through-exposure-aggregation-engine}

- **New endpoint**: `GET /portfolio/holdings/exposure` in `src/backend/routers/portfolio.py` (or a sibling module), following the existing `Depends(get_session)` pattern.
- **Phase 1 — ETF weight in portfolio**: reuse the net-holdings-per-ISIN CTE from `_build_portfolio_query`, but resolve `current_value` per ETF (not per owner/broker), then divide by total portfolio `current_value` to get each ETF's portfolio weight.
- **Phase 2 — stock weight in ETF**: for each held ETF, select its latest `EtfHolding` snapshot (`MAX(snapshot_date)` per `etf_id`, matching the composite index `ix_etf_holdings_etf_id_snapshot_date`).
- **Phase 3 — combine and group**: `total_weight = Σ (etf_portfolio_weight × holding.weight_percentage)`, grouped by stock identity. Thanks to the upstream ISIN resolution, the grouping key is `COALESCE(stock_isin, stock_ticker)` where `stock_isin` is now populated for the large majority of rows; `stock_ticker` remains only as the residual fallback for the minority OpenFIGI could not resolve (see Risks).
- **Missing-price handling**: `GET /portfolio/overview` nulls an entire owner/broker group's `current_value` when any held ISIN lacks a price record; that all-or-nothing behaviour does not obviously translate to a per-stock computation. This endpoint must define its own rule explicitly — e.g. excluding a priceless ETF's holdings from the aggregation (and flagging it) rather than failing the whole response — decided during implementation (see Risks & Open Questions).
- **Response schema** — `schemas/portfolio.py` gains `HoldingExposureResponse` (per-stock item: `stock_isin: str | None`, `stock_ticker: str | None`, `stock_name: str`, `total_weight_percentage: Decimal`, `contributions: list[HoldingContribution]`) and `HoldingContribution` (`etf_ticker: str`, `etf_name: str`, `contribution_weight_percentage: Decimal`, `snapshot_date: date`). Mirroring the existing `PortfolioRowResponse`/`PortfolioOverviewResponse` pairing, these are wrapped in a plural `HoldingsExposureResponse` envelope (`holdings: list[HoldingExposureResponse]`).

### Concentration Dashboard UI {#concentration-dashboard-ui}

- **Data fetch**: `app/(tabularium)/tabularium/portfolio/page.tsx` adds a second parallel fetch to `GET /portfolio/holdings/exposure` (new `holdings-exposure` cache tag), passed to `PortfolioPageClient` alongside the existing `portfolio-overview` prop.
- **`ConcentrationAlertBadge.tsx`**: renders the single highest `total_weight_percentage` row from the response; always mounted at the top of the Portfolio page body so it is visible without interaction; warning styling when the top exposure exceeds 10%.
- **`HoldingsBarChart.tsx`**: renders the top 10–15 holdings by `total_weight_percentage` as plain SVG/HTML bars (no charting library), with a vertical threshold marker at 10%; bars crossing the threshold use the existing warning colour token.
- **`HoldingsTreemap.tsx`**: uses `d3-hierarchy`'s `treemap()` layout function only (algorithm, no rendering layer) to compute rectangle geometry for all holdings scaled by `total_weight_percentage`, rendered as plain React/SVG — this keeps the bundle cost far below a full charting library, protecting the Lighthouse ≥ 90 budget.
- **`HoldingsExposureTable.tsx`**: client component mirroring the existing `EtfRegistryTable` expand-on-click pattern; search/sort over `stock_name`/`stock_isin`/`stock_ticker`/`total_weight_percentage`; expanding a row reveals its `contributions` list (source ETF, contribution weight, snapshot date).

## Tech Stack {#tech-stack}

- **Next.js (App Router / Server Components)**: existing rendering model for `/tabularium/portfolio`; the new data fetch and component tree extend the current Server Component + client sub-component split used by the rest of the Portfolio page.
- **FastAPI**: existing backend framework; the new endpoint is added to the existing `portfolio` router alongside `GET /portfolio/overview`.
- **SQLAlchemy (async)**: existing async ORM/query layer; the aggregation query extends the existing CTE + correlated-subquery pattern already used by `_build_portfolio_query`.
- **PostgreSQL**: existing database; the aggregation endpoint itself needs no schema changes (composite index on `(etf_id, snapshot_date)` already supports the "latest snapshot per ETF" lookup) — the one schema change in this initiative is a new nullable `stock_country` column on `EtfHolding`, added by the ISIN-resolution prerequisite (see Tech Stack's `httpx`/OpenFIGI entry), via a standard Alembic migration.
- **Pydantic v2**: existing response-model layer; `HoldingExposureResponse`/`HoldingContribution` follow the same ORM-mode pattern as `PortfolioRowResponse`.
- **Zod**: existing frontend schema-validation library; not required for this read-only visualisation feature, but available if the Detailed Table gains client-side filter inputs that need validation.
- **d3-hierarchy**: new, narrow dependency — provides only the `treemap()` layout algorithm (no DOM rendering, no animation), used to compute the Interactive Treemap's rectangle geometry while keeping bundle size minimal for the Lighthouse ≥ 90 constraint.
- **httpx**: already a backend dependency, but only in the `dev` group (used for FastAPI's `TestClient`). It moves to runtime `dependencies` — the same precedent as `openpyxl`, which made the same move when XLSX conversion became part of the upload request path — to call the OpenFIGI mapping API during holdings upload.
- **OpenFIGI mapping API**: free, no-cost external service (Bloomberg Open Symbology) — confirmed against its own documentation ("free to use without daily, weekly or monthly limitations") and usable entirely unauthenticated at this volume, no signup or payment info needed. Used to resolve each of Amundi's ISINs to a ticker (the only direction it supports); no package dependency, called over HTTP via `httpx`.

## Effort Estimations {#effort-estimations}

Total estimated effort: **{N} sessions**.

| Milestone                                            | Description                                                                 | Est. effort | GitHub Issue |
| :---------------------------------------------------- | :--------------------------------------------------------------------------- | :---------- | :----------- |
| M1 — Look-through Exposure Aggregation Engine          | OpenFIGI-based stock ISIN resolution at holdings upload, `GET /portfolio/holdings/exposure` endpoint, response schemas, aggregation query, tests | {N}         | #{issue}     |
| M2 — Concentration Dashboard UI                        | Badge, Bar Chart, Treemap, Detailed Table components; data wiring into `PortfolioPageClient` | {N}         | #{issue}     |

### Recommended Order

1. M1 — Look-through Exposure Aggregation Engine (the dashboard has no data to render until the aggregation endpoint exists)
2. M2 — Concentration Dashboard UI (depends on the response shape delivered by M1)

---

# **FAQs** {#faqs}

**Q: Why not use a full charting library like Recharts or Nivo for the bar chart and treemap?**

A: Only two visual shapes are needed — ranked horizontal bars and an area-scaled treemap — and both can be drawn as plain SVG once the underlying numbers are computed. `d3-hierarchy`'s `treemap()` layout provides the treemap math alone (no rendering/animation runtime), which is far lighter than a full charting library and protects the existing ≥ 90 Lighthouse budget.

**Q: How are stocks matched across ETFs that report different identifiers (ISIN vs. ticker)?**

A: `EtfHolding` guarantees at least one of `stock_isin`/`stock_ticker` per row but not both, since issuers differ (e.g. iShares/Vanguard provide tickers, Amundi provides ISINs). Rather than matching on whichever identifier happens to be present (or on normalized stock names, which we tested and rejected — it both misses real matches and wrongly merges unrelated companies like `EQT AB`/`EQT Corp`), the holdings-upload step resolves Amundi's ISINs to their tickers via the free OpenFIGI mapping API (the only direction OpenFIGI actually supports) and backfills `stock_isin` onto any other ETF's row whose `(stock_ticker, stock_country)` matches — country coming for free from the ISIN's own first two characters — before the aggregation ever runs. The aggregation itself then simply groups by `COALESCE(stock_isin, stock_ticker)`, which is now ISIN for the large majority of rows. A `(ticker, country)` pair OpenFIGI cannot resolve still falls back to ticker-only matching, so a small residual best-effort gap remains (see Risks & Open Questions) — but it no longer risks merging unrelated companies.

**Q: Why a new endpoint instead of extending `GET /portfolio/overview`?**

A: `GET /portfolio/overview` aggregates at owner/broker granularity and its `PortfolioRowResponse` contract is already consumed by `PortfolioOverviewTable`. Look-through exposure is a different granularity (per-stock, cutting across owners and brokers), so it is served by a dedicated endpoint rather than overloading the existing response shape.

**Q: Why isn't this feature a new Tabularium route (e.g. `/tabularium/holdings`)?**

A: The Tabularium now has three sub-routes (Portfolio, Transactions, ETF Registry) — the ETF Registry earned its own route because it manages ETF master data, a distinct concern from viewing the portfolio. Concentration exposure, by contrast, is another lens on the same portfolio data already shown in the Overview table on `/tabularium/portfolio`, so it belongs alongside it rather than becoming a fourth route. If that page later grows enough to justify its own tab-based navigation (mirroring how ETF Registry split off), that is a separate follow-up, not a reason to hold this RFC.

**Q: Terminology?**

A: 
- **ETF** → Exchange-Traded Fund; a basket of underlying stocks held in the portfolio.
- **ISIN** → International Securities Identification Number; a 12-character identifier for a stock or fund.
- **Look-through exposure** → a stock's true weight in the combined portfolio, computed by summing its weight within each owned ETF, scaled by that ETF's weight in the portfolio.

---

## Risks & Open Questions {#risks--open-questions}

| Risk / Question                                                                 | Likelihood | Mitigation / Answer |
| :-------------------------------------------------------------------------------- | :--------- | :------------------- |
| Stock identity mismatch across issuers (same company reported by ISIN in one ETF, ticker in another) — confirmed on real data at ~30-45% of Amundi's holdings | Low (mitigated) | Resolve Amundi's ISINs to tickers via OpenFIGI at holdings-upload time and backfill matching `(ticker, country)` rows (see "Stock ISIN Resolution at Holdings Upload"); residual gap only for tickers OpenFIGI cannot resolve, which fall back to ticker-only matching (fails safe, not a wrong merge) |
| OpenFIGI resolution itself may not cover every ISIN (thin/obscure listings), and depends on an external service at upload time | Low        | An unresolved ISIN's holdings simply stay ticker-unmatched rather than failing the upload; the reconciliation pass re-running on every upload is cheap and free, so no persistent cache is needed, keeping the network dependency off the hot read path |
| Aggregation query cost/correctness across many ETFs and snapshot dates is unproven | Medium     | Reuse the already-indexed two-phase CTE + correlated-subquery pattern from `_build_portfolio_query`; validate against realistic holdings volumes (e.g. `EUNL.xlsx` alone contributes 1231 rows) |
| Behaviour for an owned ETF with no price record is undefined — `GET /portfolio/overview` nulls the whole owner/broker group in this case, which doesn't cleanly translate to a per-stock weight | Medium | Decide and document explicitly during implementation (e.g. exclude the priceless ETF's holdings from the aggregation and flag it), rather than inheriting the existing endpoint's all-or-nothing null behaviour by default |
| `EtfHolding` data is snapshot-based, not live, so the dashboard reflects the last uploaded holdings snapshot rather than current positions | Low        | Surface `snapshot_date` per contributing ETF in the Detailed Table so staleness is visible to the user |
| Introducing the Interactive Treemap could regress the ≥ 90 Lighthouse budget | Low        | Use `d3-hierarchy`'s layout-only import and plain SVG rendering instead of a full charting library |

## References {#references}

- [Notion initiative page](https://app.notion.com/p/13-Holdings-Data-Visualisation-3a45cc6c0f0780aa8c0cefdebc1eed9c)
- [Volscente/aerarium-saturni](https://github.com/Volscente/aerarium-saturni)
- [Milestone: 13-holdings-data-visualisation](https://github.com/Volscente/aerarium-saturni/milestone/11)
