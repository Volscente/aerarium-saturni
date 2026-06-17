# [RFC] ETF Asset Registry — Aerarium Saturni

| Author          | Simone Porreca                                                                         |
| :-------------- | :------------------------------------------------------------------------------------- |
| **Project**     | Aerarium Saturni                                                                       |
| **RFC status**  | Draft                                                                                  |
| **Review deadline** | 2026-06-21                                                                         |
| **Notion page** | [9 — ETF Asset Registry](https://app.notion.com/p/9-ETF-Asset-Registry-37f5cc6c0f07805eb578f4c9a6bfbab6) |
| **GitHub repo** | [Volscente/aerarium-saturni](https://github.com/Volscente/aerarium-saturni)           |
| **Milestone**   | [Milestone: 9-etf-asset-registry](https://github.com/Volscente/aerarium-saturni/milestone/7) |

### Timeline

| Date       | Status | Note  |
| :--------- | :----- | :---- |
| 2026-06-17 | Draft  |       |

### Table of contents

[Motivation](#motivation)

[Objectives](#objectives)

[Scope](#scope)

[ETF Asset Registry](#etf-asset-registry)

[Tech Stack](#tech-stack)

[Effort Estimations](#effort-estimations)

[FAQs](#faqs)

[Risks & Open Questions](#risks--open-questions)

[References](#references)

---

## Motivation {#motivation}

The platform currently has no canonical ETF entity. Transactions reference tickers and ISINs, but there is no master registry storing the identity, metrics, holdings composition, or price history of the underlying funds. Without it, all downstream features — portfolio aggregation, fund comparison, and optimization engines — have no asset definitions to operate on and cannot be built. A structured, queryable ETF registry is the foundational data layer those initiatives depend on. For full context, see the [Notion initiative page](https://app.notion.com/p/9-ETF-Asset-Registry-37f5cc6c0f07805eb578f4c9a6bfbab6).

## Objectives {#objectives}

- **Establish the ETF data layer**: Three Alembic-managed PostgreSQL tables (`etfs`, `etf_holdings`, `etf_price_history`) with correct relational constraints, cascading deletes, and indexes on `ticker`, `isin`, and `(etf_id, timestamp DESC)`.
- **Expose a validated CRUD API**: FastAPI endpoints at `/etfs` for create, list, update, and delete, with Pydantic v2 models rejecting invalid ISINs and missing required fields before any data reaches the database.
- **Enable manual price history logging**: A `POST /etfs/{id}/price` endpoint and corresponding UI trigger allow recording price snapshots per ETF without an automated market data feed.
- **Deliver a searchable management UI**: The `/tabularium/portfolio` route becomes a live ETF registry with client-side filtering by Ticker, Asset Class, and Issuer, following the existing Tabularium layout and component conventions.
- **Support holdings batch ingestion**: A `POST /etfs/{id}/holdings/upload` endpoint and CSV upload interface in the management UI replace or overwrite the constituent holdings for a given ETF in a single transactional operation.

## Scope {#scope}

**In-Scope:**

- Three-table PostgreSQL schema: `etfs` (parent), `etf_holdings` (child), `etf_price_history` (child)
- Alembic-tracked idempotent migrations for all new tables
- FastAPI CRUD endpoints: `POST`, `GET` (list + filter), `PUT`, `DELETE` for ETFs; `POST` for price history; `POST` for holdings CSV upload
- Pydantic v2 request and response models with ISIN format validation and field-level constraints
- Administrative management UI within `/tabularium/portfolio` (replacing the current placeholder)
- Client-side search and filter by Ticker, Asset Class, and Issuer
- Manual price history trigger button per ETF row in the management UI
- CSV batch upload interface to load or overwrite `etf_holdings` for a given ETF

**Out-of-Scope:**

- **Real-time market data feeds**: architectural complexity deferred to a dedicated initiative
- **Portfolio analytics and P&L calculations**: explicitly deferred per backend roadmap
- **User authentication**: unauthenticated at this stage per both service constraints
- **ML simulations**: deferred to a dedicated future initiative
- **Bulk core-ETF metadata import via CSV**: only holdings-level CSV ingestion is in scope

**Constraints:**

- The Tabularium must not gain a third sub-route; the ETF registry UI must fit within an existing route.
- `CustomNavbar` must remain free of Nextra-specific imports.
- All schema changes must go through Alembic-tracked migrations; `create_all()` is not acceptable for new tables.
- Lighthouse performance score must remain ≥ 90 on all existing Tabularium routes.
- `psycopg[binary]` (psycopg3) must be used as the PostgreSQL driver.

---

# **ETF Asset Registry** {#etf-asset-registry}

## Approach Overview {#approach-overview}

The registry is built as a vertical slice across both services. On the backend, three SQLAlchemy ORM models extend the existing `Base` declarative base: `Etf` (parent), `EtfHolding` (child, many-to-one with cascade delete), and `EtfPriceHistory` (child, many-to-one with cascade delete). All three tables are introduced via Alembic — this milestone marks the first adoption of Alembic in the service, superseding the `create_all()` approach for any future schema changes. A new FastAPI router registered at `/etfs` (not `/transactions/etfs`, see [FAQ](#faqs)) exposes CRUD operations, a manual price-point submission endpoint, and a CSV holdings upload endpoint. On the frontend, the existing `/tabularium/portfolio` placeholder page is replaced by a real Server Component that fetches the ETF list and renders the management UI within the established Tabularium layout shell.

The proposal's approach direction — a three-table PostgreSQL schema with JSONB distribution maps, a FastAPI CRUD layer, and a Tabularium management panel — is adopted in full. Two adjustments are made: the API router is placed at `/etfs` rather than `/transactions/etfs` (domain clarity), and the management UI is housed in `/tabularium/portfolio` rather than a new third sub-route (frontend invariant compliance).

### Integration {#integration}

**Backend:** The new `Etf`, `EtfHolding`, and `EtfPriceHistory` models are added to `src/backend/models.py` alongside the existing `Transaction`, sharing the same `Base`. Alembic's `env.py` imports `Base.metadata` and uses the existing sync-compatible psycopg3 connection string to run migrations. The new `etfs` router is registered in `main.py` at prefix `/etfs`; the `lifespan` event handler no longer needs to call `create_all()` for newly introduced tables once Alembic is the source of truth. The existing `db.py` engine and `get_session` factory are reused without modification.

**Frontend:** `app/(tabularium)/tabularium/portfolio/page.tsx` is promoted from a placeholder to a Next.js Server Component. It fetches `GET /etfs` with `{ next: { tags: ['etfs'] } }` and renders the management table, following the exact pattern of `transactions/page.tsx`. New `'use client'` components (`EtfRegistryTable`, `AddEtfButton`, `EtfDrawer`, `EtfForm`, `PriceUpdateButton`, `HoldingsUpload`) are added under `app/(tabularium)/tabularium/components/`. A new `etf-schema.ts` (no directive, importable by both server and client) defines the Zod schema for ETF form validation, mirroring `transaction-schema.ts`. A new `etf-actions.ts` Server Action handles create, update, and delete, calling `revalidateTag('etfs')` after each write.

## Database Schema and Alembic Migrations {#database-schema-and-alembic-migrations}

The `etfs` table stores the parent ETF record with a UUID primary key, unique-indexed `ticker` and `isin` columns, scalar metadata columns (issuer, name, asset class, index, TER, domicile, currency hedged flag, fiscal year end, German tax classification, replication strategy, fund size, monthly volume, volatility fields, dividend fields, macro holdings overview), and four JSONB columns: `geographical_distribution`, `sector_distribution`, `bond_maturities` (nullable), and `bond_credit_scores` (nullable). JSONB is used for the open-ended distribution maps because the key space (country codes, sector names) varies across funds and would cause column bloat if normalized; GIN indexes allow deep querying when needed.

The `etf_holdings` table stores constituent positions (company name, weight percentage, sector, region, market value, shares) with a foreign key `etf_id → etfs.id` and `ON DELETE CASCADE`. The `etf_price_history` table stores price snapshots (price, currency, timestamp) with the same cascade pattern and a composite index on `(etf_id, timestamp DESC)` to support O(1) latest-price lookups.

Alembic is initialized under `backend/alembic/`. The `env.py` uses a synchronous connection URL (replacing `postgresql+psycopg://` with `postgresql+psycopg2://` for the migration runner only, or using psycopg3's sync interface) to avoid the `asyncio.run()` wrapper complexity. The first revision creates all three tables and their indexes in a single migration. The `lifespan` handler in `main.py` remains for backwards compatibility with the `transactions` table until a follow-up migration baseline is established.

## Backend CRUD Service Layer {#backend-crud-service-layer}

The `etfs` router exposes:

| Method | Path | Description | Status |
| :----- | :--- | :---------- | :----- |
| `POST` | `/etfs` | Create an ETF; validates ISIN format, required fields by asset class | 201 |
| `GET` | `/etfs` | List all ETFs; optional `?ticker=`, `?asset_class=`, `?issuer=` filters | 200 |
| `PUT` | `/etfs/{id}` | Update scalar fields or replace specific JSONB distribution blocks | 200 |
| `DELETE` | `/etfs/{id}` | Delete ETF and cascade to holdings and price history | 204 |
| `POST` | `/etfs/{id}/price` | Append a manual price snapshot to `etf_price_history` | 201 |
| `POST` | `/etfs/{id}/holdings/upload` | Replace all `etf_holdings` for this ETF from a CSV file | 200 |

Pydantic v2 models: `EtfCreate` (full required + optional fields with asset-class-conditional validators — bonds fields required when `asset_class = Bonds`), `EtfUpdate` (all fields optional for partial updates), `EtfResponse` (ORM-mode), `EtfPriceCreate`, `EtfHoldingRow` (used for CSV parsing). The CSV upload endpoint reads the multipart file, parses rows into `EtfHoldingRow` models, deletes existing holdings for that ETF within a transaction, and bulk-inserts the new rows; any parsing error rolls back the entire operation.

## Administrative Management UI {#administrative-management-ui}

`/tabularium/portfolio/page.tsx` becomes a Server Component that fetches `GET /etfs` and passes the result to `EtfRegistryTable`. The page renders within the existing Tabularium layout shell (no Nextra chrome, `CustomNavbar`, `TabulariumSubNav` with its active-state `/tabularium/portfolio` link, `CustomFooter`). No layout files are modified.

`EtfRegistryTable` (`'use client'`) holds the filter state (ticker prefix, asset class dropdown, issuer prefix) and renders the filtered ETF rows. Each row includes a `PriceUpdateButton` that opens a small inline form to submit a price snapshot via a Server Action, and an edit/delete action. `AddEtfButton` (mirroring `AddTransactionButton`) sits in a right-aligned bar on the page and opens `EtfDrawer` → `EtfForm`. `HoldingsUpload` is a file input component accessible per-row (or from a detail panel) that POSTs the CSV to `POST /etfs/{id}/holdings/upload` and displays a row-count confirmation on success.

## Tech Stack {#tech-stack}

- **Python**: Backend language; required for the SQLAlchemy and financial data ecosystem not available in the Node.js runtime.
- **FastAPI**: Existing async web framework; the new `/etfs` router follows the same `Depends(get_session)` pattern as the existing `/transactions` router.
- **SQLAlchemy 2.0 (async)**: Existing ORM layer; `Etf`, `EtfHolding`, and `EtfPriceHistory` models extend the existing `Base` declarative base without modification.
- **psycopg3 (psycopg[binary])**: Required by the existing async engine constraint; must not be replaced with psycopg2 under any circumstance.
- **Pydantic v2**: Core FastAPI dependency; all new request and response schemas use v2 models consistent with the existing transactions schemas.
- **PostgreSQL 17 (JSONB)**: Existing database; JSONB columns for the four distribution maps avoid column bloat for open-ended key-value data while supporting GIN indexing.
- **Alembic**: First adoption in this service; required because `create_all()` provides no versioning for schema changes. The backend README explicitly reserved Alembic for the first schema-change initiative — this is it.
- **Next.js 15**: Existing frontend framework; Server Components fetch from `/etfs` at request time using the `{ next: { tags: ['etfs'] } }` cache tag pattern.
- **Tailwind CSS**: Existing styling system; `roman-*` custom tokens are used throughout the Tabularium layout and must be followed for new components.
- **Zod**: Existing frontend validation library; the ETF form schema in `etf-schema.ts` mirrors the `TransactionFormSchema` pattern.

**Desired / experimental:**

- **Alembic**: New tool for this project. The backend README flagged it as the required migration path for the first schema change. Adopting it here establishes the pattern for all future schema evolutions.

## Effort Estimations {#effort-estimations}

Total estimated effort: **8 sessions**.

| Milestone | Description | Est. effort | GitHub Issue |
| :-------- | :---------- | :---------- | :----------- |
| M1 — Database schema and Alembic migrations | Initialize Alembic; write first revision creating `etfs`, `etf_holdings`, `etf_price_history` with constraints and indexes; verify idempotency | 1.0 | #39 |
| M2 — Backend CRUD service layer | ORM models, Pydantic v2 schemas, `/etfs` router (CRUD + price + CSV upload endpoints), unit tests | 1.5 | #40 |
| M3 — Administrative management UI | `portfolio/page.tsx` Server Component, `EtfRegistryTable`, `EtfForm`/`EtfDrawer`, `PriceUpdateButton`, `HoldingsUpload`, `etf-actions.ts`, `etf-schema.ts` | 2.0 | #41 |

### Recommended Order

1. M1 — Database schema and Alembic migrations (no dependencies; establishes the schema contract for M2)
2. M2 — Backend CRUD service layer (depends on M1 migrations being applied; unlocks M3 frontend integration)
3. M3 — Administrative management UI (depends on M2 endpoints being reachable; can be developed against mock data in parallel if needed)

---

# **FAQs** {#faqs}

**Q: Why is the ETF router at `/etfs` rather than `/transactions/etfs` as described in the initiative?**

A: ETFs are reference data — asset definitions that describe a fund's identity, composition, and metrics. The `/transactions` router handles financial event records (buys, sells, dividends, splits). Routing asset definitions under `/transactions` would conflate two semantically distinct domains, make the OpenAPI schema confusing, and couple the ETF resource lifecycle to the transaction resource. A dedicated `/etfs` prefix is cleaner and avoids future refactoring when the registry grows to cover non-ETF asset classes.

**Q: Why does the management UI live in `/tabularium/portfolio` rather than a new dedicated sub-route?**

A: The frontend README states a hard invariant: "The Tabularium has exactly two sub-routes: `/tabularium/portfolio` and `/tabularium/transactions`." Adding a third sub-route without first consolidating or splitting the portfolio page violates that constraint. The portfolio page was always intended to cover holdings, allocation, and performance — the ETF registry is the holdings data layer that makes that page real. Repurposing it avoids the invariant violation and fulfils the page's original intent simultaneously.

**Q: How does Alembic work with the async psycopg3 driver?**

A: Alembic's migration runner is synchronous by default. The `env.py` uses a sync-compatible connection to run migrations — either by using psycopg3's synchronous interface (`postgresql+psycopg://` with `use_insertmanyvalues=True` and a sync `connect()`) or by configuring a separate sync URL for the migration context only. The async `create_async_engine` in `db.py` is not used by Alembic; the two configurations coexist independently in the same codebase.

**Q: Why use JSONB for distribution maps rather than normalized junction tables?**

A: The geographical and sector distribution maps have an open key space — country codes and sector names vary across funds and can expand without a schema change. Normalizing them would require a junction table with a `key` column, making aggregate queries less readable and requiring migrations for every new key type. JSONB stores them as typed objects, allows GIN indexing for containment queries, and keeps the `etfs` table self-contained. The trade-off is that Pydantic models must enforce structure at the API boundary since the database accepts any valid JSON.

**Q: How is the CSV holdings upload failure handled?**

A: The upload endpoint wraps the delete-then-insert sequence in a single database transaction. If any CSV row fails Pydantic validation or any insert raises a constraint error, the transaction is rolled back and the endpoint returns a 422 with row-level error details. The existing holdings are never partially replaced — it is an atomic all-or-nothing replacement.

**Q: Terminology?**

A:

- **ETF** → Exchange-Traded Fund; a pooled investment vehicle traded on an exchange, tracking an index or strategy
- **ISIN** → International Securities Identification Number; 12-character alphanumeric identifier standardizing global security identification
- **TER** → Total Expense Ratio; annual fund operating cost expressed as a percentage of AUM
- **AUM** → Assets Under Management; total market value of assets a fund manages
- **JSONB** → JSON Binary; PostgreSQL's binary-encoded JSON column type, supporting indexing and operators
- **CRUD** → Create, Read, Update, Delete; the four standard database operations
- **ORM** → Object-Relational Mapper; translates between Python objects and database rows (SQLAlchemy in this project)
- **GIN** → Generalized Inverted Index; PostgreSQL index type used for JSONB containment queries

---

## Risks & Open Questions {#risks--open-questions}

| Risk / Question | Likelihood | Mitigation / Answer |
| :-------------- | :--------- | :------------------ |
| Alembic `env.py` async compatibility: configuring the migration runner to work alongside the async psycopg3 engine without `asyncio.run()` wrappers may require non-obvious setup | Medium | Use psycopg3's synchronous interface in `env.py` only; keep the async engine in `db.py` separate; validate with a real PostgreSQL instance in a spike before M1 merges |
| `/tabularium/portfolio` repurposing conflates ETF registry management with portfolio dashboard UX — the page may need to be split in a future initiative when portfolio analytics are added | Low (now) / Medium (over time) | Design `portfolio/page.tsx` with clearly separated component boundaries (registry section vs. analytics section placeholder) so a future split requires extracting components, not rewriting them |
| JSONB distribution validation: JSONB columns accept arbitrary JSON; invalid distribution maps (negative percentages, unknown keys) can enter the database if Pydantic models are not strict enough | Medium | Define explicit typed Pydantic models for each JSONB block (e.g., `GeographicalDistribution = dict[str, float]` with `@field_validator` enforcing 0–100 range and non-empty keys); reject unknown top-level keys |
| CSV holdings upload partial failure: large CSVs with a bad row near the end waste round-trip time before rolling back; users may not get actionable error messages | Medium | Return structured error responses with row number and field name; add a client-side CSV preview step that validates headers before upload |
| ETF route naming open question: `/transactions/etfs` (initiative) vs. `/etfs` (this RFC) — the author should confirm before implementation to avoid a mid-milestone rename | Low | Confirm in RFC review; the designed approach (`/etfs`) is the recommendation |

## References {#references}

- [Notion initiative page — 9 ETF Asset Registry](https://app.notion.com/p/9-ETF-Asset-Registry-37f5cc6c0f07805eb578f4c9a6bfbab6)
- [GitHub repository — Volscente/aerarium-saturni](https://github.com/Volscente/aerarium-saturni)
- [GitHub Milestone — 9-etf-asset-registry](https://github.com/Volscente/aerarium-saturni/milestone/7)
- [Alembic documentation — async environments](https://alembic.sqlalchemy.org/en/latest/cookbook.html#using-asyncio-with-alembic)
- [PostgreSQL JSONB documentation](https://www.postgresql.org/docs/17/datatype-json.html)
