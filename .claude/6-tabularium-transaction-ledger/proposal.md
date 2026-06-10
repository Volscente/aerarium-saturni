---
title: "Tabularium Transaction Ledger & Input Engine"
project: "Aerarium Saturni"
author: "Simone Porreca"
deadline: "2026-06-21"
notion-page: "https://app.notion.com/p/6-Tabularium-Transaction-Ledger-Input-Engine-37a5cc6c0f0780a8a9d7cb0bd6ef5119"
github-repo: "https://github.com/Volscente/aerarium-saturni"
milestone: [6-tabularium-transaction-ledger](https://github.com/Volscente/aerarium-saturni/milestone/4)
tech-stack:
  - "Next.js 15"
  - "Nextra 4"
  - "Tailwind CSS"
  - "Lucide React"
  - "Python 3.13"
  - "FastAPI"
  - "UV"
scope-in:
  - "Dedicated Transaction Ledger view at /tabularium/transactions showing chronological event history"
  - "Global '+ Add Transaction' action button accessible across all Tabularium views"
  - "Contextual right-side drawer/modal for transaction data entry"
  - "Four transaction types: Buy, Sell, Dividend, Split"
  - "Three asset classes: stocks, bonds, ETFs"
  - "Dynamic form fields that adjust based on the selected asset type"
  - "Tabularium sub-navigation: /tabularium/performance, /tabularium/holdings, /tabularium/transactions"
  - "FastAPI endpoints for transaction creation and retrieval"
  - "PostgreSQL schema for transactions introduced via Alembic migrations"
  - "Fractional share support (up to 4 decimal places) and multi-currency input"
  - "Immediate UI refresh on transaction submission without a full page reload"
scope-out:
  - "User authentication: the platform remains unauthenticated at this stage"
  - "Real-time or live market data feeds: only manually entered data is supported"
  - "Portfolio metric calculations (cost basis, P&L, TWR, MWR): this initiative provides the data foundation; calculations are future work"
  - "CSV import or bulk transaction entry: only single manual entry is in scope"
  - "ML simulations: deferred to a dedicated future initiative per backend README"
milestones:
  - "Backend schema and API: PostgreSQL transaction model, Alembic migration, and FastAPI CRUD endpoints"
  - "Transaction Ledger view: read-only chronological list at /tabularium/transactions"
  - "Transaction input flyout: '+ Add Transaction' trigger and drawer/modal with dynamic fields"
  - "Sub-navigation and state wiring: Tabularium route restructuring and global state refresh on submission"
context-paths:
  - "frontend/README.md"
  - "backend/README.md"
---

## Problem

The Tabularium currently provides only a static layout shell and route placeholders with no data layer. A portfolio dashboard is only as valuable as its underlying transaction history — without a mechanism to record financial events (purchases, sales, dividends, stock splits), the system cannot compute essential portfolio metrics such as cost basis, realized P&L, or time-weighted returns. The gap exists at two levels: infrastructure (no database schema, no Alembic migrations, no data-backed FastAPI endpoints, no wiring between Next.js and the backend) and UX (no interface for data entry or historical review). This initiative closes both gaps simultaneously, establishing the data foundation that all future analytics in the Tabularium depend on.

## Approach direction

The preferred direction is a hybrid UX: a chronological Transaction Ledger view for historical management at `/tabularium/transactions` and a persistent `+ Add Transaction` trigger that opens a contextual right-side drawer across all Tabularium sub-routes. The Tabularium sub-navigation will be extended to cover `/tabularium/performance`, `/tabularium/holdings`, and `/tabularium/transactions`. On the backend, the FastAPI service will expose the first data-backed endpoints, backed by a PostgreSQL transaction schema introduced via Alembic and accessed through the existing async SQLAlchemy session factory.

## Success criteria

- A user can manually log a new transaction in fewer than 4 clicks or under 15 seconds.
- Submitting a transaction via the drawer immediately refreshes the relevant dashboard state without a full page reload.
- The system correctly handles fractional shares (up to 4 decimal places) and various currency inputs.
- Transaction state management is encapsulated within `app/tabularium`, using Next.js Server Actions or dedicated API routes, keeping the monorepo modular.

## Constraints

- Lighthouse performance score must remain ≥ 90 at all times; enforced by existing CI (`lhci autorun`).
- Frontend builds must complete within 3 minutes; enforced by the existing `timeout-minutes: 3` CI guard.
- The `psycopg[binary]` (psycopg3) driver must be used for all PostgreSQL access — not psycopg2.
- CORS must unconditionally allowlist `http://localhost:3000`; the production origin is controlled by `FRONTEND_ORIGIN`.
- `GET /health` must remain database-independent and return `{"status": "ok"}` even when PostgreSQL is unavailable.

## Desired tech

No new technologies beyond the existing stack are required. The initiative explicitly prefers Next.js Server Actions or dedicated API routes for data submission, keeping financial data off client-side fetch calls in line with the backend's stated design principle.

## Integration context

On the frontend, the solution extends the existing `app/(tabularium)/tabularium/` App Router route group, converting the `/tabularium/transactions` placeholder page into a functional ledger and adding the Tabularium sub-navigation layer. On the backend, it introduces the first data-backed FastAPI endpoints by wiring the existing async SQLAlchemy session factory (`src/backend/db.py`) to a new PostgreSQL transaction schema; Next.js Server Components fetch from this service over HTTP, consistent with how the backend README describes its relationship to the frontend.

## Known risks / concerns

- ORM models and Alembic migrations have not been configured anywhere in the project yet; this is the first initiative to introduce them, and early schema decisions are load-bearing for all future analytics.
- The dynamic form (fields varying by asset type) adds non-trivial frontend complexity; edge cases across Buy/Sell/Dividend/Split × stock/bond/ETF combinations need thorough validation.
- Global state refresh after submission requires a deliberate choice between React Context, Next.js Server Action invalidation, or router re-validation; the wrong choice risks over-engineering or subtle stale-data bugs.
- The transaction data model must be designed with future metric calculations (cost basis, P&L, TWR, MWR) in mind; columns or relations omitted now will be expensive to add via migrations later.
