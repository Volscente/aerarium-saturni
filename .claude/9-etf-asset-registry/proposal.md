---
title: "ETF Asset Registry"
project: "Aerarium Saturni"
author: "Simone Porreca"
deadline: "2026-06-21"
notion-page: "https://app.notion.com/p/9-ETF-Asset-Registry-37f5cc6c0f07805eb578f4c9a6bfbab6"
github-repo: "https://github.com/Volscente/aerarium-saturni"
milestone: [9-etf-asset-registry]](https://github.com/Volscente/aerarium-saturni/milestone/7)
tech-stack:
  - "Python"
  - "FastAPI"
  - "SQLAlchemy 2.0 (async)"
  - "psycopg3 (psycopg[binary])"
  - "Pydantic v2"
  - "PostgreSQL 17 (JSONB)"
  - "Alembic"
  - "Next.js 15"
  - "Tailwind CSS"
  - "Zod"
scope-in:
  - "Three-table PostgreSQL schema: etfs (parent), etf_holdings (child), etf_price_history (child)"
  - "Alembic-tracked idempotent migrations for all new tables"
  - "FastAPI CRUD endpoints: POST, PUT, DELETE, and GET list for ETFs"
  - "Pydantic v2 request/response models with ISIN and field-level validation"
  - "Administrative management UI within the /tabularium route group"
  - "Client-side search and filter by Ticker, Asset Class, and Issuer"
  - "Manual price history trigger button per ETF in the management UI"
  - "CSV batch upload interface to load or overwrite etf_holdings for a given ETF"
scope-out:
  - "Real-time market data feeds: architectural complexity deferred to a dedicated initiative"
  - "Portfolio analytics and P&L calculations: explicitly deferred per backend roadmap"
  - "User authentication: unauthenticated at this stage per both service constraints"
  - "ML simulations: deferred to a dedicated future initiative"
  - "Bulk core-ETF metadata import via CSV: only holdings-level CSV ingestion is in scope"
milestones:
  - "Database schema and Alembic migrations"
  - "Backend CRUD service layer"
  - "Administrative management UI"
context-paths:
  - "frontend/README.md"
  - "backend/README.md"
---

## Problem

The platform currently has no canonical ETF entity. Transactions reference tickers and ISINs, but there is no master registry storing the identity, metrics, holdings composition, or price history of the underlying funds. Without it, all downstream features — portfolio aggregation, fund comparison, and optimization engines — have no asset definitions to operate on and cannot be built. A structured, queryable ETF registry is the foundational data layer those initiatives depend on.

## Approach direction

Design a three-table PostgreSQL schema (`etfs`, `etf_holdings`, `etf_price_history`) using JSONB columns for distribution maps to avoid column bloat while preserving deep queryability. Expose the registry through FastAPI CRUD endpoints following the existing transactions router pattern. Surface a management panel within the Tabularium route group, reusing the existing layout shell and sub-navigation conventions.

## Success criteria

- `etfs`, `etf_holdings`, and `etf_price_history` tables exist and are created via idempotent Alembic migrations with correct relational keys, cascade constraints, and indexes on `ticker` and `isin`.
- `POST /etfs`, `PUT /etfs/{id}`, and `DELETE /etfs/{id}` endpoints validate inputs via Pydantic v2 and return correct HTTP status codes; invalid ISIN formats and missing required fields are rejected with descriptive errors.
- The management UI within `/tabularium` allows listing ETFs and filtering instantaneously by Ticker, Asset Class, and Issuer.
- A trigger in the management UI submits a manual price point to `etf_price_history` without a page reload.
- A CSV upload interface batch-loads or overwrites the `etf_holdings` rows for a selected ETF.

## Constraints

- The Tabularium must not gain a third sub-route until the existing `/tabularium/portfolio` page is consolidated or split as described in the frontend invariant.
- `CustomNavbar` must remain free of Nextra-specific imports; it is reused in the Tabularium layout which has no Nextra context.
- All schema changes must go through Alembic-tracked migrations; `create_all()` is not an acceptable substitute for new tables.
- Lighthouse performance score must remain ≥ 90 on all existing Tabularium routes (`/tabularium`, `/tabularium/transactions`).
- `psycopg[binary]` (psycopg3) must be used as the PostgreSQL driver; psycopg2 is incompatible with the async engine.

## Desired tech

- **Alembic** — Required to produce the idempotent, versioned migrations that this initiative marks as a success criterion; this is the first schema-change milestone for the backend service.

## Integration context

The ETF registry extends the existing FastAPI service by adding new routers and ORM models alongside the existing `transactions` router, sharing the same async engine, session factory, and `Base` declarative base. The management UI slots into the Tabularium layout shell, reusing `CustomNavbar`, `CustomFooter`, and the `TabulariumSubNav` sub-navigation that currently links `/tabularium/portfolio` and `/tabularium/transactions`.

## Known risks / concerns

- Adding a management view to `/tabularium` risks violating the "exactly two sub-routes" invariant; the portfolio page consolidation question must be resolved before routing is finalised.
- The initiative routes ETF CRUD under `/transactions/etfs`, but ETFs are asset definitions, not financial events — this naming may conflict semantically and cause confusion with the existing `/transactions` domain; route naming should be confirmed in the RFC.
- `etf_holdings` can contain thousands of rows per fund; index strategy, query pagination, and cascade deletion performance need explicit design.
- JSONB columns for distribution maps offer schema flexibility but complicate deep querying, indexing, and Pydantic serialization at the boundary layer.
- CSV ingestion introduces multipart file handling in both the frontend and the backend, adding error surface area that the existing single-record `POST /transactions` pattern does not have.
