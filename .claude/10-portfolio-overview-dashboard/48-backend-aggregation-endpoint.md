# #48: Backend Aggregation Endpoint

**GitHub Issue:** [#48 — Backend Aggregation Endpoint](https://github.com/Volscente/aerarium-saturni/issues/48)
**GitHub Milestone:** [10-portfolio-overview-dashboard](https://github.com/Volscente/aerarium-saturni/milestone/8)
**Notion page:** [Portfolio Overview Dashboard](https://app.notion.com/p/10-Portfolio-Overview-Dashboard-3865cc6c0f078033920ad103c2d83d9a)

---

## Technical Scope

**In scope:**

- `src/backend/schemas/portfolio.py` — New file: `PortfolioRowResponse` and `PortfolioOverviewResponse` Pydantic v2 schemas
- `src/backend/routers/portfolio.py` — New file: `GET /portfolio/overview` route handler with two-phase SQLAlchemy async aggregation query
- `src/backend/main.py` — Register `portfolio.router` at prefix `/portfolio`
- `tests/routers/test_portfolio.py` — New file: unit tests covering empty result, single row, multiple rows, null `current_value` when no price data

**Out of scope:**

- Frontend tab shell and `PortfolioPageClient` component (TASK-2)
- `PortfolioOverviewTable` interactive component (TASK-3)
- `revalidateTag('portfolio-overview')` wiring in `actions.ts` / `etf-actions.ts` (TASK-2)
- Any schema migrations — the query reads only existing columns in `transactions`, `etfs`, and `etf_price_history`
- Portfolio metric calculations beyond `performance_abs` and `performance_pct` (TWR, MWR, cost basis)
- Authentication or per-user access control

---

## Architecture

```txt
GET /portfolio/overview
         │
         ▼
  get_portfolio_overview(session: AsyncSession)
         │
         ├── Phase 1 — holdings CTE (SQLAlchemy select + CTE)
         │   transactions WHERE transaction_type IN ('buy','sell')
         │                AND isin IS NOT NULL
         │   GROUP BY (owner, broker_platform, isin)
         │   → net_quantity, total_invested per ISIN group
         │
         ├── Phase 2 — outer aggregation (LEFT JOIN)
         │   holdings_cte
         │     LEFT JOIN etfs ON etfs.isin = holdings_cte.isin
         │     LEFT JOIN (correlated subquery: latest price per etf_id) ON true
         │   GROUP BY (owner, broker_platform)
         │   → total_invested, current_value (NULL when no price record)
         │
         ▼
  List[Tuple[owner, broker_platform, total_invested, current_value]]
         │
         ├── Python: performance_abs = current_value - total_invested (None if current_value is None)
         └── Python: performance_pct = performance_abs / total_invested * 100 (None if None)
         │
         ▼
  PortfolioOverviewResponse(rows=[PortfolioRowResponse, ...])
```

### Why performance is computed in Python, not SQL

`performance_abs` and `performance_pct` are derived from `current_value` and `total_invested`.
Computing them in SQL requires either repeating the aggregation subexpressions or adding another
CTE layer. Doing it in Python after the query keeps null-handling explicit and the query readable,
with no performance cost since the computation is O(rows) on a small result set.

---

## Tech Stack

No new packages required. The query uses `sqlalchemy.orm.aliased`, `sqlalchemy.select`,
`sqlalchemy.func`, and `sqlalchemy.literal_column` — all already in `pyproject.toml`.

---

## Implementation Details

### Modules / Files

| File | Action | Description |
| --- | --- | --- |
| `src/backend/schemas/portfolio.py` | Create | `PortfolioRowResponse` and `PortfolioOverviewResponse` Pydantic v2 models |
| `src/backend/routers/portfolio.py` | Create | `GET /portfolio/overview` route handler; two-phase SQLAlchemy async query |
| `src/backend/main.py` | Edit | `from backend.routers import portfolio` + `app.include_router(portfolio.router, prefix="/portfolio")` |
| `tests/routers/test_portfolio.py` | Create | Unit tests for the portfolio router |

---

### Key Functions

```python
async def get_portfolio_overview(
    session: AsyncSession,
) -> PortfolioOverviewResponse:
    """Aggregate transaction data into per-(owner, broker_platform) portfolio rows.

    Executes a two-phase SQLAlchemy async query:
    - Phase 1 CTE: groups ``transactions`` by ``(owner, broker_platform, isin)``
      filtering to ``buy`` and ``sell`` types, producing ``net_quantity`` and
      ``total_invested`` per ISIN group.
    - Phase 2: left-joins the holdings CTE to ``etfs`` on ``isin``, then uses a
      correlated subquery on ``etf_price_history`` to find the latest price per ETF.
      Aggregates up to ``(owner, broker_platform)`` computing ``total_invested`` and
      ``current_value``.
    Performance fields (``performance_abs``, ``performance_pct``) are computed in Python
    after the database round-trip to keep null-handling explicit.
    ``current_value`` is ``None`` for any group where at least one held ISIN has no price
    record in ``etf_price_history``.

    Args:
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        A ``PortfolioOverviewResponse`` containing one ``PortfolioRowResponse`` per
        ``(owner, broker_platform)`` pair found in ``transactions``. Returns an empty
        ``rows`` list when there are no qualifying transactions.

    Raises:
        sqlalchemy.exc.OperationalError: If the database is unreachable at query time.
    """
```

```python
def _build_portfolio_query() -> Select:
    """Construct the two-phase SQLAlchemy SELECT for portfolio aggregation.

    Builds a CTE for Phase 1 (net holdings per ISIN group) and the outer
    SELECT for Phase 2 (current-value join and group-level aggregation).
    Uses a correlated scalar subquery on ``etf_price_history`` ordered by
    ``timestamp DESC`` to retrieve the latest price per ETF without a
    LATERAL JOIN (which SQLAlchemy renders portably via ``.correlate()``).
    Returns a composable ``Select`` object; the caller awaits execution.

    Returns:
        A SQLAlchemy ``Select`` statement yielding rows of
        ``(owner, broker_platform, total_invested, current_value)``.
        ``current_value`` is ``NULL`` in SQL when no price record exists for
        any ISIN in the group.
    """
```

```python
def _to_row_response(
    owner: str,
    broker_platform: str,
    total_invested: Decimal,
    current_value: Decimal | None,
) -> PortfolioRowResponse:
    """Derive a ``PortfolioRowResponse`` from raw query output.

    Computes ``performance_abs`` and ``performance_pct`` in Python so that
    ``None`` propagation is explicit and auditable. ``total_invested`` is
    guaranteed non-None at this point (the query filters out rows with no
    buy/sell transactions).

    Args:
        owner: Portfolio owner string.
        broker_platform: Broker platform identifier.
        total_invested: Sum of ``quantity * price`` for buy minus sell transactions.
        current_value: Sum of ``net_quantity * latest_price`` per ISIN in the group,
            or ``None`` if any ISIN lacks a price record.

    Returns:
        A ``PortfolioRowResponse`` with all five fields populated; performance fields
        are ``None`` when ``current_value`` is ``None``.
    """
```

---

### Data Models / Schemas

```python
from decimal import Decimal
from pydantic import BaseModel, ConfigDict


class PortfolioRowResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    owner: str = Field(description="Portfolio owner name.")
    broker_platform: str = Field(description="Broker platform identifier (e.g. 'ibkr', 'n26').")
    total_invested: Decimal = Field(description="Net capital deployed: Σ(buy qty*price) - Σ(sell qty*price).")
    current_value: Decimal | None = Field(
        default=None,
        description="Σ(net_quantity * latest_price). None when any held ISIN has no price record.",
    )
    performance_abs: Decimal | None = Field(
        default=None,
        description="current_value - total_invested. None when current_value is None.",
    )
    performance_pct: Decimal | None = Field(
        default=None,
        description="performance_abs / total_invested * 100. None when current_value is None.",
    )


class PortfolioOverviewResponse(BaseModel):
    rows: list[PortfolioRowResponse] = Field(
        description="One row per (owner, broker_platform) pair found in transactions."
    )
```

**Note on `share`:** intentionally absent from the schema — it is a dynamic UI concept depending on which rows are selected and must be computed client-side.

---

### Testing Strategy

**Unit tests** (`tests/routers/test_portfolio.py`):

Follow the same pattern as `test_transactions.py` and `test_etfs.py`: patch `get_session` via `app.dependency_overrides`, construct a `MagicMock` async session whose `execute` returns a mock `Result`, and call the endpoint through `TestClient(app)`.

Test cases:

| Test | Setup | Expected |
| --- | --- | --- |
| `test_get_portfolio_overview_empty` | Session returns zero rows | `200`, `{"rows": []}` |
| `test_get_portfolio_overview_single_row_with_price` | One `(owner, broker_platform, total_invested, current_value)` row | `200`, one `PortfolioRowResponse` with non-None performance fields |
| `test_get_portfolio_overview_multiple_rows` | Two rows with different owners | `200`, two rows in response |
| `test_get_portfolio_overview_null_current_value` | Row with `current_value=None` | `200`, `current_value`, `performance_abs`, `performance_pct` all `null` in JSON |
| `test_get_portfolio_overview_mixed_null` | One row with price, one without | `200`, two rows; null fields only on the price-less row |

**Integration test** (manual, requires running stack):

```bash
curl -s http://localhost:8000/portfolio/overview | python -m json.tool
```

Verify: response has `{"rows": [...]}` shape; each row has `owner`, `broker_platform`, `total_invested`; performance fields are either numeric or `null`.

**Edge cases:**

- `isin IS NULL` on a transaction — excluded by the `WHERE isin IS NOT NULL` filter; does not affect aggregation
- `total_invested = 0` (degenerate: equal buy and sell quantities) — `performance_pct` would divide by zero; guard with `if total_invested != 0` before computing `performance_pct`; return `None` for the zero case
- No `etf_price_history` rows at all — `current_value` is `None` for all rows; endpoint still returns `200` with null performance fields
- Multiple price records for one ETF — correlated subquery `ORDER BY timestamp DESC LIMIT 1` picks the most recent; older records are ignored

---

### Open Questions / Risks

No open questions. Implementation notes for coding:

- **Enum filter:** `Transaction.transaction_type.in_(["buy", "sell"])` — lowercase matches the `Enum("buy", "sell", ...)` definition in `models.py`.
- **NULL propagation:** Standard SQL behaviour — a single `NULL` operand in `SUM(net_quantity * latest_price)` makes the whole group sum `NULL`. No special handling needed; `_to_row_response` already guards `performance_abs` and `performance_pct` on `current_value is None`.
- **Latest price lookup:** the correlated subquery uses `ORDER BY EtfPriceHistory.timestamp.desc(), LIMIT 1` against the existing composite index on `(etf_id, timestamp)`. Profile with `EXPLAIN ANALYZE` if row counts grow significantly; add a `DESC` functional index if the planner regresses to a seq scan.
