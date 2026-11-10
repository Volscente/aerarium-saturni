# #82: Timeline Computation Engine

**GitHub Issue:** [82 — Timeline Computation Engine](https://github.com/Volscente/aerarium-saturni/issues/82)
**GitHub Milestone:** [17-portfolio-timeline](https://github.com/Volscente/aerarium-saturni/milestone/13)
**Notion page:** [17 Portfolio Timeline](https://app.notion.com/p/17-Portfolio-Timeline-3f75cc6c0f078057b978ede9a2a0a52f)

---

## Technical Scope

**In scope:**

- `backend/src/backend/timeline.py` — Pure, database-free replay engine: turns transactions, ETF metadata and daily prices into per-day `value` and `net_flow` series per owner, `(owner, broker)` and `(owner, broker, ETF)`, plus a skipped-transaction count
- `backend/tests/test_timeline.py` — Unit tests for buys, sells, carry-forward, aggregation levels, series start date and skipped transactions

**Out of scope:**

- `GET /portfolio/timeline`, Pydantic response models and DB loading — TASK-2
- Any frontend work, normalization (% growth) and cache tags — TASK-3 to TASK-5
- Dividends and splits: ignored, neither value nor cash flow (splits may be added later)
- Fixing the overview's fee handling
- Schema changes and new dependencies
- Changing `GET /portfolio/overview`

---

## Architecture

```txt
TASK-2 handler (later)                       this task
  loads rows via SQLAlchemy ──► maps to ──►  build_timeline(transactions, etfs, prices)
                                                   │
                  ┌────────────────────────────────┼────────────────────────────────┐
                  ▼                                ▼                                ▼
    _select_usable(transactions, etfs)   _daily_closes(prices, days)
      → (usable, skipped_count)            → {isin: {day: close}}
                  │                                │
                  └───────────────┬────────────────┘
                                  ▼
                  replay day by day (earliest txn date → latest price date)
                    qty[(owner, broker, isin)] += buy / −= sell
                    value[(owner, broker, isin)][day] = qty × close(day)
                    flow[(owner, broker, isin)][day]  = signed(qty × price) + fees
                                  │
                                  ▼
                  roll up ISIN → broker → owner, trim each series to its first
                  non-zero-position day
                                  │
                                  ▼
                          TimelineResult(owners=[OwnerSeries], skipped_transactions=n)
```

### Plain Python instead of pandas

The RFC originally named pandas, but `backend/pyproject.toml` does not list it as a dependency. At under ~100 transactions per year across all owners the replay is a few hundred days times a handful of positions, so plain `dict`/`Decimal` loops are fast enough and add no dependency. This also keeps `Decimal` money arithmetic exact, which pandas floats would not.

---

## Tech Stack

No new packages required. Standard library only (`dataclasses`, `datetime`, `decimal`).

---

## Implementation Details

### Modules / Files

| File                              | Action | Description                                                                                  |
| --------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| `backend/src/backend/timeline.py` | Create | Engine and input/output dataclasses                                                          |
| `backend/tests/test_timeline.py`  | Create | Pure unit tests; no mocked session needed                                                    |
| `backend/src/backend/models.py`   | Reuse  | `Transaction`, `Etf`, `EtfPriceHistory` field names and types; not modified                  |

Inputs are small frozen dataclasses, not ORM rows, so the engine has no SQLAlchemy dependency and tests need no mocks. TASK-2 maps the ORM rows to them.

---

### Key Functions

```python
def build_timeline(
    transactions: list[TimelineTransaction],
    etfs: dict[str, TimelineEtf],
    prices: dict[str, list[TimelinePrice]],
) -> TimelineResult:
    # Replay transactions day by day and return owner > broker > ETF value/net_flow series.
```

- Notes: `etfs` and `prices` are keyed by ISIN. Transactions are replayed in date order, buys before sells on the same day. A sell larger than the quantity held (in adjusted units) is skipped and counted, since it points at missing buy data. The range runs from the earliest usable transaction date to the latest price date across all ETFs, one point per calendar day. Returns an empty `owners` list when no usable transaction exists.

```python
def _select_usable(
    transactions: list[TimelineTransaction],
    etfs: dict[str, TimelineEtf],
) -> tuple[list[TimelineTransaction], int]:
    # Keep buy/sell rows the replay can value; return them with the skipped count.
```

- Notes: Dividends and splits are dropped without counting. A buy/sell is skipped (and counted) when `currency != "EUR"`, `price`, `quantity` or `isin` is `None`, or the ISIN has no matching ETF with prices (e.g. a stock). A sell larger than the quantity held is also skipped and counted (decided in the replay, see `build_timeline`).

```python
def _daily_closes(
    prices: list[TimelinePrice],
    days: list[date],
) -> dict[date, Decimal]:
    # Latest close on or before each day; days before the first price are absent.
```

- Notes: Carry-forward keeps values flat across weekends, holidays and gaps. Price dates are the UTC date of `EtfPriceHistory.timestamp`, matching the `uq_etf_price_history_etf_id_day` index.

```python
def _net_flow(txn: TimelineTransaction) -> Decimal:
    # +quantity×price+fees for a buy, −quantity×price+fees for a sell.
```

- Notes: Fees always add to the flow, so a buy day shows a small cost drag once normalized. Sell proceeds are net of fees by the same sign convention.

---

### Data Models / Schemas

```python
@dataclass(frozen=True)
class TimelineTransaction:
    owner: str
    broker_platform: str
    transaction_type: str          # "buy" | "sell" | "dividend" | "split"
    isin: str | None
    quantity: Decimal | None
    price: Decimal | None
    ratio: str | None
    currency: str
    fees: Decimal
    transaction_date: date


@dataclass(frozen=True)
class TimelineEtf:
    ticker: str
    name: str


@dataclass(frozen=True)
class TimelinePrice:
    day: date                      # UTC date of the stored timestamp
    close: Decimal


@dataclass(frozen=True)
class Point:
    date: date
    value: Decimal                 # end-of-day holdings value in EUR
    net_flow: Decimal              # that day's contributions net of withdrawals, fees included


@dataclass(frozen=True)
class EtfSeries:
    isin: str
    etf_ticker: str
    etf_name: str
    points: list[Point]


@dataclass(frozen=True)
class BrokerSeries:
    broker_platform: str
    points: list[Point]
    etfs: list[EtfSeries]


@dataclass(frozen=True)
class OwnerSeries:
    owner: str
    points: list[Point]
    brokers: list[BrokerSeries]


@dataclass(frozen=True)
class TimelineResult:
    owners: list[OwnerSeries]
    skipped_transactions: int
```

The result tree mirrors the RFC's Owner > Broker > ETF selection tree, so TASK-2 maps it field for field onto its Pydantic response models. The same ETF at two brokers stays two separate `EtfSeries`. Each series starts on the first day its node holds a non-zero position and continues to the end of the range, so it keeps emitting `0` value after a full sell-out.

---

### Testing Strategy

**Unit tests** (`tests/test_timeline.py`), built from small hand-written dataclass fixtures:

- Single buy: value is `quantity × close` from the buy day; `net_flow` equals `quantity × price + fees` on that day only
- Buy then partial sell: quantity, value and signed flow are correct on each side of the sell
- Carry-forward: weekend and gap days repeat the last close
- Oversell: a sell exceeding the held quantity is skipped and counted, later days are unaffected
- Dividend and split rows are ignored and not counted as skipped
- Aggregation levels: broker equals the sum of its ETFs, owner equals the sum of its brokers, for both `value` and `net_flow`
- Same ETF at two brokers of one owner: two ETF series, one owner line summing both
- Series start: a series begins on the first non-zero-position day, not the global range start
- Skipped count: non-EUR, `price=None`, `quantity=None`, `isin=None`, unknown ISIN (a stock) and an oversell each add one; dividends and splits add none

**Edge cases:**

- No usable transactions → `TimelineResult(owners=[], skipped_transactions=n)`
- Transactions all on the last price date → single-point series
- Full sell-out → later points have `value = 0`, series is not cut
- Two transactions on the same day for one position → quantities and flows both accumulate
- ISIN with no price on or before a held day → contributes `0` that day (cannot happen with 2025+ transactions and prices from 2024; covered defensively)

**Verification:**

```bash
cd backend && uv run pytest tests/test_timeline.py
```

All tests pass without a database or network.

---

### Decisions Resolved

- [x] **Splits:** out of scope for now. Split and dividend rows are ignored by the engine. The fake `LYP6` split row was removed from `backend/data/transactions/transactions.json`, and no ETF in the data has split.
- [x] **Overselling:** a sell above the held quantity is skipped and counted in `skipped_transactions`, so it surfaces in the Timeline notice without producing a negative line.
- [x] **Overview inconsistency:** `GET /portfolio/overview` excludes fees from `total_invested`; it is left untouched and the difference is noted in the TASK-2 README entry.
- [x] **pandas:** not a declared dependency; plain Python is used and the RFC wording is corrected.
- [x] **End date:** the range ends at the latest price date across all ETFs. Price refreshes update all ETFs together, so an ETF with an earlier last price carries it forward.

### Open Questions / Risks

- [x] **Seed trade prices:** the 14 buy/sell prices in `backend/data/transactions/transactions.json` were set to the stored close on each trade date (2 decimals), so the paid amount matches market value on buy day and Normalized mode shows no fake spikes. Quantities, dates, owners and fees are unchanged. Re-seeding is needed for the running database to pick them up.
