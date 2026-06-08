# #17: Python Backend Workspace Scaffold

**GitHub Issue:** [#17 — Python Backend Workspace Scaffold](https://github.com/Volscente/aerarium-saturni/issues/17)
**GitHub Milestone:** [5-hybrid-routing-migration](https://github.com/Volscente/aerarium-saturni/milestone/3)
**Notion page:** [5-Hybrid-Routing-Migration](https://app.notion.com/p/5-Hybrid-Routing-Migration-36c5cc6c0f078050b8dae419491a7954)

---

## Technical Scope

**In scope:**

- `backend/pyproject.toml` — UV workspace member; declares FastAPI, uvicorn, SQLAlchemy (async), and psycopg3 (`psycopg[binary]`) dependencies
- `backend/src/backend/__init__.py` — Package marker
- `backend/src/backend/main.py` — FastAPI app; `CORSMiddleware` for `http://localhost:3000` and `$FRONTEND_ORIGIN`; `GET /health` returning `{"status": "ok"}`
- `backend/src/backend/db.py` — Async SQLAlchemy engine pointed at `$DATABASE_URL`; `get_session` async generator for future dependency injection
- `docker-compose.yml` (repository root, new) — Orchestrates `database` (`postgres:17-alpine`, port 5432), `backend` (built from `backend/Dockerfile`, port 8000), `frontend` (built from `frontend/Dockerfile`, port 3000); `backend` and `frontend` depend on `database`; `DATABASE_URL` injected via `.env`
- `justfile` — `backend-dev` recipe added

**Out of scope:**

- ORM models and Alembic migrations (deferred to the first data-backed endpoint initiative)
- Any business logic API endpoints beyond `/health`
- Frontend data fetching from the backend
- Database schema design
- Authentication or authorisation
- `backend/Dockerfile` (required by the root `docker-compose.yml`; must be noted as a prerequisite but its full content is outside the spec's scope — a minimal `Dockerfile` stub is acceptable)

---

## Architecture

```txt
justfile: just backend-dev
          │  cd backend && uv run uvicorn backend.main:app --reload --port 8000
          │
          ▼
    backend/src/backend/main.py — FastAPI app
    ┌─────────────────────────────────────────────────────┐
    │  CORSMiddleware                                      │
    │    allow_origins: ["http://localhost:3000",          │
    │                    os.getenv("FRONTEND_ORIGIN", "")]  │
    └─────────────────────────────────────────────────────┘
          │
          ├── GET /health → {"status": "ok"}     ── no DB dependency
          │
          └── (future routers wired here)
                    │
                    ▼
              backend/src/backend/db.py
              ┌──────────────────────────────────────┐
              │  create_async_engine(DATABASE_URL)    │
              │  async_sessionmaker → AsyncSession    │
              └──────────────────────────────────────┘
                    │  DATABASE_URL env var
                    └── PostgreSQL (docker-compose database service)
```

### Why the `/health` endpoint has no database dependency

A health endpoint that queries the database couples the liveness check to DB availability, making the service appear unhealthy before the database container is ready. Separating liveness (process alive) from readiness (DB reachable) allows Docker Compose health checks and future load-balancer probes to restart the process independently of PostgreSQL startup order.

---

## Tech Stack

New packages introduced (all declared in `backend/pyproject.toml`):

| Package              | Version  | Justification                                                                                     |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `fastapi`            | `>=0.115` | Async Python web framework; native OpenAPI schema generation; built-in `CORSMiddleware`          |
| `uvicorn[standard]`  | `>=0.30`  | ASGI server for FastAPI; `[standard]` installs `uvloop` and `httptools` for production throughput |
| `sqlalchemy[asyncio]`| `>=2.0`   | Async ORM; `asyncio` extra required for `create_async_engine` and `AsyncSession`                 |
| `psycopg[binary]`    | `>=3.1`   | PostgreSQL adapter (psycopg3); supports async and sync — Alembic migration runner works without `asyncio.run()` wrappers; connection prefix: `postgresql+psycopg://` |
| `pydantic`           | `>=2.0`   | Core FastAPI dependency; all future API request/response schemas will use Pydantic v2 models     |

---

## Implementation Details

### Modules / Files

| File                             | Action | Description                                                                         |
| -------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| `backend/pyproject.toml`         | Create | UV workspace member; all runtime dependencies declared; `[project.scripts]` omitted |
| `backend/src/backend/__init__.py` | Create | Empty package marker                                                                |
| `backend/src/backend/main.py`    | Create | FastAPI app instantiation, CORS middleware, `GET /health` route                     |
| `backend/src/backend/db.py`      | Create | Async engine, session factory, `get_session` generator — no models                 |
| `docker-compose.yml`             | Create | Root-level; orchestrates `database`, `backend`, `frontend`; replaces scope of `frontend/docker-compose.yml` for full-stack dev |
| `justfile`                       | Modify | Append `backend-dev` recipe; existing `frontend-*` recipes unchanged               |

---

### Key Functions

```python
async def health() -> dict[str, str]:
    """Return a liveness response with no external dependencies.

    Called by CI, load balancers, and smoke tests immediately after startup
    to confirm the FastAPI process is running before any business logic is
    exercised.

    Returns:
        A dict ``{"status": "ok"}`` serialised as JSON by FastAPI.
    """
```

```python
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async SQLAlchemy session for use as a FastAPI dependency.

    Intended for injection via ``Depends(get_session)`` in future route
    handlers. The session is committed or rolled back by the caller; this
    generator only handles creation and closure.

    Yields:
        An ``AsyncSession`` bound to the engine configured in ``db.py``.

    Raises:
        sqlalchemy.exc.OperationalError: If the database is unreachable when
            the session is first used (not when the generator is entered).
    """
```

---

### Data Models / Schemas

```python
# backend/src/backend/main.py
# FastAPI serialises the dict directly; no Pydantic model required for /health.
# When the first data-backed endpoint is added, define response models in
# backend/src/backend/schemas.py following this pattern:

class HealthResponse(BaseModel):
    status: str = Field(description="Liveness status; always 'ok' when the process is running")
```

---

### Testing Strategy

**Smoke test (manual, required before closing the issue):**

```bash
# Terminal 1 — start the backend
just backend-dev

# Terminal 2 — verify the health endpoint
curl -s http://localhost:8000/health
# Expected: {"status":"ok"}

# Terminal 3 — verify CORS from the Next.js origin
curl -s -H "Origin: http://localhost:3000" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS http://localhost:8000/health -v 2>&1 | grep "access-control"
# Expected: access-control-allow-origin: http://localhost:3000
```

**Full-stack smoke test (manual):**

```bash
# From repo root
docker compose up --build -d
curl -s http://localhost:8000/health
# Expected: {"status":"ok"}
docker compose down
```

**Edge cases:**

- `FRONTEND_ORIGIN` env var not set → CORS should still allow `http://localhost:3000`; production origin should not be in the allow list by accident
- `DATABASE_URL` not set → `db.py` engine creation should fail with a clear `ValueError` or `KeyError`, not silently connect to a wrong host
- `/health` called while PostgreSQL is down → must still return `{"status": "ok"}` (no DB dependency)

---

### Open Questions / Risks

- [x] **Async PostgreSQL driver:** Use `psycopg[binary]>=3.1` (psycopg3). It supports both async and sync modes, so Alembic's migration runner works without `asyncio.run()` wrappers — a concrete advantage over `asyncpg` given that migrations are a confirmed future deliverable. SQLAlchemy connection string prefix: `postgresql+psycopg://`.
- [x] **`backend/Dockerfile` stub:** The root `docker-compose.yml` references `backend/Dockerfile`, which is out of scope for this issue. A minimal stub (`FROM python:3.13-slim`) must be added or the compose file must use a placeholder that does not break `docker compose config`. **Target:** before closing this issue. **Answer:** Let's create a minimal stub as suggested in the Open Question.
- [x] **CORS misconfiguration:** If `CORSMiddleware` is misconfigured, all Server Component fetches to the backend are silently blocked in the browser. The CORS smoke test above is a required gate. **Target:** smoke test must pass before PR is merged. **Answer:** Create and test the smoke test.
