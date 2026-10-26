---
title: "ETF Price History"
project: "Aerarium Saturni"
author: "Simone Porreca"
deadline: "2026-10-31"
notion-page: "https://app.notion.com/p/16-ETF-Price-History-3f65cc6c0f0780ac9bbfe316750fcac2"
milestone: [16-etf-price-history](https://github.com/Volscente/aerarium-saturni/milestone/12)
tech-stack:
  - "Python"
  - "FastAPI"
  - "SQLAlchemy (async)"
  - "PostgreSQL"
  - "Alembic"
  - "httpx"
  - "Next.js 15"
  - "Tailwind CSS"
  - "Zod"
scope-in:
  - "Automated retrieval of ETF prices and full price history"
  - "Trigger button on the ETF Registry page, defaulting to all ETFs with the option to select specific ones"
  - "Removal of manual price entry from the ETF Registry page"
  - "Removal of the per-ETF drop-down price history table from the ETF Registry page"
  - "Timeline Chart on the ETF Registry page showing the price series of one or multiple selected ETFs"
scope-out:
  - ""                  # Format: "Item: reason" (e.g. "Fuzzy matching: future phase")
milestones:
  - ""                  # Ordered milestone names; each maps to a GitHub Issue
context-paths:
  - "backend/README.md"
  - "frontend/README.md"
---

## Problem

ETF prices are currently entered by hand, one snapshot at a time, through the ETF Registry page. This is tedious and error-prone, leaves the price history sparse and dependent on the user remembering to update it, and undermines every feature that relies on current valuations (portfolio overview, look-through exposure). The registry also offers no way to see how an ETF's price has evolved: history is only visible as a drop-down table under each entry, which does not support visual or cross-ETF comparison.

## Approach direction

Introduce a backend capability that retrieves current prices and historical price series for ETFs from an external market-data source and stores them in the existing price history, triggered on demand from the ETF Registry page. Replace the manual price entry and the per-row history table with a Timeline Chart that plots one or several ETFs' price series.

## Success criteria

- Prices and price history for ETFs are retrieved and stored automatically, with no manual price input.
- The user can trigger an update from a button on the ETF Registry page, choosing all ETFs (default) or a subset from the registry's existing ETF list.
- Manual price editing and the drop-down history table are no longer available in the ETF Registry page.
- The user can select an ETF and see its price series in a Timeline Chart on the ETF Registry page.
- The Timeline Chart can display and compare the price series of multiple ETFs at the same time.

## Constraints

- The trigger must live in the ETF Registry page and offer all ETFs by default, with per-ETF selection.
- The ETF list used for selection is the one already present in the ETF Registry.
- Manual price modification and the per-ETF history drop-down must be removed from the ETF Registry page.
- Existing invariants still apply: the Tabularium keeps exactly two sub-routes, schema changes go through Alembic, and any write path must revalidate the `etfs`, `portfolio-overview` and `holdings-exposure` cache tags.
- Frontend Lighthouse performance score must remain ≥ 90.
- The external prodiver of the ETFs information must be free of charge.

## Desired tech

<!-- No technology preference is expressed in the sources. -->

## Integration context

The retrieval logic fits in the backend's ETF router and `etf_price_history` table, which already back the portfolio valuation and look-through exposure, while the button and Timeline Chart replace the price-related UI in the frontend's ETF Registry tab inside the Portfolio page. The frontend reaches the backend through Server Actions, following the existing pattern.

## Known risks / concerns

- The external price data source is not chosen: availability, coverage of the registered ETFs (UCITS tickers/ISINs, multiple exchanges), rate limits, licensing and cost are open questions.
- Retrieving long histories for many ETFs in one request may be slow or hit provider limits; the update may need to be incremental or asynchronous.
- Existing manually entered snapshots may overlap or conflict with retrieved data (duplicates, currency or source differences).
- Removing manual entry leaves no fallback when the provider is unavailable or lacks an ETF.
- A new charting component must not regress the Lighthouse performance budget.
