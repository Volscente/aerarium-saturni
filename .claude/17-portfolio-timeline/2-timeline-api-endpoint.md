# #82: Timeline API Endpoint

**GitHub Issue:** [82 — Timeline API Endpoint](https://github.com/Volscente/aerarium-saturni/issues/82)
**GitHub Milestone:** [17-portfolio-timeline](https://github.com/Volscente/aerarium-saturni/milestone/13)
**Notion page:** [17 Portfolio Timeline](https://app.notion.com/p/17-Portfolio-Timeline-3f75cc6c0f078057b978ede9a2a0a52f)

---

## Technical Scope

**In scope:**

- `backend/src/backend/schemas/portfolio.py` — Pydantic v2 response models mirroring the Owner > Broker > ETF tree, plus the skipped-transactions count
- `backend/src/backend/routers/portfolio.py` — `GET /portfolio/timeline` handler and a loader that reads transactions, ETFs and daily prices and maps them to the engine's input dataclasses
- `backend/tests/routers/test_portfolio.py` and `backend/tests/conftest.py` — Route-level tests with a mocked session: empty case, multi-owner/broker shape, skipped count
- `backend/README.md` — New endpoint documented in Public interfaces and Changelog

**Out of scope:**

- The replay computation itself (`backend/src/backend/timeline.py`, TASK-1, already done)
- Frontend Server Action, types and cache tags (TASK-3)
- Precomputation, caching tables or schema changes
- Query parameters (owner/broker filtering happens client-side from the full tree)
- Changing `GET /portfolio/overview`

---

## Architecture

```txt
GET /portfolio/timeline
          │
          ▼
    get_portfolio_timeline(session)
          │
          ├── _load_timeline_inputs(session)
          │       │
          │       ├── SELECT transactions (all types)          ── query 1 → list[TimelineTransaction]
          │       ├── SELECT etfs (isin, ticker, name)         ── query 2 → dict[isin, TimelineEtf]
          │       └── SELECT etf_price_history JOIN etfs       ── query 3 → dict[isin, list[TimelinePrice]]
          │             (EUR rows only, day = UTC date of timestamp)
          │
          ▼
    build_timeline(transactions, etfs, prices)  → TimelineResult      (TASK-1, pure)
          │
          ▼
    PortfolioTimelineResponse.model_validate(result, from_attributes=True)
          │
          ▼
    JSON: { owners: [{ owner, points, brokers: [{ broker_platform, points, etfs: [...] }] }],
            skipped_transactions }
```

### Why three plain queries and no SQL aggregation

The replay needs every transaction and every price day, and the volume is tiny (under ~100 transactions per year, about 700 price rows per ETF). Three simple selects feed the pure engine from TASK-1, which keeps the SQL trivial and all logic unit-tested without a database. Unlike `/portfolio/overview` there is no CTE or correlated subquery.

### Price rows are filtered to EUR in SQL

`etf_price_history` can hold legacy non-EUR manual rows (the existing registry chart skips them). The engine values every price as EUR, so the price query keeps only `currency = 'EUR'`. A non-EUR row is dropped, not converted.

---

## Tech Stack

No new packages required.

---

## Implementation Details

### Modules / Files

| File                                          | Action | Description                                                                                 |
| --------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| `backend/src/backend/schemas/portfolio.py`    | Modify | Add `TimelinePointResponse`, `TimelineEtfResponse`, `TimelineBrokerResponse`, `TimelineOwnerResponse`, `PortfolioTimelineResponse` |
| `backend/src/backend/routers/portfolio.py`    | Modify | Add `_load_timeline_inputs` and `GET /timeline` handler                                     |
| `backend/src/backend/timeline.py`             | Reuse  | `build_timeline` and its dataclasses; not modified                                          |
| `backend/tests/conftest.py`                   | Modify | Add timeline row factories, mock session fixtures and client fixtures                       |
| `backend/tests/routers/test_portfolio.py`     | Modify | Add timeline tests                                                                          |
| `backend/README.md`                           | Modify | Public interfaces, Key components, Changelog                                                |

`main.py` already registers the portfolio router at `/portfolio`, so no change there.

---

### Key Functions

```python
async def _load_timeline_inputs(
    session: AsyncSession,
) -> tuple[
    list[TimelineTransaction],
    dict[str, TimelineEtf],
    dict[str, list[TimelinePrice]],
]:
    # Read transactions, ETFs and EUR daily prices and map them to the engine's dataclasses.
```

- Notes: The day of a price is the UTC date of `EtfPriceHistory.timestamp` (`cast(func.timezone("UTC", EtfPriceHistory.timestamp), Date)`), matching the `uq_etf_price_history_etf_id_day` index. All transaction types are loaded; the engine ignores dividends and splits. Prices are keyed by the ETF's ISIN via a join on `etfs`.

```python
@router.get("/timeline", response_model=PortfolioTimelineResponse)
async def get_portfolio_timeline(
    session: AsyncSession = Depends(get_session),
) -> PortfolioTimelineResponse:
    # Load inputs, run build_timeline, and return the Owner > Broker > ETF series tree.
```

- Notes: Returns `{"owners": [], "skipped_transactions": n}` when nothing is usable. Always HTTP 200; skipped transactions are reported in the body, never as an error.

---

### Data Models / Schemas

```python
class TimelinePointResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: date = Field(description="Calendar day (ISO date).")
    value: float = Field(description="End-of-day holdings value in EUR.")
    net_flow: float = Field(description="That day's contributions net of withdrawals in EUR, fees included.")


class TimelineEtfResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    isin: str = Field(description="ETF ISIN.")
    etf_ticker: str = Field(description="ETF ticker.")
    etf_name: str = Field(description="ETF name.")
    points: list[TimelinePointResponse] = Field(description="Daily series for this owner's position in the ETF at one broker.")


class TimelineBrokerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    broker_platform: str = Field(description="Broker platform identifier (e.g. 'ibkr', 'n26').")
    points: list[TimelinePointResponse] = Field(description="Daily series for the owner's holdings at this broker.")
    etfs: list[TimelineEtfResponse] = Field(description="One series per ETF held at this broker.")


class TimelineOwnerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    owner: str = Field(description="Portfolio owner name.")
    points: list[TimelinePointResponse] = Field(description="Daily series for the owner's total holdings.")
    brokers: list[TimelineBrokerResponse] = Field(description="One entry per broker the owner uses.")


class PortfolioTimelineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    owners: list[TimelineOwnerResponse] = Field(description="One entry per owner with usable transactions.")
    skipped_transactions: int = Field(
        description="Buy/sell rows that could not be valued: non-EUR, missing price/quantity/ISIN, "
        "unknown ISIN, or a sell larger than the held quantity."
    )
```

Money fields are `float`, as in `PortfolioRowResponse`, so the frontend receives plain JSON numbers. The engine keeps `Decimal` internally and converts at the response boundary. The tree shape is identical to the engine's `TimelineResult`, which is why `from_attributes` is enough and no manual mapping function is needed.

---

### Testing Strategy

**Unit tests** (`tests/routers/test_portfolio.py`), with a mocked `AsyncSession` whose `execute` returns three results in order (transactions, ETFs, prices), following the existing `side_effect=[...]` fixture style:

- Empty: no transactions → 200 with `{"owners": [], "skipped_transactions": 0}`
- Shape: two owners and two brokers → each owner has `points` and `brokers`, each broker has `points` and `etfs`, each ETF has `isin`, `etf_ticker`, `etf_name`, `points`; each point has ISO `date`, numeric `value` and `net_flow`
- Skipped count: one non-EUR buy and one usable buy → `skipped_transactions == 1` and the usable one still plotted
- Values: a single buy returns `value` equal to quantity × close and `net_flow` equal to quantity × price + fees on the buy day

**Integration test** (manual, against the running database after re-seeding the corrected `transactions.json`):

```bash
curl -s http://localhost:8000/portfolio/timeline | python3 -m json.tool | head -40
```

Verify: owners `owner_a` and `owner_b` are present with brokers `ibkr` and `n26`; the first point of each series is on its first buy date; the last point is on the latest stored price date; `skipped_transactions` is `0`.

**Edge cases:**

- No ETFs or no prices stored → empty `owners`, HTTP 200
- Dividend rows in the seed data → ignored, not counted as skipped
- Non-EUR price rows → excluded by the price query, not converted

The mocked session cannot check the SQL (UTC date cast, EUR filter); the manual integration test covers that.

---

### Open Questions / Risks

- [ ] **Duplicate issue number in the planning doc:** TASK-1 and TASK-2 are both listed as issue #82 (TASK-3 is #83). This spec uses #82 as written. **Needs your call:** confirm the number for TASK-2. **Target:** before opening the PR
- [ ] **Database re-seed:** The running database still holds the old seed prices until `transactions.json` is re-seeded, so the manual integration test must run after that. **Target:** before manual verification
- [ ] **Payload size:** The whole tree is returned at once (owners × brokers × ETFs × about 700 daily points). At the expected volume this is small, but it grows with history and number of positions. If it becomes large, a later iteration can add a date range parameter. **Target:** revisit during TASK-5 Lighthouse check
