---
title: "Portfolio Overview Dashboard"
project: "Aerarium Saturni"
author: "Simone Porreca"
deadline: "2026-06-30"
notion-page: "https://app.notion.com/p/10-Portfolio-Overview-Dashboard-3865cc6c0f078033920ad103c2d83d9a"
github-repo: "https://github.com/Volscente/aerarium-saturni"
milestone: [10-portfolio-overview-dashboard](https://github.com/Volscente/aerarium-saturni/milestone/8)
tech-stack:
  - "Next.js 15"
  - "React"
  - "TypeScript"
  - "Tailwind CSS"
  - "Zod"
  - "Python"
  - "FastAPI"
  - "SQLAlchemy (async)"
  - "Pydantic v2"
  - "PostgreSQL"
scope-in:
  - "Interactive Portfolio Macro-Overview Table at /tabularium/portfolio"
  - "Per-row checkbox selection for isolating or combining portfolios"
  - "Master toggle checkbox to select/deselect all rows simultaneously"
  - "Dynamic 'Total' row footer recalculating instantly when checkboxes change"
  - "Performance column showing absolute fiat return and relative percentage side-by-side"
  - "Accurate weighted return for the 'Total %' metric based on selected portfolio sums"
  - "Dynamic 'Share' column showing each row's percentage of the currently selected total"
  - "Visual broker branding with logo and generic fallback icon"
  - "Visual performance indicators: green (positive), red (negative), neutral (flat)"
  - "Bidirectional sorting on all columns (alphabetical for text, numerical for financials)"
  - "Dash (—) fallback for missing or empty data fields"
  - "Localized financial formatting with decimal precision and currency symbols"
  - "Backend aggregation endpoint computing per-owner/per-broker metrics from transaction data"
scope-out:
  - "User authentication: platform is unauthenticated at this stage"
  - "Real-time market data: only static and calculated values are supported"
  - "Portfolio metric calculations (cost basis, P&L, TWR, MWR): deferred to a future analytics initiative"
  - "Deep-dive asset characteristics and X-Ray metrics: gateway view only, detail views are future work"
  - "ML simulations: deferred to a dedicated future initiative"
  - "New Tabularium sub-routes: portfolio must remain within /tabularium/portfolio, no third route"
  - "CSV bulk transaction import: only single-record creation via POST /transactions is supported"
milestones:
  - ""
context-paths:
  - "frontend/README.md"
  - "backend/README.md"
---

## Problem

The `/tabularium/portfolio` route exists as a live, Lighthouse-audited page but currently renders only the ETF Registry — a flat list of individually registered ETFs with no aggregation across owners or broker platforms. Multi-portfolio investors have no way to get a consolidated, high-level snapshot of their net worth distribution: how much is invested where, by whom, and at what return. Without this aggregated macro view, users cannot isolate or combine sub-portfolios (e.g., personal account vs. a partner's account) before drilling into asset details or performance metrics, leaving the portfolio pillar's primary value proposition unrealized.

## Approach direction

Extend the existing `/tabularium/portfolio` Server Component to fetch from a new backend aggregation endpoint that groups transaction records by owner and broker platform, computing total invested, current value, share, and performance per group. The frontend renders the result as a `'use client'` interactive table — following the same Server-Component-plus-client-component pattern used by the Transaction Ledger — with checkbox selection, dynamic totals, column sorting, and visual indicators handled entirely in the browser without additional round-trips.

## Success criteria

- A user can open `/tabularium/portfolio` and see a table of portfolio rows broken down by Owner and Broker Platform.
- Checking/unchecking a row instantly updates all values in the "Total" footer row, with no page reload.
- A master checkbox in the header toggles all rows in one click.
- The "Total %" metric reflects a weighted return, not a simple average, based on the selected rows' actual invested sums.
- The "Share" column recalculates dynamically as the selection changes.
- Each row's performance displays both absolute (e.g., `+1.000,00 €`) and relative (e.g., `+10,00%`) figures side-by-side.
- Clicking any column header sorts the table in ascending or descending order; clicking again reverses the direction.
- Positive returns are styled green, negative red, and zero return is visually neutral.
- Broker rows display a brand logo; rows without a known logo show a generic financial institution icon.
- Rows with missing data render a dash (`—`) in the affected cells.
- All monetary values are formatted with localized decimal precision and currency symbols.
- Lighthouse performance score at `/tabularium/portfolio` remains ≥ 90.

## Constraints

- Lighthouse performance score must remain ≥ 90 at `/tabularium/portfolio`; enforced by `lhci autorun` in CI.
- The portfolio view must stay within the existing `/tabularium/portfolio` route — no new Tabularium sub-routes may be introduced.
- `CustomNavbar` must remain free of Nextra-specific imports; it is reused in the Tabularium layout.
- Any new backend tables or schema changes must be introduced via Alembic migrations, not `Base.metadata.create_all()`.
- If the portfolio page caches data derived from transactions, `createTransaction` in `actions.ts` must also call `revalidateTag` for the portfolio cache tag.

## Desired tech

No new technologies are proposed. The solution should use the existing stack throughout.

## Integration context

The new dashboard fits entirely within the existing `app/(tabularium)/tabularium/portfolio/` route, replacing or augmenting the current ETF Registry Server Component. It follows the established data-fetch pattern: a Server Component calls a new FastAPI aggregation endpoint with a Next.js cache tag, then passes the result to a `'use client'` table component for interactive behavior — mirroring the Transaction Ledger at `/tabularium/transactions`. On the backend, the aggregation endpoint is a new route handler added to `src/backend/routers/` and registered in `main.py`, using `Depends(get_session)` and SQLAlchemy async queries over the existing `transactions` table.

## Known risks / concerns

- **No aggregation endpoint yet:** The backend has no endpoint that groups transactions by owner/broker. This must be designed and built before the frontend table can be completed; the query may be non-trivial if it needs to compute current value (which requires price data not yet in the system).
- **Price data gap:** Accurate performance metrics (current value vs. invested) require up-to-date asset prices. If the system only stores transaction cost data, "current value" may not be computable without a price feed or manual price snapshots.
- **`transactions` table managed by `create_all()`:** Any schema extension needed for aggregation (e.g., new columns) must be handled carefully — a baseline Alembic migration for `transactions` is explicitly deferred, creating a coordination risk.
- **Broker logo sourcing:** Brand logos must be obtained, optimized, and hosted statically; licensing must be verified. Missing logos must degrade gracefully to the generic fallback icon.
- **Weighted return accuracy:** The weighted performance calculation depends on correct and complete transaction history per owner/broker. Sparse or incorrect historical records will produce misleading totals with no obvious error signal to the user.
