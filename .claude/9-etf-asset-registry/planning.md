# ETF Asset Registry — High-Level Planning

**Project:** Aerarium Saturni
**GitHub repo:** [Volscente/aerarium-saturni](https://github.com/Volscente/aerarium-saturni)
**GitHub Milestone:** [Milestone: 9-etf-asset-registry](https://github.com/Volscente/aerarium-saturni/milestone/7)
**Notion page:** [9 — ETF Asset Registry](https://app.notion.com/p/9-ETF-Asset-Registry-37f5cc6c0f07805eb578f4c9a6bfbab6)
**Total estimated effort:** 4.5 FTE-days (1 FTE = 1 day)

---

## Overview

This initiative introduces a canonical ETF entity to the Aerarium Saturni platform — a three-table PostgreSQL schema (`etfs`, `etf_holdings`, `etf_price_history`) managed by Alembic, a FastAPI CRUD layer at `/etfs`, and an administrative management UI housed in the existing `/tabularium/portfolio` route. The backend marks the first adoption of Alembic in the service; the frontend promotes a placeholder Server Component into a live, filterable ETF registry that follows established Tabularium layout and component conventions.

### Dependency Order

```txt
TASK-1 ──► TASK-2 ──► TASK-3
```

---

## TASK-1 — Database Schema and Alembic Migrations

**GitHub Issue:** #39
**Effort estimate:** 1.0 FTE-day

### Scope

Initialize Alembic under `backend/alembic/`, configure `env.py` to use the existing `Base.metadata` with a synchronous psycopg3 connection, and write the first revision that creates all three ETF tables with their constraints, foreign keys, cascade rules, and indexes.

### Goal

Produce an idempotent, version-controlled migration that can be applied to any fresh PostgreSQL instance and yields the correct schema — establishing the contract that TASK-2 and TASK-3 depend on.

### Deliverables

- `backend/alembic/` — Alembic directory with `env.py`, `script.py.mako`, and `alembic.ini`
- `backend/alembic/versions/001_create_etf_tables.py` — First migration: `etfs`, `etf_holdings`, `etf_price_history` tables with all constraints and indexes
- `src/backend/models.py` — `Etf`, `EtfHolding`, `EtfPriceHistory` ORM classes added alongside the existing `Transaction`

### Technical Overview

The `etfs` table uses a UUID primary key; `ticker` and `isin` carry `UNIQUE` constraints and `B-Tree` indexes. The four distribution columns (`geographical_distribution`, `sector_distribution`, `bond_maturities`, `bond_credit_scores`) are `JSONB`; GIN indexes are added to `geographical_distribution` and `sector_distribution` to support containment queries. `etf_holdings` and `etf_price_history` each carry a `etf_id` foreign key with `ON DELETE CASCADE`. `etf_price_history` has a composite `B-Tree` index on `(etf_id, timestamp DESC)` for O(1) latest-price lookups.

Alembic's `env.py` is configured to use a synchronous connection (psycopg3's sync interface or a `postgresql+psycopg://` URL without the async driver extras) — the async `create_async_engine` in `db.py` is not touched by the migration runner. The `lifespan` handler in `main.py` retains its existing `create_all()` call for the `transactions` table until a follow-up baseline migration is introduced.

---

## TASK-2 — Backend CRUD Service Layer

**GitHub Issue:** #40
**Effort estimate:** 1.5 FTE-days

### Scope

Implement the Pydantic v2 request/response schemas, SQLAlchemy ORM queries, and FastAPI route handlers for the six ETF endpoints, including the manual price-history submission endpoint and the transactional CSV holdings upload endpoint. Add unit tests covering validation paths, success responses, and cascade behaviour.

### Goal

A tested `/etfs` FastAPI router registered in `main.py` that validates all inputs at the boundary, persists data through the ORM, and returns correct HTTP status codes — giving the frontend a complete, stable API surface.

### Deliverables

- `src/backend/schemas/etfs.py` — `EtfCreate`, `EtfUpdate`, `EtfResponse`, `EtfPriceCreate`, `EtfHoldingRow` Pydantic v2 models
- `src/backend/routers/etfs.py` — Six route handlers: `POST /etfs`, `GET /etfs`, `PUT /etfs/{id}`, `DELETE /etfs/{id}`, `POST /etfs/{id}/price`, `POST /etfs/{id}/holdings/upload`
- `src/backend/main.py` — `etfs` router registered at prefix `/etfs`
- `tests/routers/test_etfs.py` — Unit tests for validation errors, success paths, and CSV upload atomicity

### Technical Overview

`EtfCreate` uses `model_validator` to enforce asset-class-conditional field presence (bonds fields required when `asset_class = Bonds`; equity market-cap fields required when `asset_class = Equities`). ISIN is validated with a `field_validator` matching the 12-character alphanumeric format, consistent with the existing `TransactionCreate` pattern. `EtfUpdate` makes all fields optional for partial updates.

The CSV upload handler (`POST /etfs/{id}/holdings/upload`) accepts a `multipart/form-data` file, parses each row into `EtfHoldingRow`, opens an async session, deletes all existing `etf_holdings` rows for the given `etf_id`, and bulk-inserts the new rows — all within a single transaction. Any Pydantic validation error or DB constraint violation triggers a rollback; the response includes the failing row number and field name. The `GET /etfs` handler accepts optional `?ticker=`, `?asset_class=`, and `?issuer=` query parameters applied as `ILIKE` or exact-match filters before returning `list[EtfResponse]`.

---

## TASK-3 — Administrative Management UI

**GitHub Issue:** #41
**Effort estimate:** 2.0 FTE-days

### Scope

Promote `app/(tabularium)/tabularium/portfolio/page.tsx` from a placeholder to a live Next.js Server Component. Build the suite of client components (`EtfRegistryTable`, `AddEtfButton`, `EtfDrawer`, `EtfForm`, `PriceUpdateButton`, `HoldingsUpload`), the shared Zod schema, and the Server Actions — all following the established Tabularium layout and component conventions.

### Goal

A fully functional ETF management view accessible at `/tabularium/portfolio` with no Nextra chrome, respecting the two-sub-route invariant and maintaining Lighthouse performance ≥ 90.

### Deliverables

- `app/(tabularium)/tabularium/portfolio/page.tsx` — Server Component fetching `GET /etfs` with `{ next: { tags: ['etfs'] } }` cache tag
- `app/(tabularium)/tabularium/etf-schema.ts` — Zod `EtfFormSchema` (no directive; importable by server and client)
- `app/(tabularium)/tabularium/etf-actions.ts` — `createEtf`, `updateEtf`, `deleteEtf` Server Actions; each calls `revalidateTag('etfs')`
- `app/(tabularium)/tabularium/components/EtfRegistryTable.tsx` — `'use client'` filterable table (ticker prefix, asset class dropdown, issuer prefix)
- `app/(tabularium)/tabularium/components/AddEtfButton.tsx` — `'use client'` trigger; owns `isDrawerOpen` state
- `app/(tabularium)/tabularium/components/EtfDrawer.tsx` — `'use client'` fixed right-side slide-in panel
- `app/(tabularium)/tabularium/components/EtfForm.tsx` — `'use client'` form with asset-class-conditional field visibility; Zod validation on submit
- `app/(tabularium)/tabularium/components/PriceUpdateButton.tsx` — `'use client'` per-row inline price snapshot trigger
- `app/(tabularium)/tabularium/components/HoldingsUpload.tsx` — `'use client'` file input; POSTs CSV to `POST /etfs/{id}/holdings/upload`; displays row-count confirmation

### Technical Overview

`portfolio/page.tsx` follows the exact pattern of `transactions/page.tsx`: Server Component, `fetch` with cache tag, passes the result to the client table component, renders an empty-state message when the list is empty. No layout files are modified — the page renders inside the existing Tabularium layout shell (`CustomNavbar`, `TabulariumSubNav`, `CustomFooter`).

`EtfForm` field visibility is driven by `assetClass` state (mirroring `transactionType` in `TransactionForm`): bonds fields (`bondsClass`, `bondMaturities`, `bondCreditScores`) are shown only when `assetClass = Bonds`; equity market-cap fields are shown only when `assetClass = Equities`. `PriceUpdateButton` submits via a dedicated Server Action that calls `POST /etfs/{id}/price` and then `revalidateTag('etfs')`. `HoldingsUpload` uses a standard `<input type="file" accept=".csv">` element and sends the file as `multipart/form-data` directly to the backend endpoint (not via a Server Action, since Server Actions do not support streaming file uploads natively). `AddEtfButton` is mounted in a right-aligned bar within `portfolio/page.tsx` (not in the layout, unlike `AddTransactionButton` which is layout-level).

---

## GitHub Issues

### Milestone 1 — Database Schema and Alembic Migrations

**Tasks:** TASK-1
**Effort:** 1.0 FTE-day

#### Scope

Set up Alembic in the backend service and write the first versioned migration that creates the three ETF tables with all constraints, foreign keys, cascade rules, GIN and B-Tree indexes.

#### Goal

An idempotent, version-controlled schema baseline that any developer can apply to a fresh PostgreSQL instance to reproduce the exact ETF data model.

#### Deliverables

- Alembic initialized under `backend/alembic/` with `env.py` wired to `Base.metadata`
- `backend/alembic/versions/001_create_etf_tables.py` migration creating `etfs`, `etf_holdings`, `etf_price_history`
- `Etf`, `EtfHolding`, `EtfPriceHistory` ORM models in `src/backend/models.py`
- Unique indexes on `etfs.ticker` and `etfs.isin`
- GIN indexes on `etfs.geographical_distribution` and `etfs.sector_distribution`
- Composite index on `etf_price_history(etf_id, timestamp DESC)`
- Cascade deletes from `etfs` to both child tables

---

### Milestone 2 — Backend CRUD Service Layer

**Tasks:** TASK-2
**Effort:** 1.5 FTE-days

#### Scope

Implement the complete FastAPI service layer for the ETF registry: Pydantic v2 schemas with asset-class-conditional validation, six route handlers covering full CRUD plus price history and CSV holdings upload, and a unit test suite.

#### Goal

A tested, production-ready `/etfs` router that validates all inputs, enforces domain rules, and provides the full API surface the frontend management UI requires.

#### Deliverables

- `src/backend/schemas/etfs.py` with `EtfCreate`, `EtfUpdate`, `EtfResponse`, `EtfPriceCreate`, `EtfHoldingRow`
- `src/backend/routers/etfs.py` with six endpoints: `POST /etfs`, `GET /etfs`, `PUT /etfs/{id}`, `DELETE /etfs/{id}`, `POST /etfs/{id}/price`, `POST /etfs/{id}/holdings/upload`
- `src/backend/main.py` updated with `etfs` router registered at `/etfs`
- `tests/routers/test_etfs.py` covering validation errors, success paths, and atomic CSV upload

---

### Milestone 3 — Administrative Management UI

**Tasks:** TASK-3
**Effort:** 2.0 FTE-days

#### Scope

Replace the `/tabularium/portfolio` placeholder with a live Server Component and a suite of client components providing ETF listing, filtering, creation, editing, deletion, manual price logging, and CSV holdings upload — all within the existing Tabularium layout shell.

#### Goal

A fully functional ETF management view at `/tabularium/portfolio` that respects the two-sub-route constraint, maintains Lighthouse ≥ 90, and mirrors the established Tabularium component conventions.

#### Deliverables

- `app/(tabularium)/tabularium/portfolio/page.tsx` promoted to Server Component with `GET /etfs` fetch and `etfs` cache tag
- `app/(tabularium)/tabularium/etf-schema.ts` Zod `EtfFormSchema`
- `app/(tabularium)/tabularium/etf-actions.ts` Server Actions (`createEtf`, `updateEtf`, `deleteEtf`) with `revalidateTag('etfs')`
- `EtfRegistryTable`, `AddEtfButton`, `EtfDrawer`, `EtfForm`, `PriceUpdateButton`, `HoldingsUpload` client components under `app/(tabularium)/tabularium/components/`
