---
title: "Portfolio Timeline"
project: "Aerarium Saturni"
author: "Simone Porreca"
deadline: "2026-11-30"
notion-page: "https://app.notion.com/p/17-Portfolio-Timeline-3f75cc6c0f078057b978ede9a2a0a52f"
milestone: [17-portfolio-timeline](https://github.com/Volscente/aerarium-saturni/milestone/13)
tech-stack:
  - Next.js 15
  - Nextra 4
  - Tailwind CSS
  - Zod
  - Python
  - FastAPI
  - SQLAlchemy (async)
  - Pydantic v2
  - PostgreSQL
scope-in:
  - "New Timeline tab on Tabularium > Portfolio, visually separated from the snapshot tabs"
  - "Macro chart: owner total and per-broker portfolio value lines, toggled via checkboxes"
  - "Micro chart: per-ETF lines selected via a hierarchical (owner > ETF) dropdown"
  - "Selection controls independent of the Global Scope Filter"
  - "Daily X-axis granularity"
  - "Y-axis toggle between Absolute Value and Normalized Growth (%)"
scope-out:
  - "Portfolio metrics such as TWR/MWR: deferred to a future analytics initiative (backend README)"
  - "Non-EUR price series: price refresh is EUR-only (backend README)"
  - "New Tabularium sub-route: Timeline must live as a tab inside /tabularium/portfolio (frontend README invariant)"
milestones:
  - ""                  # Ordered milestone names; each maps to a GitHub Issue
context-paths:
  - "backend/README.md"
  - "frontend/README.md"
---

## Problem

The Portfolio page only shows current-state snapshots (Overview, Holdings, Geography, Sectors), all driven by the latest prices and holdings. There is no way to see how portfolio value or individual ETFs have evolved over time, and no way to compare owners, brokers or ETFs against each other historically. Placing time-series charts inside the existing snapshot tabs would blur the mental model, since the Global Scope Filter would be expected to govern them, and would force users to scroll past large charts to reach current holdings. Daily ETF prices are now stored, but nothing aggregates them with transaction history into portfolio-level value over time.

## Approach direction

Add a dedicated Timeline tab within the existing Portfolio page, with two stacked line charts (macro: owner/broker totals; micro: individual ETFs), each with its own independent selection menu. Historical portfolio values are derived from the existing transaction and ETF price data.

## Success criteria

- A "Timeline" tab appears in the Portfolio navigation, visually separated from the snapshot tabs.
- Timeline controls operate independently of the Global Scope Filter.
- The top chart plots the owner's total portfolio value and updates when broker-specific toggles are checked.
- The bottom chart plots one line per ETF selected from a collapsible, hierarchical owner > ETF dropdown.
- The X-axis shows daily data points, and the Y-axis toggles between Absolute Value and Normalized Growth (%).

## Constraints

- Timeline must live inside `/tabularium/portfolio`; the Tabularium has exactly three sub-routes and no fourth may be added.
- Lighthouse performance score must stay ≥ 90 on `/tabularium/portfolio`.
- Any new data fetch must be covered by cache-tag revalidation on every write path (transactions, ETFs, prices, holdings uploads).
- Schema changes, if any, must go through Alembic.
- Prices are EUR-only, so values are EUR.

## Desired tech

No new technologies are expressed as preferred. The existing hand-rolled SVG `TimelineChart` and the lightweight no-charting-library approach are the natural baseline, as they protect the Lighthouse budget.

## Integration context

The Timeline tab extends the existing tab bar in `PortfolioPageClient`, with its data supplied by new read-only backend endpoint(s) that combine transactions with `etf_price_history`, following the same Server Component fetch and cache-tag pattern as the other Portfolio tabs.

## Known risks / concerns

- No endpoint currently returns historical portfolio value; computing it daily from transactions and prices may be costly for long histories.
- Missing prices on some days (weekends, holidays, ETFs with short history) require a gap-handling rule (e.g. carry forward) that affects chart accuracy.
- "Normalized Growth (%)" is ambiguous at portfolio level: buys and sells during the period distort a plain value-based percentage, and a fair definition is not specified.
- Splits and mixed ETF start dates complicate fair comparison across selected lines.
- Chart rendering with many daily points and series may pressure the Lighthouse budget if the hand-rolled SVG approach does not scale.
