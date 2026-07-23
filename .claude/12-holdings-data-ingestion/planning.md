# Holdings Data Ingestion — High-Level Planning

**Project:** Aerarium Saturni
**GitHub repo:** [Volscente/aerarium-saturni](https://github.com/Volscente/aerarium-saturni)
**GitHub Milestone:** [12-holdings-data-ingestion](https://github.com/Volscente/aerarium-saturni/milestone/10)
**Notion page:** [Holdings Data Ingestion](https://app.notion.com/p/12-Holdings-Data-Ingestion-3a45cc6c0f0780b3accbf9b0f919a27f)
**Total estimated effort:** 3.0 FTE-days (1 FTE = 1 day)

---

## Overview

This initiative extends the Aerarium Saturni backend with persistent ETF constituent storage and a manual CSV ingestion pipeline. A new `etf_holdings` table is introduced via Alembic migration and backed by `EtfHolding` ORM and `EtfHoldingRow` Pydantic validation layers. A `POST /etfs/{id}/holdings/upload` endpoint atomically replaces an ETF's full constituent list from an issuer-provided CSV, enabling complete look-through visibility for EUNL, VWCE, and LYP6 without relying on capped free-tier financial APIs.

### Dependency Order

```txt
TASK-1 ──► TASK-2
```

---

## TASK-1 — Data Layer

**GitHub Issue:** #{issue}
**Effort estimate:** 1.5 FTE-days

### Scope

Introduce all persistent and validation primitives required by the holdings ingestion feature: the `EtfHolding` SQLAlchemy ORM class, the Alembic migration creating the `etf_holdings` table, and the `EtfHoldingRow` Pydantic v2 model that validates individual CSV rows at the boundary. Unit tests covering schema constraints and Pydantic validation are included.

### Goal

Produce a database-ready holdings schema and a row-level validation contract that the API layer in TASK-2 can import and depend on. Without these primitives the upload endpoint cannot be written or tested in isolation.

### Deliverables

- `src/backend/models.py` — `EtfHolding` ORM class with columns `id`, `etf_id` (FK → `etfs.id` `ON DELETE CASCADE`), `stock_isin`, `stock_name`, `weight_percentage`, `snapshot_date`; composite B-Tree index on `(etf_id, snapshot_date DESC)`
- `backend/alembic/versions/002_create_etf_holdings.py` — Alembic migration creating the `etf_holdings` table with FK constraint, composite index, and `CASCADE` delete; extends the `001_create_etf_tables.py` chain
- `src/backend/schemas/etfs.py` — `EtfHoldingRow` Pydantic v2 model with `field_validator` for ISIN format, positive weight enforcement, and non-null required fields
- `tests/` — Unit tests for `EtfHoldingRow` validation (valid row, invalid ISIN, zero/negative weight, missing required field)

### Technical Overview

`EtfHolding` is a declarative SQLAlchemy child class of `Etf`, following the same FK-cascade pattern already established by `EtfPriceHistory` in `src/backend/models.py`. The composite index `(etf_id, snapshot_date DESC)` supports the primary query pattern: retrieve all current holdings for a given ETF ordered by most-recent snapshot. The Alembic migration must use `sa.text()` for index creation (matching the style of `001_create_etf_tables.py`) and must not call `Base.metadata.create_all()`. `EtfHoldingRow` lives in `src/backend/schemas/etfs.py` alongside the existing ETF schemas; it is used only for CSV row parsing and is not exposed as an API response model.

---

## TASK-2 — API Layer

**GitHub Issue:** #{issue}
**Effort estimate:** 1.5 FTE-days

### Scope

Implement the `POST /etfs/{id}/holdings/upload` endpoint inside the existing `/etfs` router. The handler validates the parent ETF, streams and validates the CSV upload row by row via `EtfHoldingRow`, then atomically replaces all existing holdings within a single `AsyncSession` transaction. Integration and end-to-end tests are included.

### Goal

Deliver a working upload endpoint that can ingest a full issuer-provided CSV for EUNL, VWCE, or LYP6 and atomically replace the stored constituent list, returning a row count on success or a row-specific error on any validation failure.

### Deliverables

- `src/backend/routers/etfs.py` — `POST /etfs/{id}/holdings/upload` route handler: 404 on unknown ETF, row-by-row `EtfHoldingRow` validation with row-number error reporting, atomic `DELETE` + bulk `INSERT` inside `AsyncSession`, returns `{"inserted_rows": n}` (HTTP 200) or `{"detail": "Row {n}: {validation_error}"}` (HTTP 422)
- `tests/routers/test_etfs.py` — Additional test cases: successful upload returning correct row count, upload with an invalid row returning 422 with row number, upload to non-existent ETF returning 404

### Technical Overview

The handler is registered under the existing `/etfs` prefix with no new `APIRouter` — it is a sub-resource route added to `src/backend/routers/etfs.py`. It uses `Depends(get_session)` for session injection and FastAPI's `UploadFile` (via `python-multipart`) for file handling, both already present in the module. The atomic replace sequence: (1) fetch parent `Etf` by `id`, raise `HTTPException(404)` if absent; (2) decode the `UploadFile` byte stream as UTF-8 CSV; (3) validate each row with `EtfHoldingRow`, abort on first error with the 1-indexed row number; (4) within the open `AsyncSession`, execute a `DELETE FROM etf_holdings WHERE etf_id = {id}` statement followed by `session.add_all(...)` for the validated `EtfHolding` instances; (5) commit and return `{"inserted_rows": n}`. SQLAlchemy's `AsyncSession` rolls back automatically on any unhandled exception, preserving the previous snapshot on failure.

---

## GitHub Issues

### Milestone 1 — Data Layer

**Tasks:** TASK-1
**Effort:** 1.5 FTE-days

#### Scope

Introduce the `EtfHolding` ORM class, the Alembic migration for the `etf_holdings` table, and the `EtfHoldingRow` Pydantic v2 validation model. This milestone delivers the full persistence and validation foundation without touching the HTTP layer.

#### Goal

After this milestone, `alembic upgrade head` creates the `etf_holdings` table with correct constraints and indexes, and `EtfHoldingRow` can validate any CSV row in isolation — verified by unit tests.

#### Deliverables

- `EtfHolding` ORM class with FK cascade and composite index in `src/backend/models.py`
- `backend/alembic/versions/002_create_etf_holdings.py` migration
- `EtfHoldingRow` Pydantic v2 model in `src/backend/schemas/etfs.py`
- Unit tests for `EtfHoldingRow` validation cases

---

### Milestone 2 — API Layer

**Tasks:** TASK-2
**Effort:** 1.5 FTE-days

#### Scope

Implement the `POST /etfs/{id}/holdings/upload` endpoint in the existing ETF router, covering the full request lifecycle: parent ETF validation, CSV streaming, row-by-row Pydantic validation, atomic delete-then-insert, and error response formatting. Integration tests verify success and failure paths.

#### Goal

After this milestone, a caller can upload any issuer-provided CSV for EUNL, VWCE, or LYP6 and receive either a confirmed row count or a row-specific validation error — with the database always left in a consistent state.

#### Deliverables

- `POST /etfs/{id}/holdings/upload` route handler in `src/backend/routers/etfs.py`
- Unit tests for upload success, invalid-row 422, and unknown-ETF 404 paths in `tests/routers/test_etfs.py`
