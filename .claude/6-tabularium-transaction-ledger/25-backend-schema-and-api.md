# #25: Backend Schema and API

**GitHub Issue:** [#25 — Backend Schema and API](https://github.com/Volscente/aerarium-saturni/issues/25)
**GitHub Milestone:** [6-tabularium-transaction-ledger](https://github.com/Volscente/aerarium-saturni/milestone/4)
**Notion page:** [6-Tabularium-Transaction-Ledger-Input-Engine](https://app.notion.com/p/6-Tabularium-Transaction-Ledger-Input-Engine-37a5cc6c0f0780a8a9d7cb0bd6ef5119)

---

## Technical Scope

**In scope:**

- `backend/src/backend/models.py` — `Base = declarative_base()` and `Transaction` SQLAlchemy ORM class (13 columns)
- `backend/src/backend/schemas/transactions.py` — `TransactionCreate` and `TransactionResponse` Pydantic v2 models
- `backend/src/backend/routers/transactions.py` — `POST /transactions` (HTTP 201) and `GET /transactions` FastAPI route handlers
- `backend/src/backend/main.py` — startup lifespan event (`create_all`) and transactions router registration

**Out of scope:**

- Alembic migrations — deferred; `create_all()` is used for initial schema creation
- Authentication and multi-user access control — platform is unauthenticated at this stage
- Portfolio metric calculations (cost basis, P&L, TWR, MWR) — future initiative
- Frontend wiring — handled in TASK-2 and TASK-3

---

## Architecture

```txt
POST /transactions              GET /transactions?owner=<str>
        │                               │
        ▼                               ▼
 TransactionCreate              list[TransactionResponse]
 (Pydantic v2 validation)       (ORM-mode serialization)
        │                               │
        └──────────────┬────────────────┘
                       ▼
        backend/src/backend/routers/transactions.py
        ┌──────────────────────────────────────────┐
        │  Depends(get_session) → AsyncSession      │
        │  (existing generator from db.py)          │
        └──────────────────────────────────────────┘
                       │
                       ▼
        backend/src/backend/models.py
        Transaction ORM class
                       │
                       ▼
        PostgreSQL: transactions table
        (materialised at startup via Base.metadata.create_all)

uvicorn startup
        │
        ├──► lifespan: engine.begin() → conn.run_sync(Base.metadata.create_all)
        └──► app.include_router(transactions.router, prefix="/transactions")
```

### Why `create_all()` instead of Alembic

Alembic adds operational complexity (migration scripts, `env.py`, version table) that is premature when no schema history exists. `create_all()` at startup is idempotent — it is a no-op when the table already exists. The trade-off is that future schema changes require either Alembic adoption or manual DDL; this is a documented decision for the first analytics initiative.

---

## Tech Stack

No new packages required. All dependencies are already declared in `backend/pyproject.toml`:

- `sqlalchemy[asyncio]>=2.0` — ORM declarative base and `AsyncSession`
- `pydantic>=2.0` — `TransactionCreate` and `TransactionResponse` v2 models
- `psycopg[binary]>=3.1` — async PostgreSQL driver (psycopg3)

---

## Implementation Details

### Modules / Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `backend/src/backend/models.py` | Create | `Base = declarative_base()` and `Transaction` ORM class with 13 columns |
| `backend/src/backend/schemas/transactions.py` | Create | `TransactionCreate` (request) and `TransactionResponse` (response) Pydantic v2 models |
| `backend/src/backend/routers/transactions.py` | Create | `POST /transactions` (HTTP 201) and `GET /transactions` route handlers |
| `backend/src/backend/main.py` | Modify | Add `lifespan` context manager with `create_all`; register transactions router |
| `backend/src/backend/db.py` | Reuse | `engine` and `get_session` generator — no changes required |

---

### Key Functions

```python
# backend/src/backend/models.py

from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    pass
```

```python
# backend/src/backend/routers/transactions.py

async def create_transaction(
    body: TransactionCreate,
    session: AsyncSession,
) -> TransactionResponse:
    """Persist a new transaction and return the created record.

    Accepts a validated ``TransactionCreate`` payload, inserts a ``Transaction``
    ORM row into the database via the provided async session, commits, and
    returns the full ``TransactionResponse`` including the server-assigned ``id``
    and ``created_at`` audit timestamp.

    Args:
        body: Validated transaction creation payload from the request body.
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        The persisted transaction record, including ``id`` and ``created_at``.

    Raises:
        sqlalchemy.exc.IntegrityError: If a database constraint is violated
            (e.g. a NOT NULL column receives None after Pydantic validation passes).
    """
```

```python
# backend/src/backend/routers/transactions.py

async def list_transactions(
    owner: str | None,
    session: AsyncSession,
) -> list[TransactionResponse]:
    """Return all transactions ordered by transaction date descending.

    Optionally filters to a single portfolio owner when the ``?owner=`` query
    parameter is provided. Returns an empty list when no rows match.

    Args:
        owner: Optional portfolio owner string to filter by. ``None`` returns
            all transactions regardless of owner.
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        A list of ``TransactionResponse`` objects ordered ``transaction_date DESC``.
        Empty list when no transactions exist.

    Raises:
        sqlalchemy.exc.OperationalError: If the database is unreachable at
            query time.
    """
```

```python
# backend/src/backend/schemas/transactions.py

@field_validator("isin")
@classmethod
def validate_isin(cls, v: str | None) -> str | None:
    """Validate ISIN is exactly 12 alphanumeric characters when provided.

    Accepts ``None`` (ISIN is optional). When a value is supplied, enforces
    ISO 6166 format: exactly 12 uppercase alphanumeric characters. Whitespace
    is stripped before validation via ``str_strip_whitespace=True``.

    Args:
        v: Raw ISIN string from the request payload, or ``None``.

    Returns:
        The validated ISIN string, or ``None`` if not provided.

    Raises:
        ValueError: If the value is not exactly 12 alphanumeric characters.
    """
```

---

### API Endpoints

| Method | Path | Request | Response | Status |
| ------ | ---- | ------- | -------- | ------ |
| `POST` | `/transactions` | `TransactionCreate` (JSON body) | `TransactionResponse` | 201 Created |
| `GET` | `/transactions` | `?owner=<str>` (optional query param) | `list[TransactionResponse]` | 200 OK |

---

### Data Models / Schemas

**SQLAlchemy ORM model** (`backend/src/backend/models.py`):

```python
class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    broker_platform: Mapped[str] = mapped_column(
        Enum("ibkr", "n26", name="broker_enum"), nullable=False, index=True
    )
    transaction_type: Mapped[str] = mapped_column(
        Enum("buy", "sell", "dividend", "split", name="transaction_type_enum"), nullable=False
    )
    asset_class: Mapped[str] = mapped_column(
        Enum("stock", "bond", "etf", name="asset_class_enum"), nullable=False
    )
    ticker: Mapped[str | None] = mapped_column(String(20), nullable=True)
    isin: Mapped[str | None] = mapped_column(String(12), nullable=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    price: Mapped[Decimal | None] = mapped_column(Numeric(14, 4), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    fees: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=Decimal("0"))
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
```

**Pydantic v2 schemas** (`backend/src/backend/schemas/transactions.py`):

```python
class TransactionCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    owner: str
    broker_platform: Literal["ibkr", "n26"]
    transaction_type: Literal["buy", "sell", "dividend", "split"]
    asset_class: Literal["stock", "bond", "etf"]
    ticker: str | None = None
    isin: str | None = None
    quantity: Decimal = Field(gt=0)
    price: Decimal | None = Field(default=None, gt=0)
    currency: str = Field(min_length=3, max_length=3)
    fees: Decimal = Field(default=Decimal("0"), ge=0)
    transaction_date: date

    @field_validator("isin")
    @classmethod
    def validate_isin(cls, v: str | None) -> str | None:
        if v is not None and (len(v) != 12 or not v.isalnum()):
            raise ValueError("ISIN must be exactly 12 alphanumeric characters")
        return v


class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    owner: str
    broker_platform: str
    transaction_type: str
    asset_class: str
    ticker: str | None
    isin: str | None
    quantity: Decimal
    price: Decimal | None
    currency: str
    fees: Decimal
    transaction_date: date
    created_at: datetime
```

---

### Testing Strategy

**Unit tests** (`backend/tests/routers/test_transactions.py`):

- `POST /transactions` with a valid buy payload → 201, response includes `id` (UUID) and `created_at`
- `POST /transactions` with `isin="INVALID"` (not 12 chars) → 422 Unprocessable Entity
- `POST /transactions` with `isin=None` (optional) → 201, `isin` is `null` in response
- `POST /transactions` with `quantity=-1` → 422 (gt=0 constraint)
- `GET /transactions` with no rows → 200, returns `[]`
- `GET /transactions?owner=simone` → 200, only rows matching `owner="simone"` returned
- `GET /transactions` (no filter) → 200, all rows ordered `transaction_date DESC`

**Integration test** (manual, after `just backend-dev`):

```bash
# Create a transaction
curl -s -X POST http://localhost:8000/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "simone",
    "broker_platform": "ibkr",
    "transaction_type": "buy",
    "asset_class": "stock",
    "ticker": "AAPL",
    "isin": "US0378331005",
    "quantity": "10.0000",
    "price": "175.0000",
    "currency": "USD",
    "fees": "1.5000",
    "transaction_date": "2026-06-11"
  }' | jq .

# List transactions (should include the row just created)
curl -s http://localhost:8000/transactions | jq .

# Filter by owner
curl -s "http://localhost:8000/transactions?owner=simone" | jq .
```

Verify: POST returns HTTP 201 with a UUID `id` and `created_at`; GET returns the row ordered newest-first; `GET /health` still returns `{"status": "ok"}` (health endpoint unchanged).

**Edge cases:**

- `isin="us0378331005"` (lowercase) → 422 (`.isalnum()` is case-insensitive but all-lowercase ISINs are invalid per ISO 6166 — consider uppercasing in the validator instead of rejecting)
- `transaction_type="split"` with `price` set → accepted (nullable, no server-side cross-field validation in this milestone; Pydantic `model_validator` for cross-field rules is TASK-3 scope)
- `fees` omitted → defaults to `0`, stored as `Numeric(14,4)`
- Startup with PostgreSQL unavailable → `GET /health` returns 200; `POST /transactions` returns 503/500 on first DB call

---

### Open Questions / Risks

- [x] **ISIN case sensitivity:** The validator uses `.isalnum()` which accepts lowercase, but ISO 6166 specifies uppercase. Should the validator uppercase the value silently or reject lowercase? **Target:** before implementation starts. **Answer:** Validate that ISIN is all uppper case.
- [x] **Alembic introduction:** When the first schema change is needed (e.g. adding a `notes` column), Alembic must be introduced. Document this decision in `backend/README.md` as part of this issue. **Target:** TASK-1 completion. **Answer:** Mention it as a solution for data migration when needed.
- [x] **`price` null for splits — server-side enforcement:** RFC mentions `price` is `nullable` for splits, but no `model_validator` enforcing `price=None` when `transaction_type="split"` is in scope for TASK-1. Cross-field validation is handled in TASK-3 (Zod mirror schema). Confirm acceptable. **Target:** TASK-3 kick-off. **Answer:** Acceptable.
