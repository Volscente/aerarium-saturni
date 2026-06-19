# #40: Backend CRUD Service Layer

**GitHub Issue:** [#40 — Backend CRUD Service Layer](https://github.com/Volscente/aerarium-saturni/issues/40)
**GitHub Milestone:** [9-etf-asset-registry](https://github.com/Volscente/aerarium-saturni/milestone/7)
**Notion page:** [9 — ETF Asset Registry](https://app.notion.com/p/9-ETF-Asset-Registry-37f5cc6c0f07805eb578f4c9a6bfbab6)

---

## Technical Scope

**In scope:**

- `src/backend/schemas/etfs.py` — `EtfCreate`, `EtfUpdate`, `EtfResponse`, `EtfPriceCreate`, `EtfHoldingRow` Pydantic v2 models
- `src/backend/routers/etfs.py` — Six route handlers: `POST /etfs`, `GET /etfs`, `PUT /etfs/{id}`, `DELETE /etfs/{id}`, `POST /etfs/{id}/price`, `POST /etfs/{id}/holdings/upload`
- `src/backend/main.py` — Register `etfs` router at prefix `/etfs`
- `backend/pyproject.toml` — Add `python-multipart>=0.0.9` to runtime dependencies (required for `UploadFile`)
- `tests/conftest.py` — Add `VALID_ETF_PAYLOAD`, `_make_mock_etf_row`, and `mock_session_with_etfs` fixture
- `tests/routers/test_etfs.py` — Unit tests covering all six endpoints

**Out of scope:**

- `src/backend/models.py` — `Etf`, `EtfHolding`, `EtfPriceHistory` ORM classes already created in TASK-1; do not modify
- `backend/alembic/` — Migrations already applied in TASK-1; do not touch
- Frontend components and Server Actions — covered in TASK-3
- Real-time market data feeds and portfolio analytics

---

## Architecture

```txt
HTTP client / Next.js Server Component
          │  POST/GET/PUT/DELETE /etfs[/{id}[/price|/holdings/upload]]
          │
          ▼
    FastAPI (main.py) — CORSMiddleware → etfs router (prefix "/etfs")
    ┌────────────────────────────────────────────────────────────────┐
    │  routers/etfs.py                                               │
    │  Depends(get_session) → AsyncSession                           │
    └────────────────────────────────────────────────────────────────┘
          │  Pydantic v2 validation (schemas/etfs.py)
          │
          ├── POST   /etfs ──────── EtfCreate → session.add(Etf()) → commit → refresh → 201 EtfResponse
          │
          ├── GET    /etfs ──────── ?ticker= ?asset_class= ?issuer= → select(Etf).where(ILIKE) → 200 list[EtfResponse]
          │
          ├── PUT    /etfs/{id} ─── EtfUpdate → select(Etf).where(id==?) → setattr loop → commit → 200 EtfResponse
          │
          ├── DELETE /etfs/{id} ─── select(Etf).where(id==?) → session.delete → commit → 204
          │
          ├── POST   /etfs/{id}/price ─── EtfPriceCreate → session.add(EtfPriceHistory()) → commit → 201
          │
          └── POST   /etfs/{id}/holdings/upload
                    │  UploadFile (text/csv) → csv.DictReader → list[EtfHoldingRow]
                    │  delete EtfHolding.where(etf_id==?) + session.add_all(new rows)
                    │  rollback on any validation error → 422 {row, field, error}
                    ▼
          PostgreSQL (etfs, etf_holdings, etf_price_history)
```

### Why `model_validator` for asset-class-conditional fields

Mirrors `TransactionCreate.validate_type_specific_fields` — cross-field rules that span multiple fields go in `model_validator(mode="after")`. By the time this validator runs, all fields are typed and coerced, so `asset_class` is reliably a string for comparison.

### Why the CSV upload is not a Next.js Server Action

Server Actions do not support streaming multipart file uploads. The upload endpoint lives entirely on the backend and is called directly by the frontend `HoldingsUpload` component via native `fetch`. The delete-then-insert sequence is wrapped in a single async session transaction to guarantee atomicity — existing holdings are never partially replaced.

---

## Tech Stack

New packages introduced:

| Package | Version | Justification |
| ------- | ------- | ------------- |
| `python-multipart` | `>=0.0.9` | Required by FastAPI's `UploadFile` for `multipart/form-data` parsing; not currently listed in `backend/pyproject.toml` |

---

## Implementation Details

### Modules / Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `src/backend/schemas/etfs.py` | Create | Pydantic v2 models for ETF CRUD, price creation, and CSV row parsing |
| `src/backend/routers/etfs.py` | Create | Six FastAPI route handlers using `Depends(get_session)`, following `routers/transactions.py` style |
| `src/backend/main.py` | Modify | Import `etfs` router; add `app.include_router(etfs.router, prefix="/etfs")` after the transactions include |
| `backend/pyproject.toml` | Modify | Add `python-multipart>=0.0.9` to `dependencies` |
| `tests/conftest.py` | Modify | Add `VALID_ETF_PAYLOAD` constant, `_make_mock_etf_row` helper, `mock_session_with_etfs` fixture |
| `tests/routers/test_etfs.py` | Create | Unit tests for all six endpoints |
| `src/backend/models.py` | Reuse | `Etf`, `EtfHolding`, `EtfPriceHistory` — do not modify |
| `src/backend/db.py` | Reuse | `get_session` — do not modify |

---

### Key Functions

```python
async def list_etfs(
    ticker: str | None,
    asset_class: str | None,
    issuer: str | None,
    session: AsyncSession,
) -> list[EtfResponse]:
    """Return all ETFs, optionally filtered by ticker, asset class, or issuer.

    Builds a SELECT query against the ``etfs`` table and applies
    ILIKE filters for any non-None query parameters before fetching.
    Mirrors ``list_transactions`` in ``routers/transactions.py``.

    Args:
        ticker: Optional ticker prefix; applied as ``Etf.ticker.ilike(f"{v}%")``.
        asset_class: Optional exact match on ``Etf.asset_class``.
        issuer: Optional issuer prefix; applied as ``Etf.issuer.ilike(f"{v}%")``.
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        List of ``EtfResponse`` models; empty list when no rows match.

    Raises:
        Nothing — returns an empty list when no rows match.
    """
```

```python
async def upload_holdings(
    id: UUID,
    file: UploadFile,
    session: AsyncSession,
) -> dict[str, int]:
    """Replace all holdings for an ETF atomically from a CSV upload.

    Reads the uploaded CSV, parses each row into an ``EtfHoldingRow`` model,
    then within a single session transaction deletes all existing
    ``etf_holdings`` rows for the given ETF and bulk-inserts the new rows.
    Any parsing failure or constraint error rolls back the entire operation.

    Args:
        id: UUID of the parent ETF; raises 404 if not found in ``etfs`` table.
        file: Uploaded CSV; required columns match ``EtfHoldingRow`` field names.
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        ``{"inserted_rows": n}`` — count of successfully inserted holding rows.

    Raises:
        HTTPException 404: If no ETF with the given ``id`` exists.
        HTTPException 422: If any CSV row fails ``EtfHoldingRow`` validation;
            body includes ``{"row": n, "field": "...", "error": "..."}``.
    """
```

```python
@model_validator(mode="after")
def validate_asset_class_fields(self) -> "EtfCreate":
    """Enforce that bond distribution maps are present when asset_class is 'Bonds'.

    Mirrors ``TransactionCreate.validate_type_specific_fields`` — runs after all
    field-level validators so ``asset_class`` is reliably a string.

    Args:
        self: Fully constructed model instance after field-level validation.

    Returns:
        The validated model instance.

    Raises:
        ValueError: If ``asset_class == 'Bonds'`` and either ``bond_maturities``
            or ``bond_credit_scores`` is ``None``.
    """
```

---

### Data Models / Schemas

```python
class EtfCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    ticker: str = Field(min_length=1, max_length=20)
    isin: str                                            # validated by field_validator
    name: str = Field(min_length=1, max_length=200)
    issuer: str = Field(min_length=1, max_length=100)
    asset_class: str = Field(min_length=1, max_length=50)
    tracked_index: str = Field(min_length=1, max_length=200)
    ter: Decimal = Field(gt=0)
    domicile: str = Field(min_length=1, max_length=50)
    currency_hedged: bool = Field(default=False)
    fiscal_year_end: str = Field(min_length=1, max_length=10)
    german_tax_classification: str = Field(min_length=1, max_length=50)
    replication_strategy: str = Field(min_length=1, max_length=50)
    dividend_policy: str = Field(min_length=1, max_length=50)
    dividend_frequency: str | None = Field(default=None, max_length=20)
    fund_size: Decimal | None = Field(default=None, gt=0)
    monthly_volume: Decimal | None = Field(default=None, gt=0)
    volatility_1y: Decimal | None = Field(default=None, ge=0)
    volatility_3y: Decimal | None = Field(default=None, ge=0)
    holdings_overview: str | None = Field(default=None)
    geographical_distribution: dict[str, float] = Field(description="Country code → weight pct")
    sector_distribution: dict[str, float] = Field(description="Sector name → weight pct")
    bond_maturities: dict[str, float] | None = Field(default=None)
    bond_credit_scores: dict[str, float] | None = Field(default=None)


class EtfUpdate(BaseModel):
    # All fields from EtfCreate, all optional
    model_config = ConfigDict(str_strip_whitespace=True)

    ticker: str | None = Field(default=None, min_length=1, max_length=20)
    isin: str | None = Field(default=None)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    issuer: str | None = Field(default=None, min_length=1, max_length=100)
    asset_class: str | None = Field(default=None)
    tracked_index: str | None = Field(default=None)
    ter: Decimal | None = Field(default=None, gt=0)
    domicile: str | None = Field(default=None)
    currency_hedged: bool | None = Field(default=None)
    fiscal_year_end: str | None = Field(default=None)
    german_tax_classification: str | None = Field(default=None)
    replication_strategy: str | None = Field(default=None)
    dividend_policy: str | None = Field(default=None)
    dividend_frequency: str | None = Field(default=None)
    fund_size: Decimal | None = Field(default=None, gt=0)
    monthly_volume: Decimal | None = Field(default=None, gt=0)
    volatility_1y: Decimal | None = Field(default=None, ge=0)
    volatility_3y: Decimal | None = Field(default=None, ge=0)
    holdings_overview: str | None = Field(default=None)
    geographical_distribution: dict[str, float] | None = Field(default=None)
    sector_distribution: dict[str, float] | None = Field(default=None)
    bond_maturities: dict[str, float] | None = Field(default=None)
    bond_credit_scores: dict[str, float] | None = Field(default=None)


class EtfResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    ticker: str
    isin: str
    name: str
    issuer: str
    asset_class: str
    tracked_index: str
    ter: Decimal
    domicile: str
    currency_hedged: bool
    fiscal_year_end: str
    german_tax_classification: str
    replication_strategy: str
    dividend_policy: str
    dividend_frequency: str | None
    fund_size: Decimal | None
    monthly_volume: Decimal | None
    volatility_1y: Decimal | None
    volatility_3y: Decimal | None
    holdings_overview: str | None
    geographical_distribution: dict[str, float]
    sector_distribution: dict[str, float]
    bond_maturities: dict[str, float] | None
    bond_credit_scores: dict[str, float] | None
    created_at: datetime


class EtfPriceCreate(BaseModel):
    price: Decimal = Field(gt=0)
    currency: str = Field(min_length=3, max_length=3)
    timestamp: datetime


class EtfHoldingRow(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    company_name: str = Field(min_length=1, max_length=200)
    weight_pct: Decimal = Field(ge=0, le=100)
    sector: str = Field(min_length=1, max_length=100)
    region: str = Field(min_length=1, max_length=100)
    market_value: Decimal | None = Field(default=None, gt=0)
    shares: Decimal | None = Field(default=None, gt=0)
```

---

### Testing Strategy

**Unit tests** (`tests/routers/test_etfs.py`):

Following the `test_transactions.py` pattern — `AsyncMock` session injected via `dependency_overrides[get_session]`, `TestClient(app)` with `patch("backend.main.engine", mock_engine)`:

- `test_create_etf_valid` — `POST /etfs` with `VALID_ETF_PAYLOAD` → 201, UUID `id` parseable, `created_at` present
- `test_create_etf_invalid_isin` — ISIN not 12 alphanumeric characters → 422
- `test_create_etf_bonds_missing_maturities` — `asset_class = "Bonds"`, `bond_maturities = None` → 422 from `model_validator`
- `test_list_etfs_empty` — `GET /etfs` with empty session → 200, `[]`
- `test_list_etfs_with_rows` — session returns two mock ETF rows → 200, list of length 2
- `test_update_etf_not_found` — `PUT /etfs/{unknown-id}` → 404
- `test_delete_etf_not_found` — `DELETE /etfs/{unknown-id}` → 404
- `test_create_price_valid` — `POST /etfs/{id}/price` with valid payload → 201
- `test_upload_holdings_valid` — `POST /etfs/{id}/holdings/upload` with well-formed CSV → 200, `{"inserted_rows": n}`
- `test_upload_holdings_invalid_row` — CSV row missing `company_name` → 422 with `{"row": n, ...}`

**conftest.py additions** (`tests/conftest.py`):

```python
VALID_ETF_PAYLOAD = {
    "ticker": "VWCE",
    "isin": "IE00B3RBWM25",
    "name": "Vanguard FTSE All-World UCITS ETF",
    "issuer": "Vanguard",
    "asset_class": "Equities",
    "tracked_index": "FTSE All-World",
    "ter": "0.0022",
    "domicile": "Ireland",
    "currency_hedged": False,
    "fiscal_year_end": "31-Dec",
    "german_tax_classification": "Aktien",
    "replication_strategy": "Full replication",
    "dividend_policy": "Accumulating",
    "geographical_distribution": {"US": 63.0, "EU": 20.0},
    "sector_distribution": {"Technology": 25.0, "Financials": 18.0},
}
```

`_make_mock_etf_row(**overrides)` follows `_make_mock_row` — returns a `MagicMock(spec=Etf)` with all columns set to defaults or overrides.

`mock_session_with_etfs` fixture mirrors `mock_session_with_rows` — `result.scalars().all()` returns a list of `_make_mock_etf_row()` instances.

**Edge cases:**

- `asset_class = "Bonds"` without `bond_maturities` → 422 from `model_validator` (not DB level)
- CSV upload with zero data rows → `{"inserted_rows": 0}`, no existing holdings deleted
- `PUT /etfs/{id}` with empty body `{}` → 200 with no changes (all `EtfUpdate` fields are `None`; setattr loop skips `None` values)

---

### Open Questions / Risks

- [ ] **JSONB distribution map value validation:** Should `geographical_distribution` values be validated to sum to approximately 100%? The spec enforces `dict[str, float]` at the Pydantic boundary but not the sum invariant. Add a `field_validator` if the stricter invariant is required. **Target:** confirm before PR merge. **Answer:** Add a validation around at least 90%.
- [ ] **CSV upload performance on large holdings:** Current design reads the full CSV into memory before the delete-insert. For ETFs with thousands of holdings, consider chunked inserts. Not blocking for MVP. **Target:** follow-up initiative
