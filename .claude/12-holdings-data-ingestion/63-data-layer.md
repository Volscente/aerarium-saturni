# #63: Data Layer

**GitHub Issue:** [#63 — Data Layer](https://github.com/Volscente/aerarium-saturni/issues/63)
**GitHub Milestone:** [12-holdings-data-ingestion](https://github.com/Volscente/aerarium-saturni/milestone/10)
**Notion page:** [Holdings Data Ingestion](https://app.notion.com/p/12-Holdings-Data-Ingestion-3a45cc6c0f0780b3accbf9b0f919a27f)

---

## Technical Scope

**In scope:**

- `backend/src/backend/models.py` — Revise `EtfHolding` ORM class: replace the current columns (`company_name`, `weight_pct`, `sector`, `region`, `market_value`, `shares`) with the RFC-specified schema (`stock_isin`, `stock_name`, `weight_percentage`, `snapshot_date`); add composite B-Tree index on `(etf_id, snapshot_date DESC)`
- `backend/alembic/versions/002_alter_etf_holdings.py` — Alembic migration that drops the old `etf_holdings` columns and adds the new ones (or drops and recreates the table); extends the `001_create_etf_tables.py` chain
- `backend/src/backend/schemas/etfs.py` — Replace existing `EtfHoldingRow` (no ISIN field) with a revised model exposing `stock_isin`, `stock_name`, `weight_percentage`, `snapshot_date`; add ISIN format `field_validator` and non-null / positive-weight enforcement
- `backend/tests/` — Unit tests for `EtfHoldingRow`: valid row, invalid ISIN format, zero/negative weight, missing required field

**Out of scope:**

- `POST /etfs/{id}/holdings/upload` endpoint changes — handled by TASK-2 (API Layer)
- Read endpoints for holdings (`GET /etfs/{id}/holdings`)
- Automated or scheduled ingestion
- Authentication
- Alembic baseline migration for the `transactions` table

**Existing work / gaps to close:**

The `EtfHolding` ORM class and `etf_holdings` table were created in `v0.3.0` / migration `001_create_etf_tables.py`, but with a different schema than the RFC now requires:

| Field (current) | Field (RFC-specified) |
| --------------- | --------------------- |
| `company_name`  | `stock_name`          |
| `weight_pct`    | `weight_percentage`   |
| `sector`        | _(removed)_           |
| `region`        | _(removed)_           |
| `market_value`  | _(removed)_           |
| `shares`        | _(removed)_           |
| _(absent)_      | `stock_isin`          |
| _(absent)_      | `snapshot_date`       |

`EtfHoldingRow` also lacks an ISIN field and the `snapshot_date`. Migration `002` must ALTER (or drop-and-recreate) the `etf_holdings` table rather than CREATE it, since the table already exists after migration `001`.

---

## Architecture

```txt
CSV upload boundary (TASK-2)
          │  row dict
          ▼
  EtfHoldingRow.model_validate(row)           ── validation layer
  ┌───────────────────────────────────────┐
  │  field_validator: stock_isin          │
  │  Field(gt=0): weight_percentage       │
  │  Field(min_length=1): stock_name      │
  │  Field(...): snapshot_date            │
  └───────────────────────────────────────┘
          │  validated EtfHoldingRow
          ▼
  EtfHolding(ORM) instances
  ┌───────────────────────────────────────┐
  │  etf_id  FK → etfs.id  CASCADE       │
  │  stock_isin  String(12)               │
  │  stock_name  String(200)              │
  │  weight_percentage  Numeric(8,4)      │
  │  snapshot_date  Date                  │
  │  INDEX (etf_id, snapshot_date DESC)   │
  └───────────────────────────────────────┘
          │
          ▼
  PostgreSQL: etf_holdings table
  (schema introduced via 002_alter_etf_holdings.py)
```

### Why composite index on `(etf_id, snapshot_date DESC)`

The primary read pattern is "retrieve all current holdings for a given ETF". The composite index lets PostgreSQL satisfy this with a single index scan ordered by recency, avoiding a full-table scan and a sort step.

---

## Tech Stack

No new packages required. All dependencies (`SQLAlchemy`, `Pydantic v2`, `Alembic`, `psycopg[binary]`) are already present in `backend/pyproject.toml`.

---

## Implementation Details

### Modules / Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `backend/src/backend/models.py` | Edit | Revise `EtfHolding` class columns and add composite index |
| `backend/alembic/versions/002_alter_etf_holdings.py` | Create | Migration altering `etf_holdings` to the RFC schema |
| `backend/src/backend/schemas/etfs.py` | Edit | Revise `EtfHoldingRow` with ISIN validator and `snapshot_date` |
| `backend/tests/schemas/test_etf_holding_row.py` | Create | Unit tests for `EtfHoldingRow` validation |

---

### Key Functions

```python
class EtfHolding(Base):
    """SQLAlchemy ORM class mapping the etf_holdings table.

    Child of Etf with ON DELETE CASCADE, following the same pattern as
    EtfPriceHistory. The composite index on (etf_id, snapshot_date DESC)
    supports the primary read pattern: all current holdings for a given ETF
    ordered by most-recent snapshot.
    """

    __tablename__ = "etf_holdings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    etf_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("etfs.id", ondelete="CASCADE"), nullable=False
    )
    stock_isin: Mapped[str] = mapped_column(String(12), nullable=False)
    stock_name: Mapped[str] = mapped_column(String(200), nullable=False)
    weight_percentage: Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=False)
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)

    etf: Mapped["Etf"] = relationship(back_populates="holdings")

    __table_args__ = (
        Index(
            "ix_etf_holdings_etf_id_snapshot_date",
            "etf_id",
            "snapshot_date",
            postgresql_ops={"snapshot_date": "DESC"},
        ),
    )
```

```python
class EtfHoldingRow(BaseModel):
    """Pydantic v2 model for validating a single CSV row from an issuer holdings export.

    Used only at the CSV parse boundary (TASK-2 upload handler); not exposed as an
    API response model. Rejects malformed rows before any database write.

    Args:
        stock_isin: ISIN of the constituent stock — must be exactly 12 alphanumeric chars.
        stock_name: Human-readable name of the constituent company.
        weight_percentage: Constituent weight in the index as a percentage; must be > 0.
        snapshot_date: Point-in-time date of the issuer snapshot this row belongs to.

    Raises:
        ValueError: If stock_isin is not exactly 12 alphanumeric characters.
        ValueError: If weight_percentage is not positive.
        ValidationError: If any required field is missing or null.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    stock_isin: str
    stock_name: str = Field(min_length=1, max_length=200)
    weight_percentage: Decimal = Field(gt=0)
    snapshot_date: date

    @field_validator("stock_isin")
    @classmethod
    def validate_isin(cls, v: str) -> str:
        """Normalise and validate an ISIN.

        Uppercases the input before validation so lowercase input (e.g.
        ``ie00b4l5y983``) is accepted and stored as ``IE00B4L5Y983``.

        Args:
            v: Raw ISIN string from the CSV row.

        Returns:
            The validated, uppercased ISIN string.

        Raises:
            ValueError: If the value is not exactly 12 alphanumeric characters
                after uppercasing.
        """
        v = v.upper()
        if len(v) != 12 or not v.isalnum():
            raise ValueError("ISIN must be exactly 12 alphanumeric characters")
        return v
```

---

### Data Models / Schemas

**Revised `etf_holdings` table schema (post-migration `002`):**

| Column | Type | Constraints |
| ------ | ---- | ----------- |
| `id` | `UUID` | PK, default `uuid4` |
| `etf_id` | `UUID` | FK → `etfs.id` `ON DELETE CASCADE`, NOT NULL |
| `stock_isin` | `VARCHAR(12)` | NOT NULL |
| `stock_name` | `VARCHAR(200)` | NOT NULL |
| `weight_percentage` | `NUMERIC(8,4)` | NOT NULL |
| `snapshot_date` | `DATE` | NOT NULL |

**Index:** `ix_etf_holdings_etf_id_snapshot_date` — B-Tree on `(etf_id, snapshot_date DESC)`

**Migration strategy for `002_alter_etf_holdings.py`:**

No real data exists yet — DROP and recreate is the accepted approach. Migration `002` must:
1. `DROP TABLE etf_holdings` (cascades away the old indexes and FK constraint)
2. `CREATE TABLE etf_holdings` with the RFC schema (`id`, `etf_id`, `stock_isin`, `stock_name`, `weight_percentage`, `snapshot_date`)
3. Re-add the FK constraint to `etfs.id` with `ON DELETE CASCADE`
4. Create `ix_etf_holdings_etf_id_snapshot_date` B-Tree index on `(etf_id, snapshot_date DESC)`

The `downgrade` function must restore the `001` column layout (drop-and-recreate in reverse).

---

### Testing Strategy

**Unit tests** (`backend/tests/schemas/test_etf_holding_row.py`):

- Valid row — all required fields present and well-formed → model instantiates without error
- Invalid ISIN (11 chars) → `ValidationError` raised
- Invalid ISIN (12 chars, non-alphanumeric) → `ValidationError` raised
- `weight_percentage = 0` → `ValidationError` raised (must be `> 0`)
- `weight_percentage < 0` → `ValidationError` raised
- Missing `stock_name` → `ValidationError` raised
- Missing `snapshot_date` → `ValidationError` raised

**Integration test (manual — after TASK-2):**

Verify that `alembic upgrade head` applies both `001` and `002` cleanly on a fresh database, and that `alembic downgrade base` removes the ETF tables without touching `transactions`.

**Edge cases:**

- `stock_isin` with lowercase letters → silently normalised to uppercase before validation (e.g. `ie00b4l5y983` → `IE00B4L5Y983`)
- `weight_percentage` with very small positive value (e.g. `0.0001`) → should pass
- `snapshot_date` as a future date → no constraint applied at this layer; upstream caller is responsible

---

### Open Questions / Risks

- [x] **ISIN case sensitivity:** `EtfHoldingRow.validate_isin` uppercases before validation — lowercase input is silently normalised (same as ISIN standard; rejects only non-alphanumeric or wrong length). **Resolved.**
- [x] **Migration 002 strategy:** DROP and recreate — no real data in the database at this stage. **Resolved.**
- [ ] **No read endpoint post-ingestion:** After TASK-2, callers can only confirm success via `{"inserted_rows": n}`. A `GET /etfs/{id}/holdings` endpoint is an open prerequisite for any downstream analytics. Track whether this belongs in a follow-on milestone. **Target:** milestone planning.
- [ ] **Issuer CSV column layout variance:** iShares, Vanguard, and Amundi export different column names. The `EtfHoldingRow` schema assumes normalised input; the TASK-2 handler must map issuer-specific column names before calling `model_validate`. Document the expected normalised column names explicitly. **Target:** TASK-2 spec.
