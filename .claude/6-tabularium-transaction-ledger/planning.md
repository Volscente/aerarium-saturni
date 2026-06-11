# Tabularium Transaction Ledger & Input Engine — High-Level Planning

**Project:** Aerarium Saturni
**GitHub repo:** [Volscente/aerarium-saturni](https://github.com/Volscente/aerarium-saturni)
**GitHub Milestone:** [6-tabularium-transaction-ledger](https://github.com/Volscente/aerarium-saturni/milestone/4)
**Notion page:** [6-Tabularium-Transaction-Ledger-Input-Engine](https://app.notion.com/p/6-Tabularium-Transaction-Ledger-Input-Engine-37a5cc6c0f0780a8a9d7cb0bd6ef5119)
**Total estimated effort:** 3 FTE-days (1 FTE = 1 day)

---

## Overview

This initiative introduces the first real data layer in Aerarium Saturni by defining a PostgreSQL schema via SQLAlchemy ORM and exposing FastAPI CRUD endpoints validated by Pydantic v2. On the frontend, a chronological Transaction Ledger view is added at `/tabularium/transactions`, paired with a `+ Add Transaction` right-side drawer accessible from all Tabularium sub-routes, wired through Next.js Server Actions with cache invalidation on submission.

### Dependency Order

```txt
TASK-1 ──► TASK-2 ──┐
       │              ├──► TASK-4
       └──► TASK-3 ──┘
```

---

## TASK-1 — Backend Schema and API

**GitHub Issue:** #{issue}
**Effort estimate:** 1 FTE-day

### Scope

Define the `Transaction` SQLAlchemy ORM model in `src/backend/models.py`, Pydantic v2 request/response schemas in `src/backend/schemas/transactions.py`, and FastAPI CRUD routes for creating and listing transactions. The PostgreSQL table is created at backend startup via `Base.metadata.create_all()`.

### Goal

Deliver a working backend with `POST /transactions` and `GET /transactions` endpoints, backed by a PostgreSQL schema that is future-proofed for cost-basis calculations, multi-user portfolio attribution, and market-data lookup integrations.

### Deliverables

- `src/backend/models.py` — `Base = declarative_base()` and `Transaction` ORM class with all required columns
- `src/backend/schemas/transactions.py` — `TransactionCreate` and `TransactionResponse` Pydantic v2 models
- `src/backend/routers/transactions.py` — `POST /transactions` (HTTP 201) and `GET /transactions` FastAPI routes
- `src/backend/main.py` — startup event calling `Base.metadata.create_all()`; transactions router registered

### Technical Overview

The `Transaction` ORM model contains the following columns:

| Column | Type | Notes |
| :----- | :--- | :---- |
| `id` | `UUID`, PK, default `uuid4` | Immutable identifier |
| `owner` | `String(255)`, not null, indexed | Portfolio owner (plain string; no FK at this stage) |
| `broker_platform` | `Enum('ibkr', 'n26')` | Source brokerage platform |
| `transaction_type` | `Enum('buy', 'sell', 'dividend', 'split')` | Drives form field visibility |
| `asset_class` | `Enum('stock', 'bond', 'etf')` | Drives form field visibility |
| `ticker` | `String(20)`, nullable | Exchange ticker symbol |
| `isin` | `String(12)`, nullable | ISO 6166 identifier; Pydantic validates format when provided |
| `quantity` | `Numeric(14, 4)` | Fractional share support |
| `price` | `Numeric(14, 4)`, nullable | Per-unit price; null for splits |
| `currency` | `String(3)`, not null | ISO 4217 code |
| `fees` | `Numeric(14, 4)`, default `0` | Brokerage fees; required for future cost-basis |
| `transaction_date` | `Date`, not null | Business date |
| `created_at` | `DateTime(timezone=True)`, server default `now()` | Audit timestamp |

`TransactionCreate` uses `ConfigDict(str_strip_whitespace=True)` and a `field_validator` for ISIN format (12 alphanumeric characters when provided). `TransactionResponse` uses `from_attributes=True` for ORM-mode serialization. `GET /transactions` accepts an optional `?owner=` query parameter and returns rows ordered `transaction_date DESC`. The existing `get_session` async generator from `src/backend/db.py` is used for dependency injection.

---

## TASK-2 — Transaction Ledger View

**GitHub Issue:** #{issue}
**Effort estimate:** 0.5 FTE-days

### Scope

Convert the placeholder at `app/(tabularium)/tabularium/transactions/page.tsx` into a Next.js Server Component that fetches and renders the chronological transaction history from the FastAPI backend.

### Goal

Deliver a read-only, server-rendered ledger that displays all recorded transactions ordered newest-first, with full column coverage and correct cache invalidation after new entries are submitted via the drawer.

### Deliverables

- `app/(tabularium)/tabularium/transactions/page.tsx` — Server Component; calls `GET /transactions`; renders a full-width table
- Cache tagged with `{ next: { tags: ['transactions'] } }` for selective invalidation via `revalidateTag`

### Technical Overview

All data fetching happens server-side; no client fetch calls. `fetch()` is called with `{ next: { tags: ['transactions'] } }` so that `revalidateTag('transactions')` in the Server Action selectively re-fetches without invalidating other cached routes. Table columns: Date, Owner, Broker Platform, Type, Asset Class, Ticker, ISIN, Quantity, Price, Currency, Fees. Empty-state handling (no transactions yet) is required. The Lighthouse score at `/tabularium/transactions` must remain ≥ 90.

---

## TASK-3 — Transaction Input Flyout

**GitHub Issue:** #{issue}
**Effort estimate:** 1 FTE-day

### Scope

Build the `+ Add Transaction` trigger button, the right-side drawer panel, and the dynamic form with context-sensitive fields and Zod validation. Wire form submission through a Next.js Server Action that POSTs to the FastAPI backend and invalidates the ledger cache on success.

### Goal

Allow a user to log any of the four transaction types in fewer than 4 clicks or under 15 seconds, with the ledger immediately reflecting the new entry — without a full page reload.

### Deliverables

- `app/(tabularium)/tabularium/components/AddTransactionButton.tsx` — `'use client'` component; controls `isDrawerOpen` state; mounted in the Tabularium layout
- `app/(tabularium)/tabularium/components/TransactionDrawer.tsx` — right-side slide-in panel (Tailwind `translate-x-full` / `translate-x-0` transition, `fixed z-50`)
- `app/(tabularium)/tabularium/components/TransactionForm.tsx` — dynamic form; field visibility driven by `transactionType` and `assetClass`; Zod validation schema mirroring Pydantic rules
- `app/(tabularium)/tabularium/actions.ts` — `createTransaction` Server Action; validates payload, POSTs to `POST /transactions`, calls `revalidateTag('transactions')`, returns success/error signal

### Technical Overview

`AddTransactionButton` is mounted in the Tabularium layout (not inside any sub-route page) so it is always visible regardless of the active sub-route — no React Context required. The dynamic form field visibility matrix:

| Transaction Type | Required fields | Optional fields |
| :--------------- | :-------------- | :-------------- |
| Buy / Sell | Owner, Broker Platform, Quantity, Price, Currency, Fees, Date | Ticker, ISIN |
| Dividend | Owner, Broker Platform, Currency, Amount per share, Date | Ticker, ISIN |
| Split | Owner, Broker Platform, Ratio, Asset Class, Date | Ticker, ISIN |

The Zod schema mirrors Pydantic `TransactionCreate` validation (ISIN format, required fields per type) for immediate client-side feedback before the server round-trip. On success, the Server Action returns a success signal that triggers drawer close on the client.

---

## TASK-4 — Sub-navigation and State Wiring

**GitHub Issue:** #{issue}
**Effort estimate:** 0.5 FTE-days

### Scope

Add the Tabularium sub-navigation component to the shared layout and perform end-to-end verification that the full submission → cache invalidation → ledger refresh cycle works correctly across all three sub-routes.

### Goal

Deliver a persistent sub-navigation bar covering the three Tabularium sub-routes and confirm the complete user journey — submitting a transaction from any sub-route immediately updates the ledger.

### Deliverables

- `app/(tabularium)/tabularium/components/TabulariumSubNav.tsx` — `'use client'` component; three nav links with `usePathname()` active-state prefix matching; uses `roman-*` Tailwind tokens; no Nextra imports
- Updated `app/(tabularium)/tabularium/layout.tsx` — `TabulariumSubNav` inserted between `CustomNavbar` and `{children}`; `AddTransactionButton` also mounted here

### Technical Overview

`TabulariumSubNav` follows the same `usePathname()` prefix-matching pattern as `CustomNavbar` and must remain free of Nextra-specific imports (the Tabularium layout has no Nextra context). End-to-end verification: navigate to `/tabularium/holdings`, open the drawer, submit a transaction, navigate to `/tabularium/transactions` — the new row must appear without a full page reload. Future data-backed sub-routes that depend on transaction data must add a corresponding `revalidateTag` call to `createTransaction` in `actions.ts`.

---

## GitHub Issues

### Milestone 1 — Backend Schema and API

**Tasks:** TASK-1
**Effort:** 1 FTE-day

#### Scope

Define the full PostgreSQL transaction schema via SQLAlchemy ORM, implement Pydantic v2 request/response models, and expose `POST /transactions` and `GET /transactions` FastAPI endpoints with schema creation wired into the backend startup lifecycle.

#### Goal

A working backend that can accept a transaction payload and return a list of stored transactions, forming the data foundation for all subsequent frontend work.

#### Deliverables

- `src/backend/models.py` with `Transaction` ORM model (13 columns including `owner`, `broker_platform`, `ticker`, `isin`, `fees`)
- `src/backend/schemas/transactions.py` with `TransactionCreate` and `TransactionResponse` Pydantic v2 models
- `src/backend/routers/transactions.py` with `POST /transactions` (HTTP 201) and `GET /transactions` routes
- `src/backend/main.py` updated with startup `create_all()` and transactions router registration

---

### Milestone 2 — Transaction Ledger View

**Tasks:** TASK-2
**Effort:** 0.5 FTE-days

#### Scope

Convert the placeholder `/tabularium/transactions` page into a server-rendered chronological ledger consuming `GET /transactions`, with cache tagging for selective invalidation.

#### Goal

A fully functional, read-only Transaction Ledger at `/tabularium/transactions` that displays all stored transactions and refreshes automatically after new entries are submitted.

#### Deliverables

- `app/(tabularium)/tabularium/transactions/page.tsx` converted to Server Component
- Chronological table with columns: Date, Owner, Broker Platform, Type, Asset Class, Ticker, ISIN, Quantity, Price, Currency, Fees
- Cache tagged with `transactions` for `revalidateTag` invalidation

---

### Milestone 3 — Transaction Input Flyout

**Tasks:** TASK-3
**Effort:** 1 FTE-day

#### Scope

Build the `+ Add Transaction` trigger, the right-side drawer, the dynamic transaction form with Zod validation, and the `createTransaction` Server Action with backend integration and cache invalidation.

#### Goal

A user can log a new transaction in fewer than 4 clicks from any Tabularium view; the ledger reflects the new entry immediately with no page reload.

#### Deliverables

- `AddTransactionButton.tsx` client component (drawer trigger) mounted in the Tabularium layout
- `TransactionDrawer.tsx` right-side slide-in panel
- `TransactionForm.tsx` dynamic form with field visibility matrix and Zod schema
- `actions.ts` Server Action: validates payload, calls `POST /transactions`, calls `revalidateTag('transactions')`, signals success to client

---

### Milestone 4 — Sub-navigation and State Wiring

**Tasks:** TASK-4
**Effort:** 0.5 FTE-days

#### Scope

Add the Tabularium sub-navigation component to the shared layout and run end-to-end verification of the full transaction submission → cache invalidation → ledger refresh cycle across all sub-routes.

#### Goal

All three Tabularium sub-routes are linked via a persistent sub-nav bar, and the complete submission-to-refresh journey is verified working in the running application.

#### Deliverables

- `TabulariumSubNav.tsx` client component with three active-state nav links (no Nextra imports)
- Updated `app/(tabularium)/tabularium/layout.tsx` with sub-nav and `AddTransactionButton` mounted
- End-to-end verification confirmed: new transaction submitted from `/tabularium/holdings` appears in `/tabularium/transactions` without page reload
