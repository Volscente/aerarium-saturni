---
title: "Holdings Data Visualisation"
project: "Aerarium Saturni"
author: "Simone Porreca"
deadline: "2026-08-30"
notion-page: "https://app.notion.com/p/13-Holdings-Data-Visualisation-3a45cc6c0f0780aa8c0cefdebc1eed9c"
github-repo: "https://github.com/Volscente/aerarium-saturni"
milestone: [13-holdings-data-visualisation](https://github.com/Volscente/aerarium-saturni/milestone/11)
tech-stack:
  - "Next.js (App Router / Server Components)"
  - "FastAPI"
  - "SQLAlchemy (async)"
  - "PostgreSQL"
  - "Pydantic v2"
  - "Zod"
scope-in:
  - "Look-through aggregation of single-stock exposure across all owned ETFs"
  - "Concentration Alert Badge showing the maximum single-stock exposure percentage and ticker"
  - "Horizontal Bar Chart of the top 10-15 holdings with a 10% warning threshold line"
  - "Interactive Treemap of all underlying holdings scaled by weight"
  - "Searchable/sortable Detailed Table with per-stock expandable rows showing contributing ETFs"
scope-out:
  - "Real-time market data: only static and calculated examples are supported by the platform today"
  - "Other portfolio performance metrics (cost basis, P&L, TWR, MWR): deferred to a dedicated future analytics initiative"
milestones:
  - "Look-through Exposure Aggregation Engine"
  - "Concentration Dashboard UI"
context-paths:
  - "backend/README.md"
  - "frontend/README.md"
---

## Problem

The Portfolio page (`/tabularium/portfolio`) currently aggregates holdings only at the ETF/broker level (`GET /portfolio/overview`), and `EtfHolding` rows are stored per-ETF, per-snapshot. Neither view surfaces true single-stock exposure: when several owned ETFs hold overlapping constituents, a company's real weight in the combined portfolio is spread invisibly across multiple funds. Without look-through aggregation, users have no way to detect that they are over-concentrated in a single stock until they manually cross-reference every ETF's holdings.

## Approach direction

Compute each stock's total weighted exposure by summing, across all owned ETFs, the product of the ETF's weight in the portfolio and the stock's weight within that ETF (using the existing `EtfHolding` snapshot data). Present the aggregated result through a layered hierarchy of visual components — from a single headline figure down to a fully searchable breakdown — so the user's top concentration risk is visible before any interaction.

## Success criteria

- The aggregation engine correctly computes total look-through weight per stock across all owned ETFs.
- The dashboard presents four components: Concentration Alert Badge, Horizontal Bar Chart, Interactive Treemap, and Detailed Table.
- A user can identify their largest single-stock exposure without scrolling or interacting with the page.
- The Detailed Table lets a user search/sort stocks and expand any row to see which source ETFs contribute to that exposure.

## Constraints

- This feature must be delivered inside the existing `/tabularium/portfolio` page rather than as a new top-level route: concentration analysis is another lens on the same portfolio data already shown there, not a distinct data-management concern like the ETF Registry (which is why that one got its own `/tabularium/etf-registry` route).
- Lighthouse performance score must remain ≥ 90 on all audited routes, enforced by `lhci autorun` in CI.

## Integration context

The dashboard should live inside the existing `/tabularium/portfolio` page, alongside `PortfolioOverviewTable` (there is no tab structure to hook into — `PortfolioPageClient` currently renders a single view), and be backed by a new backend aggregation endpoint that reads from the already-stored `EtfHolding` and portfolio-holding data (following the same two-phase query pattern used by `GET /portfolio/overview`).

## Known risks / concerns

- iShares/Vanguard holdings exports report a stock's ticker but never its ISIN, while Amundi's export reports only the ISIN; grouping naively by whichever identifier is present would fail to merge the same company's exposure across issuers (confirmed empirically: ~30-45% of Amundi's holdings also appear, under a different identifier, in the other two funds). Mitigation: the free OpenFIGI mapping API only accepts an ISIN as input and returns a ticker (never the reverse), so Amundi's ISINs are resolved to their tickers once at holdings-upload time and used to backfill `stock_isin` on any other ETF's matching ticker-only rows — matched on ticker *and* country (derived free from the ISIN's own first two characters) to avoid merging unrelated companies that happen to share a ticker on different exchanges.
- Look-through aggregation must join holdings across potentially many ETFs and snapshot dates; query cost and correctness (handling missing/partial snapshots) is unproven at this stage.
- `EtfHolding` data is snapshot-based (`snapshot_date`), not live, so the dashboard reflects the last uploaded holdings snapshot rather than real-time positions.
- Introducing a treemap/chart-capable component is untested against the platform's ≥ 90 Lighthouse budget.
