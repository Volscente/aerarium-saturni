# Backend

## Purpose

The Backend is the Python FastAPI service for Aerarium Saturni. It owns all data access for the Tabularium pillar — portfolio valuation, transaction aggregation, and future ML simulations — using Python's financial ecosystem (SQLAlchemy, psycopg3, pandas) that is unavailable in the Node.js runtime. Next.js Server Components fetch from this service over HTTP; no client-side API calls are made for sensitive financial data.

## Key components

- **`src/backend/main.py`** — FastAPI application entry point; CORS middleware configured for the Next.js dev and production origins; `GET /health` liveness endpoint
- **`src/backend/db.py`** — Async SQLAlchemy engine and session factory; `get_session` async generator for FastAPI dependency injection; no ORM models at this stage
- **`pyproject.toml`** — UV workspace member; all runtime dependencies declared
- **`Dockerfile`** — Minimal container image stub; installs UV, syncs dependencies, runs uvicorn

## Public interfaces

- `GET /health` — Liveness check; returns `{"status": "ok"}`; no database dependency; used by Docker Compose health checks and CI smoke tests

## External dependencies

- **FastAPI** — Async Python web framework; ASGI-native; built-in `CORSMiddleware` and OpenAPI schema generation
- **uvicorn** — ASGI server; `[standard]` extra enables `uvloop` and `httptools` for production throughput
- **SQLAlchemy (async)** — ORM and query layer; `asyncio` extra provides `create_async_engine` and `AsyncSession`
- **psycopg (binary)** — PostgreSQL driver (psycopg3); supports both async and sync modes — Alembic migration runner works without `asyncio.run()` wrappers; connection string prefix: `postgresql+psycopg://`
- **Pydantic** — Core FastAPI dependency; all future API request and response schemas use Pydantic v2 models
- **PostgreSQL** — Relational database for financial data; connection URL injected via `DATABASE_URL` environment variable

## Constraints / invariants

- `GET /health` must return `{"status": "ok"}` even when PostgreSQL is unavailable — it has no database dependency by design.
- `DATABASE_URL` must be set in the environment before the backend starts; the engine is created at module import time and raises `KeyError` immediately if the variable is absent.
- CORS must allowlist `http://localhost:3000` unconditionally; the production origin is controlled by the `FRONTEND_ORIGIN` environment variable and is only added to the allow list when explicitly set.
- The `psycopg[binary]` driver (psycopg3) must be used — not `psycopg2` — because `create_async_engine` requires an async-capable adapter. psycopg3 also supports the sync mode needed by Alembic migrations.
- No ORM models or Alembic migrations are created in this scaffold; those belong to the initiative that implements the first data-backed endpoint.

## Out of scope

- **ORM models and migrations** — Deferred to the first data-backed endpoint initiative; Alembic is not configured here.
- **Business logic API endpoints** — Only `/health` is implemented; all portfolio, transaction, and simulation endpoints are future work.
- **Authentication** — The service is unauthenticated at this stage.
- **Frontend data fetching** — Wiring Next.js Server Components to call this service is deferred until real endpoints exist.

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

#### 2026-06-06

- Initial scaffold: `backend/` UV workspace member materialised from root `pyproject.toml` declaration
- `src/backend/main.py` — FastAPI app with `CORSMiddleware` (localhost:3000 + `FRONTEND_ORIGIN`) and `GET /health` liveness endpoint
- `src/backend/db.py` — Async SQLAlchemy engine (`psycopg[binary]` driver, `DATABASE_URL` env var) and `get_session` async generator for future dependency injection
- `Dockerfile` — Minimal container image stub for use with root `docker-compose.yml`
- Root `docker-compose.yml` created orchestrating `database` (postgres:17-alpine), `backend`, and `frontend` services
- `justfile` — `backend-dev` recipe added
