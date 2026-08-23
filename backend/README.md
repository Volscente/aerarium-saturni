# Backend

## Purpose

The Backend is the Python FastAPI service for Aerarium Saturni. It owns all data access for the Tabularium pillar — portfolio valuation, transaction aggregation, and future ML simulations — using Python's financial ecosystem (SQLAlchemy, psycopg3, pandas) that is unavailable in the Node.js runtime. Next.js Server Components fetch from this service over HTTP; no client-side API calls are made for sensitive financial data.

## Key components

- **`src/backend/main.py`** — FastAPI application entry point; `lifespan` event creates the `transactions` table via `Base.metadata.create_all`; CORS middleware; transactions router registered at `/transactions`; `GET /health` liveness endpoint
- **`src/backend/db.py`** — Async SQLAlchemy engine and session factory; `get_session` async generator for FastAPI dependency injection
- **`src/backend/models.py`** — `Base` (declarative base); `Transaction` ORM class (14 columns); `Etf` ORM class (25 columns including four JSONB distribution columns); `EtfHolding` child class (8 columns: `id`, `etf_id` FK cascade, `stock_isin` nullable, `stock_ticker` nullable, `stock_country` nullable (ISO 3166-1 alpha-2), `stock_name`, `weight_percentage`, `snapshot_date`; at least one of `stock_isin`/`stock_ticker` required per row; composite index on `(etf_id, snapshot_date)`); `EtfPriceHistory` child class with FK cascade and composite index
- **`backend/alembic.ini`** — Alembic root config; `script_location = alembic`; sqlalchemy.url overridden at runtime from `DATABASE_URL`
- **`backend/alembic/env.py`** — Migration runner; imports `Base.metadata`; synchronous psycopg3 `create_engine` with `NullPool`; `run_migrations_online()` entry point
- **`backend/alembic/versions/001_create_etf_tables.py`** — First migration: `etfs`, `etf_holdings`, `etf_price_history` tables with FK cascades, UNIQUE constraints, GIN indexes on JSONB columns, and composite B-Tree index on `(etf_id, timestamp DESC)`
- **`backend/alembic/versions/002_alter_etf_holdings.py`** — Second migration: drops and recreates `etf_holdings` with RFC schema (`stock_isin`, `stock_name`, `weight_percentage`, `snapshot_date`); composite B-Tree index on `(etf_id, snapshot_date DESC)`
- **`backend/alembic/versions/003_alter_etf_holdings_add_ticker.py`** — Third migration: makes `stock_isin` nullable; adds `stock_ticker VARCHAR(20)` nullable to accommodate iShares/Vanguard CSVs that provide a Ticker instead of an ISIN
- **`backend/alembic/versions/004_add_etf_holdings_stock_country.py`** — Fourth migration: adds `stock_country VARCHAR(2)` nullable to `etf_holdings`, used to disambiguate stock identity when backfilling `stock_isin` from a resolved ticker
- **`src/backend/schemas/transactions.py`** — `TransactionCreate` Pydantic v2 request model with ISIN format validation and `model_validator` (quantity required for buy/sell; ratio required for split); `TransactionUpdate` partial update model (all fields optional, no `model_validator`); `TransactionResponse` response model with ORM-mode serialization
- **`src/backend/schemas/etfs.py`** — `EtfCreate` (ISIN `field_validator`; `model_validator` requiring bond distribution maps when `asset_class = Bonds`); `EtfUpdate` (all fields optional for partial updates); `EtfResponse` (ORM-mode); `EtfPriceCreate`; `EtfPriceResponse`; `EtfHoldingRow` (CSV row parsing: `stock_isin` nullable + `stock_ticker` nullable with `model_validator` requiring at least one; ISIN validator normalises to uppercase, accepts blank/empty as absent)
- **`src/backend/routers/transactions.py`** — `POST /transactions` (HTTP 201), `GET /transactions`, `PUT /transactions/{id}` (HTTP 200, partial update), and `DELETE /transactions/{id}` (HTTP 204) FastAPI route handlers using `Depends(get_session)`
- **`src/backend/routers/etfs.py`** — Seven FastAPI route handlers for ETF CRUD, price history retrieval, manual price logging, and atomic CSV/XLSX holdings upload; uses `Depends(get_session)` and `python-multipart` `UploadFile` for file handling. `upload_holdings` calls `resolve_stock_isin_aliases` after committing the new holdings; a failure there (e.g. OpenFIGI unreachable) is caught and non-fatal — the holdings are already committed, and reconciliation is simply retried on the next upload of any ETF.
- **`src/backend/converters/holdings_xlsx.py`** — `convert_holdings_xlsx(source, ticker=None)`: converts an issuer holdings XLSX export into `EtfHoldingRow`-shaped dict rows; called directly from `upload_holdings` when the uploaded filename ends in `.xlsx`. `source` is a `Path` or an open binary file-like object (e.g. the in-memory uploaded bytes); `ticker` defaults to `source.stem` for a `Path` and is required otherwise. The ticker is resolved from its *leading* alphanumeric token rather than an exact match (`ISSUER_BY_TICKER`: `EUNL`→iShares, `VWCE`→Vanguard, `LYP6`→Amundi), since browsers suffix repeat downloads of the same file (`EUNL (1).xlsx`, `EUNL_2026-07-23.xlsx`) and an exact-stem match would 422 on routine re-uploads. Each per-issuer parser also differs in layout, language, and available identifier (ticker vs ISIN); drops cash/money-market/derivative and zero-weight rows; tolerates Amundi's malformed `styles.xml` by rewriting invalid aRGB color values in memory before retrying. Each row also carries `stock_country` (ISO 3166-1 alpha-2): free from the ISIN's own first two characters for Amundi, translated from the German `Standort` column via the static `GERMAN_COUNTRY_TO_ISO` dict for iShares, taken directly from the already-ISO `Region` column for Vanguard. `write_csv(rows, path)` is a standalone helper (used in tests) for writing converted rows to an inspectable CSV file — not on the upload request path. `resolve_stock_isin_aliases(session, http_client)` backfills `stock_isin` on ticker-only rows: OpenFIGI's `/v3/mapping` only resolves ISIN → ticker (never the reverse), so it resolves every distinct ISIN already in `etf_holdings` to its ticker and updates any row still missing `stock_isin` whose `(stock_ticker, stock_country)` matches — country as well as ticker avoids merging unrelated companies that coincidentally share a ticker on different exchanges.
- **`src/backend/schemas/portfolio.py`** — `PortfolioRowResponse` (six fields: owner, broker_platform, total_invested, current_value, performance_abs, performance_pct — performance fields nullable when price data absent); `PortfolioOverviewResponse` wrapping a list of rows; `HoldingContribution` (per-ETF contribution to a stock's look-through weight); `HoldingExposureResponse` (per-stock look-through exposure with nested `contributions`); `HoldingsExposureResponse` wrapping a list of holdings plus `skipped_etfs`
- **`src/backend/routers/portfolio.py`** — `GET /portfolio/overview` handler; two-phase SQLAlchemy async query (CTE for net holdings per ISIN, correlated subquery for latest price); Python-side grouping and null propagation; `_build_portfolio_query` and `_to_row_response` helpers. `GET /portfolio/holdings/exposure` handler: `_build_holdings_exposure_query` joins each owned ETF's current value (same net-holdings + latest-price pattern, grouped by ISIN alone rather than per owner/broker) against its latest `EtfHolding` snapshot; `get_holdings_exposure` deduplicates per-ETF values, computes each holding's weighted contribution to total portfolio value, and groups by `COALESCE(stock_isin, stock_ticker)`; an ETF with no price record is excluded from the aggregation and reported in `skipped_etfs` rather than nulling the whole response
- **`data/holdings/original/`** — Real issuer XLSX exports (`EUNL.xlsx`, `VWCE.xlsx`, `LYP6.xlsx`) committed as fixtures; used directly by `tests/converters/test_holdings_xlsx.py` and `tests/routers/test_etfs.py`.
- **`pyproject.toml`** — UV workspace member; all runtime dependencies declared
- **`Dockerfile`** — Minimal container image stub; installs UV, syncs dependencies, runs uvicorn

## Public interfaces

- `GET /health` — Liveness check; returns `{"status": "ok"}`; no database dependency; used by Docker Compose health checks and CI smoke tests
- `POST /transactions` — Create a transaction; accepts `TransactionCreate` JSON body; returns `TransactionResponse` (HTTP 201)
- `GET /transactions` — List all transactions ordered by `transaction_date DESC`; optional `?owner=` query parameter filters by portfolio owner; returns `list[TransactionResponse]`
- `PUT /transactions/{id}` — Partial update of an existing transaction's fields; accepts `TransactionUpdate` JSON body (all fields optional); returns updated `TransactionResponse` (HTTP 200); 404 if not found
- `DELETE /transactions/{id}` — Permanently delete a transaction row (HTTP 204); 404 if not found
- `POST /etfs` — Create an ETF; validates ISIN format and asset-class-conditional fields; returns `EtfResponse` (HTTP 201)
- `GET /etfs` — List all ETFs; optional `?ticker=`, `?asset_class=`, `?issuer=` query parameters; returns `list[EtfResponse]`
- `PUT /etfs/{id}` — Partial update of an ETF's scalar or JSONB fields; returns updated `EtfResponse` (HTTP 200); 404 if not found
- `DELETE /etfs/{id}` — Delete an ETF and cascade to holdings and price history (HTTP 204); 404 if not found
- `GET /etfs/{id}/price-history` — List all price snapshots for an ETF ordered by `timestamp DESC`; returns `list[EtfPriceResponse]`; 404 if the ETF does not exist
- `POST /etfs/{id}/price` — Append a manual price snapshot; accepts `EtfPriceCreate`; returns `EtfPriceResponse` (HTTP 201)
- `POST /etfs/{id}/holdings/upload` — Atomically replace all holdings for an ETF from a `multipart/form-data` upload; accepts CSV (unchanged contract) or issuer XLSX — a `.xlsx` filename is run through `convert_holdings_xlsx` first, using the filename's ticker (e.g. `EUNL.xlsx`) to pick the issuer parser; returns `{"inserted_rows": n}` (HTTP 200); rolls back entirely on any row validation error or unrecognised XLSX ticker
- `GET /portfolio/overview` — Aggregate all buy/sell transactions by `(owner, broker_platform)`; returns `PortfolioOverviewResponse` with `total_invested`, `current_value` (nullable), `performance_abs` (nullable), `performance_pct` (nullable) per group; `current_value` is `null` for any group where at least one held ISIN has no price record in `etf_price_history`
- `GET /portfolio/holdings/exposure` — Aggregate look-through single-stock exposure across all owned ETFs; returns `HoldingsExposureResponse` with one `HoldingExposureResponse` per distinct stock identity (ordered by `total_weight_percentage` descending), each carrying a `contributions` breakdown per source ETF; `skipped_etfs` lists tickers excluded from the aggregation for lacking a price record

## External dependencies

- **FastAPI** — Async Python web framework; ASGI-native; built-in `CORSMiddleware` and OpenAPI schema generation
- **uvicorn** — ASGI server; `[standard]` extra enables `uvloop` and `httptools` for production throughput
- **SQLAlchemy (async)** — ORM and query layer; `asyncio` extra provides `create_async_engine` and `AsyncSession`
- **psycopg (binary)** — PostgreSQL driver (psycopg3); supports both async and sync modes — Alembic migration runner works without `asyncio.run()` wrappers; connection string prefix: `postgresql+psycopg://`
- **Pydantic** — Core FastAPI dependency; all future API request and response schemas use Pydantic v2 models
- **PostgreSQL** — Relational database for financial data; connection URL injected via `DATABASE_URL` environment variable
- **Alembic** — Schema migration tool; `alembic upgrade head` applies all pending migrations; `env.py` uses synchronous psycopg3 `create_engine` alongside the async engine in `db.py`
- **python-multipart** — Required by FastAPI's `UploadFile` for `multipart/form-data` parsing; used by the holdings upload endpoint
- **openpyxl** — Reads issuer XLSX holdings exports in `converters/holdings_xlsx.py`, called directly from `upload_holdings` when a `.xlsx` file is uploaded
- **httpx** — Async HTTP client; calls the free OpenFIGI mapping API (`/v3/mapping`) from `resolve_stock_isin_aliases` during holdings upload. No API key required at this data volume.
- **OpenFIGI** (external service, no package dependency) — Free ISIN → ticker mapping API (Bloomberg Open Symbology), used to resolve stock identity across issuers that report different identifier types

## Constraints / invariants

- `GET /health` must return `{"status": "ok"}` even when PostgreSQL is unavailable — it has no database dependency by design.
- `DATABASE_URL` must be set in the environment before the backend starts; the engine is created at module import time and raises `KeyError` immediately if the variable is absent.
- CORS must allowlist `http://localhost:3000` unconditionally; the production origin is controlled by the `FRONTEND_ORIGIN` environment variable and is only added to the allow list when explicitly set.
- The `psycopg[binary]` driver (psycopg3) must be used — not `psycopg2` — because `create_async_engine` requires an async-capable adapter.
- `Base.metadata.create_all()` is called at startup for the `transactions` table only; it remains for backwards compatibility while a baseline Alembic migration for `transactions` is deferred to a follow-up milestone. All new tables must be introduced via Alembic migrations.
- All new schema changes must go through Alembic (`alembic upgrade head`), not `create_all()`. The `transactions` table is the sole exception pending a baseline migration.
- `alembic downgrade base` removes only the ETF tables; the `transactions` table is unaffected (managed by `create_all`, not Alembic). This asymmetry is intentional.
- `backend/Dockerfile` copies only `backend/src/` into the image — `alembic/` and `alembic.ini` are not included. Migrations cannot be run via `docker exec` into the `backend` container; run `alembic` from the host instead (see Usage → Troubleshooting below).
- `resolve_stock_isin_aliases` failures (e.g. OpenFIGI unreachable) must never fail a holdings upload — the holdings are already committed by the time it runs; the reconciliation is simply retried on the next upload of any ETF.
- `GERMAN_COUNTRY_TO_ISO` in `converters/holdings_xlsx.py` only covers country names observed in the current `EUNL.xlsx` fixture; a future upload introducing an unmapped country leaves `stock_country = None` for those rows (no crash, just no ISIN backfill for that row) until the dict is extended.

## Out of scope

- **Alembic baseline migration for `transactions`** — The existing `transactions` table is still created via `create_all()` at startup; a dedicated migration to baseline it is deferred to a follow-up milestone.
- **Portfolio metric calculations** — Cost basis, P&L, TWR, MWR — future analytics initiative.
- **Authentication** — The service is unauthenticated at this stage.
- **CSV import or bulk transaction entry** — Only single-record creation via `POST /transactions` is supported.
- **ML simulations** — Deferred to a dedicated future initiative per backend README.

## Usage

```bash
# Development (from repo root via justfile)
just backend-dev
# → http://localhost:8000
# → http://localhost:8000/health  → {"status":"ok"}
# → http://localhost:8000/docs    → OpenAPI UI

# Development (directly, from backend/)
cd backend
uv run uvicorn backend.main:app --reload --port 8000

# Full-stack (from repo root via Docker Compose)
docker compose up --build -d
# → frontend: http://localhost:3000
# → backend:  http://localhost:8000
# → database: localhost:5432

# Smoke test
curl -s http://localhost:8000/health
# Expected: {"status":"ok"}

# CORS preflight smoke test
curl -s -H "Origin: http://localhost:3000" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS http://localhost:8000/health -v 2>&1 | grep "access-control"
# Expected: access-control-allow-origin: http://localhost:3000
```

### Troubleshooting: applying Alembic migrations against the Docker Compose database

The `backend` container has no `alembic/` directory or `alembic.ini` (see Constraints / invariants), so migrations must run from the host, pointed at `localhost` instead of the in-network `database` hostname:

```bash
cd backend
DB_URL=$(docker exec aerarium-saturni-backend-1 printenv DATABASE_URL | sed 's/@database:/@localhost:/')
DATABASE_URL="$DB_URL" uv run alembic upgrade head
```

**If `upgrade head` fails with `psycopg.errors.DuplicateTable: relation "etfs" already exists"`**: the `etfs`/`etf_holdings`/`etf_price_history` tables were created directly against this database volume (matching the `001` migration's schema) before Alembic was ever run against it, so there is no `alembic_version` row recording that. Stamp the DB at `001` first, then upgrade normally:

```bash
DATABASE_URL="$DB_URL" uv run alembic stamp 001
DATABASE_URL="$DB_URL" uv run alembic upgrade head
```

The symptom at the API level is a `500` on any ETF write endpoint touching the stale table, e.g. `POST /etfs/{id}/holdings/upload` failing with `psycopg.errors.UndefinedColumn: column "stock_isin" of relation "etf_holdings" does not exist` — that's this same drift, not a bug in the upload handler itself.

---

### Changelog

#### 2026-08-22 (v0.4.4)

- `backend/alembic/versions/004_add_etf_holdings_stock_country.py` — New migration: adds nullable `stock_country VARCHAR(2)` to `etf_holdings`.
- `src/backend/models.py` — `EtfHolding.stock_country: Mapped[str | None]` added.
- `src/backend/converters/holdings_xlsx.py` — `GERMAN_COUNTRY_TO_ISO` static dict; `_country_from_isin` (ISIN's first two characters) and `_german_country_to_iso` helpers. Each converter now emits `stock_country`: Amundi from its own ISIN, iShares from `Standort` via the static dict, Vanguard directly from the already-ISO `Region` column. New `resolve_stock_isin_aliases(session, http_client)`: resolves every distinct ISIN in `etf_holdings` to its ticker via OpenFIGI's `/v3/mapping` (`idType=ID_ISIN` — the only direction OpenFIGI's mapping API supports) and backfills `stock_isin` on any row still missing it whose `(stock_ticker, stock_country)` matches; idempotent and order-independent by construction (`stock_isin IS NULL` in the `UPDATE`'s `WHERE`).
- `src/backend/routers/etfs.py` — `upload_holdings` now passes `stock_country` through from the converter's raw row dict (not part of `EtfHoldingRow`) when constructing `EtfHolding`, and calls `resolve_stock_isin_aliases` after commit; a `httpx.HTTPError` there is caught and does not fail the upload.
- `src/backend/schemas/portfolio.py` — New `HoldingContribution`, `HoldingExposureResponse`, `HoldingsExposureResponse` Pydantic v2 schemas.
- `src/backend/routers/portfolio.py` — New `GET /portfolio/holdings/exposure`: `_build_holdings_exposure_query` (net stock quantity per ISIN across all owners/brokers, joined to each ETF's current value and latest `EtfHolding` snapshot) and `get_holdings_exposure` (Python-side dedup of per-ETF values, weighted-contribution computation, and grouping by `COALESCE(stock_isin, stock_ticker)`; a priceless ETF is excluded from the aggregation and listed in `skipped_etfs` rather than nulling the whole response).
- `backend/pyproject.toml` — `httpx>=0.27` moved from the `dev` dependency group to runtime `dependencies`.
- `tests/converters/test_holdings_xlsx.py` — Updated `stock_country` into the three `test_convert_*_valid` key-set/value assertions; new tests for `_country_from_isin`, `_german_country_to_iso`, and `resolve_stock_isin_aliases` (successful backfill, country-mismatch not backfilled, unresolvable ISIN, no-ISINs short-circuit).
- `tests/routers/test_etfs.py` — New tests: `test_upload_holdings_calls_isin_reconciliation`, `test_upload_holdings_succeeds_when_reconciliation_fails`.
- `tests/routers/test_portfolio.py` — 5 new tests for `GET /portfolio/holdings/exposure`: empty, merge-by-ISIN, merge-by-ticker-fallback, residual ISIN/ticker gap not merged, missing-price `skipped_etfs`.
- `tests/conftest.py` — New `_make_holdings_exposure_row` helper, `mock_session_exposure_*` fixtures, and `client_exposure_*` fixtures; `mock_session_with_etfs` now also stubs `result.all` so the reconciliation's distinct-ISIN lookup short-circuits without a real network call in existing upload tests.

#### 2026-08-12 (v0.4.3)

- `src/backend/converters/holdings_xlsx.py` — New module: `convert_holdings_xlsx(source, ticker=None)` converts an issuer XLSX holdings export to `EtfHoldingRow`-shaped dict rows; `source` accepts a `Path` or an open binary file-like object (in-memory uploaded bytes), `ticker` defaults to `source.stem` for a `Path` and is required otherwise. Dispatches on the ticker via `ISSUER_BY_TICKER` to `_convert_ishares`, `_convert_vanguard`, or `_convert_amundi`. Each converter drops cash/money-market/derivative rows (via the issuer's own asset-class column) and rows whose weight rounds to `<= 0` at 4 decimal places, since `EtfHoldingRow` requires `weight_percentage > 0`; each converter emits only the identifier column its issuer actually provides (`stock_ticker` for iShares/Vanguard, `stock_isin` for Amundi) rather than a blank value for the other, since `EtfHoldingRow.stock_ticker` has no blank-to-`None` normalisation (unlike `stock_isin`) and would fail its `min_length=1` constraint on an empty string. `write_csv(rows, path)` is a standalone helper for writing rows to an inspectable CSV, not used on the request path.
- `src/backend/converters/holdings_xlsx.py` — Ticker resolution matches the *leading* alphanumeric token (`_LEADING_TICKER_PATTERN`) rather than requiring the full stem to equal a registered ticker, since browsers suffix repeat downloads of the same issuer file (`EUNL (1).xlsx`, `EUNL_2026-07-23.xlsx`) and an exact match would 422 on filename drift alone during routine re-uploads.
- `src/backend/converters/holdings_xlsx.py` — `_load_workbook` tolerates Amundi's malformed `styles.xml` (`rgb="0xffffff"` instead of a bare hex value, which crashes openpyxl) by rewriting the invalid color values in an in-memory copy of the archive before retrying.
- `src/backend/routers/etfs.py` — `upload_holdings` now branches on the uploaded filename: a `.xlsx` name is read into `io.BytesIO` and passed to `convert_holdings_xlsx` (ticker taken from the filename stem) before the existing per-row `EtfHoldingRow` validation and atomic delete-then-insert; any other filename is parsed as CSV, unchanged. An unrecognised XLSX ticker raises `HTTPException 422` with `{"error": "..."}` rather than the row-indexed `{"row": n, "errors": [...]}` used for CSV/row validation failures.
- `backend/pyproject.toml` — `openpyxl>=3.1.5` moved from the `dev` dependency group to runtime `dependencies`, since conversion now runs as part of the request path, not just tests.
- `tests/converters/test_holdings_xlsx.py` — 11 unit test functions (16 collected cases) run against the real fixtures in `data/holdings/original/`: valid conversion + exact row count for each issuer (EUNL 1231, VWCE 3697, LYP6 609), cash/derivative/futures exclusion per issuer, unknown-ticker `ValueError`, file-like-object input with an explicit ticker, missing-ticker `ValueError` for non-`Path` input, a parametrised `test_convert_resolves_ticker_from_renamed_or_suffixed_filenames` covering 6 filename variants, and a CSV write/read round-trip re-validated against `EtfHoldingRow`.
- `tests/routers/test_etfs.py` — 3 unit tests: `test_upload_holdings_xlsx_valid` (POSTs the real `EUNL.xlsx` fixture, asserts 200 and `inserted_rows == 1231`), `test_upload_holdings_xlsx_valid_with_browser_suffixed_filename` (same fixture uploaded as `EUNL (1).xlsx`), `test_upload_holdings_xlsx_unrecognised_ticker` (422 for an unrecognised XLSX filename ticker).

#### 2026-07-24 (v0.4.2)

- `src/backend/models.py` — `EtfHolding`: `stock_isin` made nullable (`String(12), nullable=True`); new `stock_ticker` column added (`String(20), nullable=True`)
- `src/backend/schemas/etfs.py` — `EtfHoldingRow`: `stock_isin` changed to `str | None = Field(default=None)`; `stock_ticker: str | None` added; `validate_isin` updated to `mode="before"` to treat blank/empty as absent; `validate_identifier_present` `model_validator` added requiring at least one identifier per row
- `backend/alembic/versions/003_alter_etf_holdings_add_ticker.py` — New migration: `ALTER COLUMN stock_isin` to nullable; `ADD COLUMN stock_ticker VARCHAR(20)` nullable; `downgrade` reverses both (note: downgrade fails if any row has `stock_isin = NULL`)
- `tests/schemas/test_etf_holding_row.py` — 3 new tests: `test_valid_row_ticker_only`, `test_valid_row_both_identifiers`, `test_missing_both_identifiers`

#### 2026-07-24 (v0.4.0)

- `src/backend/models.py` — `EtfHolding` ORM class columns replaced: removed `company_name`, `weight_pct`, `sector`, `region`, `market_value`, `shares`; added `stock_isin String(12)`, `stock_name String(200)`, `weight_percentage Numeric(8,4)`, `snapshot_date Date`; composite B-Tree index `ix_etf_holdings_etf_id_snapshot_date` on `(etf_id, snapshot_date)`
- `src/backend/schemas/etfs.py` — `EtfHoldingRow` revised: new fields `stock_isin`, `stock_name`, `weight_percentage`, `snapshot_date`; `validate_isin` `field_validator` added (uppercases before validation, rejects non-12-alphanumeric); added `date` import
- `backend/alembic/versions/002_alter_etf_holdings.py` — New migration: drops `etf_holdings` (001 layout) and recreates with RFC schema; composite B-Tree index on `(etf_id, snapshot_date DESC)` via `sa.text()`; `downgrade` restores 001 column set
- `tests/schemas/test_etf_holding_row.py` — New; 8 unit tests: valid row, short ISIN, non-alphanumeric ISIN, `weight_percentage = 0`, negative weight, missing `stock_name`, missing `snapshot_date`, lowercase ISIN normalisation
- `tests/routers/test_etfs.py` — `test_upload_holdings_valid` and `test_upload_holdings_invalid_row` CSV column names updated to new schema

#### 2026-07-08 (v0.3.6)

- `src/backend/schemas/transactions.py` — Added `TransactionUpdate` Pydantic v2 partial-update model; all fields optional with `None` defaults; no `model_validator`; mirrors `EtfUpdate` in `schemas/etfs.py`
- `src/backend/routers/transactions.py` — Added `PUT /transactions/{id}` (HTTP 200, `setattr` partial-update loop, 404 on unknown id) and `DELETE /transactions/{id}` (HTTP 204, 404 on unknown id) route handlers; imported `UUID`, `HTTPException`, `TransactionUpdate`
- `tests/conftest.py` — Added `mock_session_transaction_found`, `mock_session_transaction_not_found`, `client_transaction_found`, `client_transaction_not_found` fixtures
- `tests/routers/test_transactions.py` — Added `DUMMY_TRANSACTION_ID` constant and 4 new unit tests: `test_update_transaction_success`, `test_update_transaction_not_found`, `test_delete_transaction_success`, `test_delete_transaction_not_found`

#### 2026-07-01 (v0.3.3)

- `src/backend/schemas/portfolio.py` — New `PortfolioRowResponse` and `PortfolioOverviewResponse` Pydantic v2 schemas; performance fields (`current_value`, `performance_abs`, `performance_pct`) are nullable when price data is absent for any held ISIN
- `src/backend/routers/portfolio.py` — New `GET /portfolio/overview` handler; `_build_portfolio_query` builds a holdings CTE (Phase 1) joined with a correlated latest-price subquery on `etf_price_history` (Phase 2); `_to_row_response` computes `performance_abs`/`performance_pct` in Python; `(owner, broker_platform)` grouping and null propagation handled in Python
- `src/backend/main.py` — `portfolio` router registered at prefix `/portfolio`
- `tests/conftest.py` — Added `_make_portfolio_row`, five `mock_session_portfolio_*` fixtures, and five `client_portfolio_*` fixtures
- `tests/routers/test_portfolio.py` — 5 unit tests: empty result, single row with price, multiple rows, null current_value when no price, mixed null/non-null groups

#### 2026-06-19 (v0.3.1)

- `src/backend/schemas/etfs.py` — New Pydantic v2 schemas: `EtfCreate` (ISIN `field_validator`; `model_validator` enforcing bond distribution maps when `asset_class = Bonds`); `EtfUpdate` (all fields optional); `EtfResponse` (ORM-mode, 24 fields); `EtfPriceCreate`; `EtfPriceResponse`; `EtfHoldingRow` (CSV row parsing)
- `src/backend/routers/etfs.py` — New `/etfs` router: `POST /etfs` (201), `GET /etfs` (ILIKE filters on ticker/issuer, exact match on asset_class), `PUT /etfs/{id}` (partial update via setattr loop), `DELETE /etfs/{id}` (204), `POST /etfs/{id}/price` (201), `POST /etfs/{id}/holdings/upload` (atomic delete-then-insert from CSV; 422 with row number on validation failure)
- `src/backend/main.py` — `etfs` router registered at prefix `/etfs`
- `backend/pyproject.toml` — `python-multipart>=0.0.9` added to runtime dependencies
- `tests/conftest.py` — Added `VALID_ETF_PAYLOAD`, `_make_mock_etf_row`, `mock_session_with_etfs`, `mock_session_etf_not_found`, `client_with_etfs`, `client_etf_not_found` fixtures
- `tests/routers/test_etfs.py` — 10 new unit tests covering all six endpoints: valid create, invalid ISIN, bonds validation, empty list, list with rows, update/delete 404, price creation, CSV upload success, CSV upload invalid row

#### 2026-06-19 (v0.3.0)

- `src/backend/models.py` — Added `Etf` ORM class (25 columns: UUID PK, UNIQUE ticker/isin, scalar ETF metadata, four JSONB distribution columns with GIN index declarations in `__table_args__`); `EtfHolding` child class (8 columns, FK `etf_id → etfs.id` ON DELETE CASCADE); `EtfPriceHistory` child class (5 columns, FK cascade, composite B-Tree index on `(etf_id, timestamp DESC)`); imported `Boolean`, `ForeignKey`, `Index`, `Text`, `JSONB`, `relationship`
- `backend/alembic.ini` — New Alembic root config; `script_location = alembic`; `sqlalchemy.url` placeholder overridden at runtime
- `backend/alembic/env.py` — New migration runner; imports `Base.metadata`; synchronous psycopg3 `create_engine` with `NullPool`; `run_migrations_online()` function
- `backend/alembic/script.py.mako` — Standard Alembic migration template
- `backend/alembic/versions/001_create_etf_tables.py` — First migration creating `etfs`, `etf_holdings`, and `etf_price_history` with all constraints, FK cascades, GIN indexes on JSONB columns, and composite B-Tree index on `(etf_id, timestamp DESC)` using `sa.text()`
- `backend/pyproject.toml` — Added `alembic>=1.13` to runtime dependencies

#### 2026-06-11 (v0.2.2)

- `src/backend/models.py` — `quantity` column made nullable (`Mapped[Decimal | None]`); added `ratio: Mapped[str | None] = mapped_column(String(10))` for Split transaction ratio storage
- `src/backend/schemas/transactions.py` — `TransactionCreate`: `quantity` changed to `Decimal | None = Field(default=None, gt=0)`; added `ratio: str | None = None`; added `model_validator(mode="after")` enforcing quantity for buy/sell and ratio for split; `TransactionResponse`: `quantity` updated to `Decimal | None`, `ratio: str | None` added
- `tests/conftest.py` — `_make_mock_row` extended with `row.ratio = overrides.get("ratio", None)` to prevent Pydantic validation errors from un-set MagicMock attributes

#### 2026-06-11 (v0.2.0)

- `src/backend/models.py` — Added `Base` (SQLAlchemy 2.0 `DeclarativeBase`) and `Transaction` ORM class mapping the `transactions` table (13 columns; `owner` and `broker_platform` indexed; `ticker`, `isin`, `price` nullable)
- `src/backend/schemas/transactions.py` — Added `TransactionCreate` Pydantic v2 model with `str_strip_whitespace`, `gt`/`ge` field constraints, and ISIN `field_validator`; added `TransactionResponse` with `from_attributes=True` ORM-mode serialization
- `src/backend/routers/transactions.py` — Added `POST /transactions` (HTTP 201) and `GET /transactions` (optional `?owner=` filter, `transaction_date DESC` ordering)
- `src/backend/main.py` — Added `lifespan` async context manager calling `Base.metadata.create_all` via `conn.run_sync`; registered transactions router at prefix `/transactions`
- `tests/` — New test suite: `conftest.py` with session and engine mocks; `tests/routers/test_transactions.py` with 7 tests covering validation, success paths, and list ordering

#### 2026-06-06

- Initial scaffold: `backend/` UV workspace member materialised from root `pyproject.toml` declaration
- `src/backend/main.py` — FastAPI app with `CORSMiddleware` (localhost:3000 + `FRONTEND_ORIGIN`) and `GET /health` liveness endpoint
- `src/backend/db.py` — Async SQLAlchemy engine (`psycopg[binary]` driver, `DATABASE_URL` env var) and `get_session` async generator for future dependency injection
- `Dockerfile` — Minimal container image stub for use with root `docker-compose.yml`
- Root `docker-compose.yml` created orchestrating `database` (postgres:17-alpine), `backend`, and `frontend` services
- `justfile` — `backend-dev` recipe added
