# Backend

## Purpose

The Backend is the Python FastAPI service for Aerarium Saturni. It owns all data access for the Tabularium pillar — portfolio valuation, transaction aggregation, and future ML simulations — using Python's financial ecosystem (SQLAlchemy, psycopg3, pandas) that is unavailable in the Node.js runtime. Next.js Server Components fetch from this service over HTTP; no client-side API calls are made for sensitive financial data.

## Key components

- **`src/backend/main.py`** — FastAPI application entry point; `lifespan` event creates the `transactions` table via `Base.metadata.create_all`; CORS middleware; transactions router registered at `/transactions`; `GET /health` liveness endpoint
- **`src/backend/db.py`** — Async SQLAlchemy engine and session factory; `get_session` async generator for FastAPI dependency injection
- **`src/backend/models.py`** — `Base` (declarative base); `Transaction` ORM class (14 columns); `Etf` ORM class (25 columns including four JSONB distribution columns); `EtfHolding` and `EtfPriceHistory` child classes with FK cascades and composite index
- **`backend/alembic.ini`** — Alembic root config; `script_location = alembic`; sqlalchemy.url overridden at runtime from `DATABASE_URL`
- **`backend/alembic/env.py`** — Migration runner; imports `Base.metadata`; synchronous psycopg3 `create_engine` with `NullPool`; `run_migrations_online()` entry point
- **`backend/alembic/versions/001_create_etf_tables.py`** — First migration: `etfs`, `etf_holdings`, `etf_price_history` tables with FK cascades, UNIQUE constraints, GIN indexes on JSONB columns, and composite B-Tree index on `(etf_id, timestamp DESC)`
- **`src/backend/schemas/transactions.py`** — `TransactionCreate` Pydantic v2 request model with ISIN format validation and `model_validator` (quantity required for buy/sell; ratio required for split); `TransactionResponse` response model with ORM-mode serialization
- **`src/backend/routers/transactions.py`** — `POST /transactions` (HTTP 201) and `GET /transactions` FastAPI route handlers using `Depends(get_session)`
- **`pyproject.toml`** — UV workspace member; all runtime dependencies declared
- **`Dockerfile`** — Minimal container image stub; installs UV, syncs dependencies, runs uvicorn

## Public interfaces

- `GET /health` — Liveness check; returns `{"status": "ok"}`; no database dependency; used by Docker Compose health checks and CI smoke tests
- `POST /transactions` — Create a transaction; accepts `TransactionCreate` JSON body; returns `TransactionResponse` (HTTP 201)
- `GET /transactions` — List all transactions ordered by `transaction_date DESC`; optional `?owner=` query parameter filters by portfolio owner; returns `list[TransactionResponse]`

## External dependencies

- **FastAPI** — Async Python web framework; ASGI-native; built-in `CORSMiddleware` and OpenAPI schema generation
- **uvicorn** — ASGI server; `[standard]` extra enables `uvloop` and `httptools` for production throughput
- **SQLAlchemy (async)** — ORM and query layer; `asyncio` extra provides `create_async_engine` and `AsyncSession`
- **psycopg (binary)** — PostgreSQL driver (psycopg3); supports both async and sync modes — Alembic migration runner works without `asyncio.run()` wrappers; connection string prefix: `postgresql+psycopg://`
- **Pydantic** — Core FastAPI dependency; all future API request and response schemas use Pydantic v2 models
- **PostgreSQL** — Relational database for financial data; connection URL injected via `DATABASE_URL` environment variable
- **Alembic** — Schema migration tool; `alembic upgrade head` applies all pending migrations; `env.py` uses synchronous psycopg3 `create_engine` alongside the async engine in `db.py`

## Constraints / invariants

- `GET /health` must return `{"status": "ok"}` even when PostgreSQL is unavailable — it has no database dependency by design.
- `DATABASE_URL` must be set in the environment before the backend starts; the engine is created at module import time and raises `KeyError` immediately if the variable is absent.
- CORS must allowlist `http://localhost:3000` unconditionally; the production origin is controlled by the `FRONTEND_ORIGIN` environment variable and is only added to the allow list when explicitly set.
- The `psycopg[binary]` driver (psycopg3) must be used — not `psycopg2` — because `create_async_engine` requires an async-capable adapter.
- `Base.metadata.create_all()` is called at startup for the `transactions` table only; it remains for backwards compatibility while a baseline Alembic migration for `transactions` is deferred to a follow-up milestone. All new tables must be introduced via Alembic migrations.
- All new schema changes must go through Alembic (`alembic upgrade head`), not `create_all()`. The `transactions` table is the sole exception pending a baseline migration.
- `alembic downgrade base` removes only the ETF tables; the `transactions` table is unaffected (managed by `create_all`, not Alembic). This asymmetry is intentional.

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

---

### Changelog

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
