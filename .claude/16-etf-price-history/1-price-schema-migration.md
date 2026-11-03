# #75: Price Schema Migration

**GitHub Issue:** [75 — Automated Price Retrieval](https://github.com/Volscente/aerarium-saturni/issues/75)
**GitHub Milestone:** [16-etf-price-history](https://github.com/Volscente/aerarium-saturni/milestone/12)
**Notion page:** [ETF Price History](https://app.notion.com/p/16-ETF-Price-History-3f65cc6c0f0780ac9bbfe316750fcac2)

---

## Technical Scope

**In scope:**

- `backend/alembic/versions/006_add_etf_price_symbol_and_daily_unique.py` — new migration (revises `005`): adds nullable `etfs.price_symbol`; collapses same-day `etf_price_history` rows per ETF; adds a unique index on `(etf_id, UTC trading day)`
- `backend/src/backend/models.py` — `Etf.price_symbol` column; matching unique index declared in `EtfPriceHistory.__table_args__`
- `backend/src/backend/schemas/etfs.py` — `price_symbol` on `EtfCreate`, `EtfUpdate`, `EtfResponse`
- `backend/src/backend/routers/etfs.py` — `create_price` and `update_price` map a same-day unique-index `IntegrityError` to HTTP 409 (after a session rollback) instead of a 500
- `backend/tests/conftest.py` — `_make_mock_etf_row` gains `price_symbol`
- `backend/tests/schemas/`, `backend/tests/routers/test_etfs.py` — tests for the new field and the 409 mapping
- `backend/README.md` — document `006`, the `price_symbol` field, the unique daily index, and the `PUT`/`DELETE /etfs/{id}/price/{price_id}` endpoints missing from the interface list

**Out of scope:**

- Provider adapter, upsert logic and `POST /etfs/prices/refresh` (TASK-2)
- Any frontend change, including exposing `price_symbol` in `EtfForm` and making it clearable (TASK-3)
- Applying the "`price_symbol` falls back to `ticker`" rule — done by the TASK-2 symbol resolver; the database stores `NULL`, no backfill
- Removing or otherwise changing the manual price endpoints beyond the 409 mapping (RFC keeps them)

---

## Architecture

```txt
alembic upgrade head   (run from host, DATABASE_URL → localhost)
          │
          ▼
    006.upgrade()
          │
          ├── ADD COLUMN etfs.price_symbol VARCHAR(30) NULL            ── STEP 1
          │
          ├── DELETE duplicate rows from etf_price_history             ── STEP 2
          │     partition by (etf_id, UTC day), keep max(timestamp)
          │
          └── CREATE UNIQUE INDEX uq_etf_price_history_etf_id_day      ── STEP 3
                ON (etf_id, ((timestamp AT TIME ZONE 'UTC')::date))
                    │
                    ▼
    models.py mirrors the DDL (column + Index) so metadata and DB agree
    schemas/etfs.py exposes price_symbol on create / update / response
```

### Why a unique expression index on the UTC day

`etf_price_history.timestamp` is `timestamptz`, so "one row per trading day" has to pick a calendar day. Using `(timestamp AT TIME ZONE 'UTC')::date` is immutable (constant zone), so PostgreSQL accepts it in an index, and it keeps the day boundary independent of session timezone. A separate stored `price_date` column was rejected: it would add a second source of truth next to `timestamp` and force every existing reader (`portfolio.py` latest-price subqueries, `price-history` endpoint) to care about it. Tradeoff: the TASK-2 upsert must use the same expression in its `ON CONFLICT` target, and daily provider data must be stored at a consistent timestamp within the UTC day.

---

## Tech Stack

No new packages required.

---

## Implementation Details

### Modules / Files

| File                                                                  | Action | Description                                                                                  |
| --------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| `backend/alembic/versions/006_add_etf_price_symbol_and_daily_unique.py` | Create | Migration `006` (`down_revision = "005"`); column add, duplicate collapse, unique index      |
| `backend/src/backend/models.py`                                       | Modify | `Etf.price_symbol: Mapped[str \| None]`; unique `Index` on `EtfPriceHistory`                 |
| `backend/src/backend/schemas/etfs.py`                                 | Modify | `price_symbol` on `EtfCreate`, `EtfUpdate`, `EtfResponse`                                    |
| `backend/src/backend/routers/etfs.py`                                 | Modify | Catch `IntegrityError` on commit in `create_price` / `update_price`; `await session.rollback()`; raise `HTTPException(409)` |
| `backend/README.md`                                                   | Modify | Changelog entry, key components, interface list (incl. the undocumented `PUT`/`DELETE` price endpoints) |
| `backend/tests/conftest.py`                                           | Modify | Set `row.price_symbol` in `_make_mock_etf_row` (a `MagicMock(spec=Etf)` otherwise returns a `MagicMock` that fails `EtfResponse` validation) |
| `backend/tests/schemas/test_etf_price_symbol.py`                      | Create | Validation tests for `price_symbol` on the create/update schemas                             |
| `backend/tests/routers/test_etfs.py`                                  | Modify | Create/list tests assert `price_symbol` round-trips                                          |

---

### Key Functions

```python
def upgrade() -> None:
    # Add etfs.price_symbol, collapse same-UTC-day price rows per ETF, add the unique daily index.
```

- Notes: the collapse runs before the index is created, otherwise index creation fails on existing duplicates. Keep the row with the greatest `timestamp` per `(etf_id, UTC day)`; break exact ties by `id` so the result is deterministic.

```python
def downgrade() -> None:
    # Drop the unique daily index and etfs.price_symbol.
```

- Notes: deleted duplicate rows are not restored — the downgrade is schema-only; state this in the docstring.

```python
# routers/etfs.py — inside create_price and update_price
try:
    await session.commit()
except IntegrityError:
    await session.rollback()
    raise HTTPException(status_code=409, detail={"error": "A price already exists for this ETF on that day"})
```

- Notes: the ETF's existence is already checked (404) before the write, so an `IntegrityError` here is the daily unique index; verify this against the handler bodies at implementation time.

Sketch of the collapse statement (raw SQL via `op.execute`):

```sql
DELETE FROM etf_price_history
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY etf_id, (timestamp AT TIME ZONE 'UTC')::date
                   ORDER BY timestamp DESC, id DESC
               ) AS rn
        FROM etf_price_history
    ) ranked
    WHERE rn > 1
);
```

---

### Data Models / Schemas

```python
# models.py
class Etf(Base):
    price_symbol: Mapped[str | None] = mapped_column(String(30), nullable=True)


class EtfPriceHistory(Base):
    __table_args__ = (
        Index("ix_etf_price_history_etf_id_timestamp", "etf_id", "timestamp"),
        Index(
            "uq_etf_price_history_etf_id_day",
            "etf_id",
            text("((timestamp AT TIME ZONE 'UTC')::date)"),
            unique=True,
        ),
    )
```

```python
# schemas/etfs.py
class EtfCreate(BaseModel):
    price_symbol: str | None = Field(default=None, min_length=1, max_length=30)


class EtfUpdate(BaseModel):
    price_symbol: str | None = Field(default=None, min_length=1, max_length=30)


class EtfResponse(BaseModel):
    price_symbol: str | None
```

`String(30)` rather than the `ticker`'s `String(20)`: provider symbols carry an exchange suffix (e.g. `<ticker>.<exchange>`), so they can be longer than the bare ticker.

---

### Testing Strategy

**Unit tests** (`tests/schemas/test_etf_price_symbol.py`, `tests/routers/test_etfs.py`):

- `EtfCreate` without `price_symbol` → valid, field is `None`
- `EtfCreate` with `price_symbol = "VWCE.DE"` → accepted; surrounding whitespace stripped
- `price_symbol = ""` → validation error (`min_length=1`); 31 characters → validation error
- `EtfUpdate` accepts `price_symbol`; omitting it leaves it `None`
- `POST /etfs` with `price_symbol` → 201 and the response carries it; `GET /etfs` rows include `price_symbol` (via the updated `_make_mock_etf_row`)
- `POST /etfs/{id}/price` raising `IntegrityError` on commit → 409, session rolled back
- `PUT /etfs/{id}/price/{price_id}` raising `IntegrityError` on commit → 409, session rolled back
- Existing ETF tests still pass unchanged

**Integration test** (manual, against the Docker Compose database from the host, per the backend README troubleshooting section):

```bash
cd backend
DB_URL=$(docker exec aerarium-saturni-backend-1 printenv DATABASE_URL | sed 's/@database:/@localhost:/')
DATABASE_URL="$DB_URL" uv run alembic upgrade head
DATABASE_URL="$DB_URL" uv run alembic downgrade 005
DATABASE_URL="$DB_URL" uv run alembic upgrade head
```

Verify: upgrade, downgrade and re-upgrade all succeed; `\d etfs` shows `price_symbol`; `\d etf_price_history` shows `uq_etf_price_history_etf_id_day`; inserting two rows for one ETF on the same UTC day fails with a unique violation.

**Edge cases:**

- Seed three same-day rows for one ETF before upgrading → exactly one remains, the one with the latest `timestamp`
- Two rows at `23:30Z` and `00:30Z` on adjacent UTC days → both kept
- Two ETFs with a price on the same day → both kept (index is per ETF)
- ETF with no price rows → upgrade is a no-op for it
- Alembic metadata drift: `alembic revision --autogenerate` after the change produces no diff for these objects

---

### Decisions and Remaining Items

Resolved:

- [x] **Migration number:** `006`, since `005_add_etf_holdings_stock_sector.py` already exists. `planning.md` corrected accordingly.
- [x] **Existing price endpoints vs. the unique index:** TASK-1 maps the `IntegrityError` from `POST /etfs/{id}/price` and `PUT /etfs/{id}/price/{price_id}` to HTTP 409 (in scope above).
- [x] **Same-day collapse rule:** keep the latest `timestamp` per `(etf_id, UTC day)`. `etf_price_history` is currently empty, so the collapse is only a safeguard and no pre-migration data check is needed. The "latest update of the day wins" behaviour for repeated user updates is implemented by TASK-2's upsert, not by this migration.
- [x] **Where the `ticker` fallback lives:** TASK-2's symbol resolver; this task stores `NULL` and does not backfill.
- [x] **Backend README stale:** updated in this task (in scope above).

Deferred:

- [ ] **Clearing `price_symbol`:** `PUT /etfs/{id}` uses `body.model_dump(exclude_none=True)`, so a set `price_symbol` cannot be reset to `NULL`. Harmless until the ETF form exposes the field. **Target:** TASK-3
