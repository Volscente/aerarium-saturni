# #58: Backend — Edit and Delete Endpoints

**GitHub Issue:** [#58 — Backend: Edit and Delete Endpoints](https://github.com/Volscente/aerarium-saturni/issues/58)
**GitHub Milestone:** [11-enable-transactions-edit](https://github.com/Volscente/aerarium-saturni/milestone/9)
**Notion page:** [11 — Enable Transactions Edit](https://app.notion.com/p/11-Enable-Transactions-Edit-3955cc6c0f078031af62fa21395aecae)

---

## Technical Scope

**In scope:**

- `backend/src/backend/schemas/transactions.py` — Add `TransactionUpdate` Pydantic model; all fields optional, no `model_validator`
- `backend/src/backend/routers/transactions.py` — Add `PUT /transactions/{id}` (HTTP 200) and `DELETE /transactions/{id}` (HTTP 204) route handlers
- `backend/tests/conftest.py` — Add `mock_session_transaction_found`, `mock_session_transaction_not_found`, `client_transaction_found`, `client_transaction_not_found` fixtures
- `backend/tests/routers/test_transactions.py` — Add 4 new unit tests covering success and 404 paths for both endpoints

**Out of scope:**

- Frontend changes (`TransactionTable`, `TransactionDrawer`, `TransactionForm`, Server Actions) — TASK-2
- Database schema changes — no new columns; `transactions` table is unmodified
- Alembic migrations — no schema change means no migration needed
- Bulk update or delete operations

---

## Architecture

```txt
HTTP Request
    PUT /transactions/{id}       DELETE /transactions/{id}
         │                                │
         ▼                                ▼
  routers/transactions.py       routers/transactions.py
  update_transaction(...)        delete_transaction(...)
         │                                │
         └──────────────┬─────────────────┘
                        │
              session.execute(
                select(Transaction)
                  .where(Transaction.id == id)
              ).scalar_one_or_none()
                        │
             ┌──────────┴──────────┐
           None                Transaction ORM row
             │                        │
      HTTPException 404         PUT: setattr loop over
                                body.model_dump(exclude_none=True)
                                → session.commit()
                                → session.refresh(row)
                                → TransactionResponse (HTTP 200)

                                DELETE: session.delete(row)
                                → session.commit()
                                → HTTP 204 No Content
```

### Why `session.execute(select(...).where(...))` instead of `session.get(...)`

Consistent with `update_etf` and `delete_etf` in `routers/etfs.py`, which also use `session.execute` + `scalar_one_or_none()`. Reusing the same pattern means the same mock fixtures structure (already established by `mock_session_etf_not_found` in `conftest.py`) applies here.

---

## Tech Stack

No new packages required.

---

## Implementation Details

### Modules / Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `backend/src/backend/schemas/transactions.py` | Edit | Add `TransactionUpdate` model after `TransactionCreate` |
| `backend/src/backend/routers/transactions.py` | Edit | Add `update_transaction` and `delete_transaction` handlers; import `TransactionUpdate`, `HTTPException`, `select` |
| `backend/tests/conftest.py` | Edit | Add `mock_session_transaction_found`, `mock_session_transaction_not_found`, `client_transaction_found`, `client_transaction_not_found` |
| `backend/tests/routers/test_transactions.py` | Edit | Add 4 new test functions |

---

### Key Functions

```python
class TransactionUpdate(BaseModel):
    """Partial update payload for an existing transaction.

    All fields are optional with ``None`` defaults. Only non-``None`` fields
    are applied to the ORM row via the ``setattr`` loop in ``update_transaction``.
    No ``model_validator`` is present — the caller (Server Action) is responsible
    for sending a consistent payload validated by ``TransactionFormSchema``.

    Mirrors ``EtfUpdate`` in ``schemas/etfs.py``.
    """
```

```python
async def update_transaction(
    id: UUID,
    body: TransactionUpdate,
    session: AsyncSession = Depends(get_session),
) -> TransactionResponse:
    """Apply a partial update to an existing transaction and return the result.

    Fetches the ``Transaction`` ORM row by primary key. Applies only the
    non-``None`` fields from ``body`` via a ``setattr`` loop, commits, refreshes,
    and returns the full ``TransactionResponse``. Raises HTTP 404 if the row
    does not exist. Mirrors ``update_etf`` in ``routers/etfs.py``.

    Args:
        id: UUID primary key of the transaction to update.
        body: Partial update payload; only non-``None`` fields are written.
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        The updated ``TransactionResponse`` including all fields.

    Raises:
        HTTPException 404: If no transaction with the given ``id`` exists.
    """
```

```python
async def delete_transaction(
    id: UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Permanently delete a transaction row.

    Fetches the ``Transaction`` ORM row by primary key. Deletes it and commits.
    Returns HTTP 204 No Content on success. Raises HTTP 404 if the row does
    not exist. Mirrors ``delete_etf`` in ``routers/etfs.py``.

    Args:
        id: UUID primary key of the transaction to delete.
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        None — HTTP 204 No Content.

    Raises:
        HTTPException 404: If no transaction with the given ``id`` exists.
    """
```

---

### Data Models / Schemas

```python
class TransactionUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    owner: str | None = None
    broker_platform: Literal["ibkr", "n26"] | None = None
    transaction_type: Literal["buy", "sell", "dividend", "split"] | None = None
    asset_class: Literal["stock", "bond", "etf"] | None = None
    ticker: str | None = None
    isin: str | None = None
    quantity: Decimal | None = Field(default=None, gt=0)
    price: Decimal | None = Field(default=None, gt=0)
    ratio: str | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    fees: Decimal | None = Field(default=None, ge=0)
    transaction_date: date | None = None
```

No `field_validator` for ISIN and no `model_validator` — validation of cross-field consistency is the caller's responsibility (enforced by `TransactionFormSchema` on the frontend before the Server Action calls the backend).

---

### Testing Strategy

**New conftest fixtures** (`backend/tests/conftest.py`):

Two new mock session fixtures, following the `mock_session_etf_not_found` pattern:

- `mock_session_transaction_found` — `session.execute` returns a `MagicMock` result whose `scalar_one_or_none()` returns a `_make_mock_row()` instance; `session.delete` is an `AsyncMock`; `session.commit` is an `AsyncMock`; `session.refresh` is an async function that is a no-op (row is already populated)
- `mock_session_transaction_not_found` — `session.execute` returns a `MagicMock` result whose `scalar_one_or_none()` returns `None`

Two new client fixtures:

- `client_transaction_found(mock_session_transaction_found)` — same structure as `client_with_etfs`
- `client_transaction_not_found(mock_session_transaction_not_found)` — same structure as `client_etf_not_found`

**New unit tests** (`backend/tests/routers/test_transactions.py`):

```python
DUMMY_TRANSACTION_ID = "00000000-0000-0000-0000-000000000001"

def test_update_transaction_success(client_transaction_found):
    """PUT /transactions/{id} with a valid partial payload returns 200 with the updated row."""

def test_update_transaction_not_found(client_transaction_not_found):
    """PUT /transactions/{unknown-id} returns 404 when the transaction does not exist."""

def test_delete_transaction_success(client_transaction_found):
    """DELETE /transactions/{id} returns 204 with no response body."""

def test_delete_transaction_not_found(client_transaction_not_found):
    """DELETE /transactions/{unknown-id} returns 404 when the transaction does not exist."""
```

**Edge cases:**

- `PUT` with an empty body `{}` (all fields `None`) → `model_dump(exclude_none=True)` produces `{}` → `setattr` loop is a no-op → row unchanged, HTTP 200 returned
- `DELETE` on a UUID that is syntactically valid but absent → HTTP 404 (not 422)
- `PUT` with a `quantity` of `0` → Pydantic `gt=0` constraint on `TransactionUpdate` → HTTP 422 before the handler runs

---

### Open Questions / Risks

- [ ] **`mock_session_transaction_found` refresh behaviour:** `session.refresh` must be a no-op async function (not a full re-query) — the mock row is already fully populated. Confirm the mock structure matches `mock_session_with_rows` rather than `mock_session_empty` (which mutates `id` and `created_at` in `mock_refresh`). **Target:** implementation session
- [ ] **`revalidateTag('portfolio-overview')` in TASK-2 Server Actions:** the backend endpoints have no knowledge of Next.js cache tags; the invariant must be enforced in the frontend Server Actions. Add a code review checklist item. **Target:** TASK-2 review
