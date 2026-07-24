# #64: API Layer — ETF Holdings Upload

**GitHub Issue:** [#64 — API Layer](https://github.com/Volscente/aerarium-saturni/issues/64)
**GitHub Milestone:** [12-holdings-data-ingestion](https://github.com/Volscente/aerarium-saturni/milestone/10)
**Notion page:** [Holdings Data Ingestion](https://app.notion.com/p/12-Holdings-Data-Ingestion-3a45cc6c0f0780b3accbf9b0f919a27f)

---

## Technical Scope

**In scope:**

- `backend/src/backend/routers/etfs.py` — Add `POST /{id}/holdings/upload` route handler to the existing `etfs` router
- `backend/tests/routers/test_etfs.py` — Add three new test cases: valid upload, invalid-row 422, unknown-ETF 404

**Out of scope:**

- New `APIRouter` prefix — the endpoint is a sub-resource registered directly in `routers/etfs.py`
- `EtfHolding` ORM class and `EtfHoldingRow` schema — delivered by TASK-1 (#63)
- `GET /etfs/{id}/holdings` read endpoint — not in scope for this initiative
- New runtime dependencies — `python-multipart`, `UploadFile`, and `Depends(get_session)` are already present

---

## Architecture

```txt
Client (multipart/form-data)
          │  POST /etfs/{id}/holdings/upload
          │  file=<issuer-csv>
          ▼
    upload_holdings(id, file, session)
    ┌─────────────────────────────────────────────────┐
    │  1. SELECT Etf WHERE id = {id}                  │
    │     → 404 HTTPException if not found            │
    │                                                 │
    │  2. Read UploadFile bytes → decode UTF-8 CSV    │
    │     → csv.DictReader row iteration              │
    │                                                 │
    │  3. EtfHoldingRow(**row_dict) for each row      │
    │     → ValidationError → HTTPException 422       │
    │       {"row": n, "errors": [...]}               │
    │                                                 │
    │  4. AsyncSession transaction                    │
    │     DELETE FROM etf_holdings WHERE etf_id = id  │
    │     session.add_all([EtfHolding(...), ...])     │
    │     await session.commit()                      │
    └─────────────────────────────────────────────────┘
          │  → {"inserted_rows": n}  HTTP 200
```

### Why atomic delete-then-insert, not upsert

ETF constituent lists are always published as complete point-in-time snapshots; stocks enter and exit between rebalancing dates. Upsert would require a stable cross-upload primary key and would leave stale rows for removed constituents. Full replacement keeps `etf_holdings` exactly consistent with the issuer file and avoids tracking deletions explicitly.

---

## Tech Stack

No new packages required. All dependencies are already declared in `backend/pyproject.toml`:

- `python-multipart>=0.0.9` — `UploadFile` multipart parsing (added in v0.3.1)
- `fastapi`, `sqlalchemy[asyncio]`, `pydantic` — already present

---

## Implementation Details

### Modules / Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `backend/src/backend/routers/etfs.py` | Modify | Add `upload_holdings` route handler at line ~200 |
| `backend/tests/routers/test_etfs.py` | Modify | Add `test_upload_holdings_valid`, `test_upload_holdings_invalid_row`, `test_upload_holdings_etf_not_found` |

---

### Key Functions

```python
@router.post("/{id}/holdings/upload", status_code=200)
async def upload_holdings(
    id: UUID,
    file: UploadFile,
    session: AsyncSession = Depends(get_session),
) -> dict[str, int]:
    """Replace all holdings for an ETF atomically from a CSV upload.

    Reads the uploaded CSV, parses each row into an ``EtfHoldingRow`` model,
    then within a single session transaction deletes all existing
    ``etf_holdings`` rows for the given ETF and bulk-inserts the new rows.
    Any row validation failure rolls back the entire operation and returns
    the 1-indexed failing row number.

    Args:
        id: UUID of the parent ETF; raises 404 if not found in ``etfs`` table.
        file: Uploaded CSV; required columns: ``stock_isin``, ``stock_name``,
            ``weight_percentage``, ``snapshot_date``.
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        ``{"inserted_rows": n}`` — count of successfully inserted holding rows.

    Raises:
        HTTPException 404: If no ETF with the given ``id`` exists.
        HTTPException 422: If any CSV row fails ``EtfHoldingRow`` validation;
            body is ``{"row": n, "errors": [...]}``.
    """
```

---

### CSV Format

The handler is issuer-agnostic at the protocol level: it reads any UTF-8 CSV whose header row matches `EtfHoldingRow` field names exactly.

| Column | Type | Constraint |
| ------ | ---- | ---------- |
| `stock_isin` | `str` | 12 alphanumeric characters; normalised to uppercase |
| `stock_name` | `str` | 1–200 characters |
| `weight_percentage` | `Decimal` | `> 0` |
| `snapshot_date` | `date` | ISO 8601 (`YYYY-MM-DD`) |

Callers must pre-convert issuer XLS exports to CSV before uploading; XLS parsing is out of scope.

---

### Data Models / Schemas

`EtfHoldingRow` (defined in `backend/src/backend/schemas/etfs.py`, delivered by TASK-1):

```python
class EtfHoldingRow(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    stock_isin: str                             # validated: 12 alnum, uppercased
    stock_name: str = Field(min_length=1, max_length=200)
    weight_percentage: Decimal = Field(gt=0)
    snapshot_date: date
```

`EtfHolding` ORM class (defined in `backend/src/backend/models.py`, delivered by TASK-1):

```python
class EtfHolding(Base):
    __tablename__ = "etf_holdings"

    id: Mapped[UUID]
    etf_id: Mapped[UUID]          # FK → etfs.id ON DELETE CASCADE
    stock_isin: Mapped[str]       # String(12)
    stock_name: Mapped[str]       # String(200)
    weight_percentage: Mapped[Decimal]  # Numeric(8,4)
    snapshot_date: Mapped[date]
    # composite index: (etf_id, snapshot_date DESC)
```

---

### Testing Strategy

**Unit tests** (`backend/tests/routers/test_etfs.py`):

- `test_upload_holdings_valid` — POST valid two-row CSV → assert HTTP 200, `{"inserted_rows": 2}`
- `test_upload_holdings_invalid_row` — POST CSV with `weight_percentage = "not_a_number"` → assert HTTP 422, `response.json()["detail"]["row"] == 1`
- `test_upload_holdings_etf_not_found` — POST to unknown UUID using `client_etf_not_found` fixture → assert HTTP 404

All three tests use `client_with_etfs` or `client_etf_not_found` from `backend/tests/conftest.py`; no new fixtures are needed.

**Integration test** (manual, against a live PostgreSQL instance):

```bash
curl -X POST http://localhost:8000/etfs/<etf-uuid>/holdings/upload \
     -F "file=@vwce_holdings.csv;type=text/csv"
# Expected: {"inserted_rows": <n>}
```

Verify: row count matches the line count of the CSV minus the header; a second upload with a different snapshot returns the same structure and replaces all rows.

**Edge cases:**

- Empty CSV (header only, zero data rows) → HTTP 200, `{"inserted_rows": 0}`; existing rows deleted
- CSV with a row where `stock_isin` is lowercase → accepted; `EtfHoldingRow` normalises to uppercase before validation
- Upload to non-existent `id` → HTTP 404 before any file parsing occurs
- CSV row with `weight_percentage = 0` → HTTP 422; `gt=0` constraint in `EtfHoldingRow`
- Network interruption after `DELETE` but before `commit` → `AsyncSession` rolls back; previous snapshot is preserved

---

### Open Questions / Risks

- [ ] **Issuer CSV column layout drift:** iShares, Vanguard, and Amundi may rename columns without notice, silently producing 422 errors for all rows. **Target:** document expected header names per issuer in the project wiki before first production upload (2026-08-01).
- [ ] **No staleness alert:** `snapshot_date` is stored but nothing surfaces when holdings are older than the ETF's rebalancing cadence. **Target:** evaluate surfacing `snapshot_date` in `EtfResponse` in the next analytics milestone.
- [ ] **Holdings read endpoint absent:** callers can verify upload success via `inserted_rows` but cannot query the stored constituent list. **Target:** decide whether to add `GET /etfs/{id}/holdings` inline in `EtfResponse` or as a dedicated endpoint before the downstream analytics initiative begins.
