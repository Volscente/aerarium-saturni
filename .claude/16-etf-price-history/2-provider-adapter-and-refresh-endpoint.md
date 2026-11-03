# #75: Provider Adapter and Refresh Endpoint

**GitHub Issue:** [75 — Automated Price Retrieval](https://github.com/Volscente/aerarium-saturni/issues/75)
**GitHub Milestone:** [16-etf-price-history](https://github.com/Volscente/aerarium-saturni/milestone/12)
**Notion page:** [ETF Price History](https://app.notion.com/p/16-ETF-Price-History-3f65cc6c0f0780ac9bbfe316750fcac2)

---

## Technical Scope

**In scope:**

- `backend/src/backend/providers/__init__.py`, `base.py` — `PriceProvider` protocol, `PricePoint` and `PriceProviderError`
- `backend/src/backend/providers/yahoo.py` — first adapter: Yahoo Finance public chart endpoint over `httpx`, keyless
- `backend/src/backend/routers/etfs.py` — `POST /etfs/prices/refresh`, the `get_price_provider` dependency, and the per-ETF fetch/upsert helpers
- `backend/src/backend/schemas/etfs.py` — `EtfPriceRefreshRequest` and `EtfPriceRefreshResult`
- `backend/data/etfs/EUNL.json`, `VWCE.json`, `LYP6.json` — add `price_symbol` (`EUNL.DE`, `VWCE.DE`, `LYP6.DE`) so `just create_etfs` produces ETFs that can actually be refreshed (small addition beyond the planning doc; see Open Questions)
- `backend/tests/providers/`, `backend/tests/routers/test_etfs.py`, `backend/tests/conftest.py` — adapter, endpoint and fixture tests

**Out of scope:**

- Any frontend change: the button, Server Action and cache-tag revalidation (TASK-3), the Timeline Chart (TASK-4)
- A second provider adapter (Stooq stays a fallback candidate; the `PriceProvider` protocol is the seam)
- Scheduled or background refresh; the endpoint is synchronous and on demand
- Changing or removing the manual `POST`/`PUT`/`DELETE /etfs/{id}/price…` endpoints
- A new `currency` column on `etfs` (see Open Questions)

---

## Architecture

```txt
POST /etfs/prices/refresh   { "etf_ids": [..] | omitted }
          │
          ▼
    refresh_prices(body, session, provider)
          │
          ├── SELECT etfs (all, or WHERE id IN etf_ids; 404 if any id is missing)
          │
          ├── SELECT DISTINCT ON (etf_id) latest stored (timestamp, currency)   ── 1 query
          │       → start date per ETF (None = never priced → full history)
          │
          ├── fetch phase — concurrent, bounded by Semaphore(MAX_CONCURRENT_FETCHES)
          │     provider.fetch_daily_prices(price_symbol or ticker, start)
          │         │  HTTP GET (Yahoo chart, interval=1d)
          │         ▼
          │     list[PricePoint(date, close, currency)]  | PriceProviderError
          │
          └── write phase — sequential (one AsyncSession), one commit per ETF
                currency check vs latest stored currency
                INSERT … ON CONFLICT (etf_id, (timestamp AT TIME ZONE 'UTC')::date)
                       DO UPDATE SET price, currency, timestamp
                    │
                    ▼
          list[EtfPriceRefreshResult]  (HTTP 200, one entry per ETF)
```

### Fetch concurrently, write sequentially

Provider calls are the slow, rate-limited part, so they run concurrently under a small semaphore. Database writes cannot share one `AsyncSession` across concurrent tasks, so they run afterwards in sequence, each ETF in its own commit. That also isolates failures: a bad ETF is rolled back and reported without touching the others.

### Day normalisation

Daily bars are stored at 00:00:00 UTC of the exchange-local trading date. This keeps one row per ETF per UTC day, matching TASK-1's unique index, regardless of the provider's bar timestamp (market open) or the session timezone.

---

## Tech Stack

No new packages required. `httpx>=0.27` is already a runtime dependency; `httpx.MockTransport` covers adapter tests, and async code is tested with `asyncio.run()` as in `tests/converters/test_holdings_xlsx.py`, so no `pytest-asyncio` is needed.

---

## Implementation Details

### Modules / Files

| File                                          | Action | Description                                                                                  |
| --------------------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| `backend/src/backend/providers/__init__.py`   | Create | Package marker                                                                               |
| `backend/src/backend/providers/base.py`       | Create | `PriceProvider` protocol, `PricePoint` dataclass, `PriceProviderError`                       |
| `backend/src/backend/providers/yahoo.py`      | Create | `YahooPriceProvider`: request building, response parsing, error mapping                      |
| `backend/src/backend/routers/etfs.py`         | Modify | `POST /prices/refresh`, `get_price_provider`, `_upsert_prices`; imports                      |
| `backend/src/backend/schemas/etfs.py`         | Modify | `EtfPriceRefreshRequest`, `EtfPriceRefreshResult`                                            |
| `backend/data/etfs/{EUNL,VWCE,LYP6}.json`     | Modify | Add `price_symbol`                                                                           |
| `backend/tests/providers/__init__.py`         | Create | Package marker                                                                               |
| `backend/tests/providers/test_yahoo.py`       | Create | Adapter tests over `httpx.MockTransport`                                                     |
| `backend/tests/routers/test_etfs.py`          | Modify | Refresh endpoint tests                                                                       |
| `backend/tests/conftest.py`                   | Modify | Refresh session fixture, stub provider and `client_refresh` fixture                          |

---

### Key Functions

```python
# providers/base.py
@dataclass(frozen=True)
class PricePoint:
    date: date
    close: Decimal
    currency: str


class PriceProviderError(Exception):
    # Raised for any provider failure: HTTP error, unknown symbol, malformed payload.


class PriceProvider(Protocol):
    async def fetch_daily_prices(self, symbol: str, start: date | None = None) -> list[PricePoint]:
        # Daily closes for `symbol` from `start` (inclusive) to now; full available history when start is None.
```

- Notes: points are ascending by date, at most one per date, with null closes dropped.

```python
# providers/yahoo.py
class YahooPriceProvider:
    def __init__(self, client: httpx.AsyncClient) -> None:
        # Holds the shared client; the caller owns its lifecycle.

    async def fetch_daily_prices(self, symbol: str, start: date | None = None) -> list[PricePoint]:
        # GET the chart endpoint (interval=1d), then parse; map httpx and parse errors to PriceProviderError.


def _parse_chart(payload: dict) -> list[PricePoint]:
    # Zip timestamps with quote closes; take currency from meta; convert each timestamp to its exchange-local date.
```

- Notes: with `start=None` use `range=max`; otherwise `period1` = start at 00:00 UTC and `period2` = now. A Yahoo payload with `chart.error` or no `result` is a `PriceProviderError` (unknown symbol). Rows whose close is `null` (market holidays) are skipped. The local date is `(timestamp + meta.gmtoffset)` as a date. The request needs a browser-like `User-Agent`; set it on the client created in `get_price_provider`. The currency string is passed through unchanged (no upper-casing, since Yahoo reports London pence as `GBp`).

```python
# routers/etfs.py
async def get_price_provider() -> AsyncGenerator[PriceProvider, None]:
    # Yield a YahooPriceProvider over a per-request httpx.AsyncClient (timeout, User-Agent); close it afterwards.


@router.post("/prices/refresh", response_model=list[EtfPriceRefreshResult])
async def refresh_prices(
    body: EtfPriceRefreshRequest | None = None,
    session: AsyncSession = Depends(get_session),
    provider: PriceProvider = Depends(get_price_provider),
) -> list[EtfPriceRefreshResult]:
    # Load target ETFs (404 on unknown ids), fetch concurrently, then validate and upsert each ETF sequentially.


async def _upsert_prices(session: AsyncSession, etf_id: UUID, points: list[PricePoint]) -> int:
    # Bulk INSERT ... ON CONFLICT DO UPDATE on the daily unique expression; returns rows written.
```

- Notes (`refresh_prices`): provider symbol is `etf.price_symbol or etf.ticker`. Start date per ETF is the UTC date of its latest stored price (inclusive, so a partial last day is overwritten); `None` when it has no prices. Currency check: if the ETF has stored prices and the provider currency differs from the latest stored currency, the ETF is `failed` and nothing is written. An ETF with no stored prices accepts the provider's currency. The response is always HTTP 200 once ids resolve; failures live in per-ETF results. `MAX_CONCURRENT_FETCHES = 3` module constant.
- Notes (`_upsert_prices`): uses `sqlalchemy.dialects.postgresql.insert` with `on_conflict_do_update` targeting `index_elements=["etf_id", text("((timestamp AT TIME ZONE 'UTC')::date)")]`, inserted in chunks to stay well under the driver's bind-parameter limit. `timestamp` is `datetime.combine(point.date, time.min, tzinfo=UTC)`. The update sets `price`, `currency` and `timestamp`, so retrieved data wins over manual snapshots.

---

### Data Models / Schemas

```python
class EtfPriceRefreshRequest(BaseModel):
    etf_ids: list[UUID] | None = Field(default=None, description="ETFs to update; omitted or empty means all")


class EtfPriceRefreshResult(BaseModel):
    etf_id: UUID
    ticker: str
    status: Literal["updated", "failed"]
    rows_written: int = Field(ge=0)
    error: str | None = None
```

An empty `etf_ids` list is treated the same as omitted (all ETFs).

---

### Testing Strategy

**Unit tests — adapter** (`tests/providers/test_yahoo.py`, `httpx.MockTransport`, `asyncio.run`):

- Valid payload → ascending `PricePoint`s with the right close, currency and exchange-local date
- `null` closes are dropped; duplicate dates collapse to one point
- `start=None` sends `range=max`; a `start` date sends `period1`/`period2` and no `range`
- `chart.error` / empty `result` / non-JSON body → `PriceProviderError`
- HTTP 404/429/5xx and a transport error (`httpx.ConnectError`) → `PriceProviderError`

**Unit tests — endpoint** (`tests/routers/test_etfs.py`, stub provider + mocked session; no network):

- Omitted body and `{"etf_ids": []}` both refresh every ETF; a subset refreshes only those
- An unknown ETF id → 404 and no provider call
- Partial failure: one ETF's provider raises `PriceProviderError` → that ETF `failed` with the message, the other `updated`, response still 200
- Currency mismatch against the latest stored price → `failed`, no upsert executed
- No stored prices → provider called with `start=None`; stored prices → called with the latest stored date
- `price_symbol` is used when set; `ticker` is used when it is `NULL`
- One commit per updated ETF; an upsert failure rolls back and marks only that ETF `failed`

**Integration test** (manual, real PostgreSQL via the Docker stack; unit tests mock the session, so they cannot prove the `ON CONFLICT` expression matches the index):

```bash
just run_services          # then, from the repo root, in another terminal:
just create_etfs           # ETFs now carry price_symbol
curl -s -X POST http://localhost:8000/etfs/prices/refresh -H "Content-Type: application/json" -d '{}'
curl -s -X POST http://localhost:8000/etfs/prices/refresh -H "Content-Type: application/json" -d '{}'
```

Verify: the first call returns `updated` for EUNL, VWCE and LYP6 with a large `rows_written` (full history); the second returns `updated` with a small count (incremental, from the latest stored day); `SELECT etf_id, count(*) FROM etf_price_history GROUP BY etf_id` is unchanged apart from the newest days between the two calls; no `no unique or exclusion constraint` error appears.

**Edge cases:**

- ETF whose symbol the provider does not know → `failed`, others unaffected
- Provider returns zero points (already up to date, non-trading day) → `updated` with `rows_written` of 0 or 1 (the overwritten last day), not an error
- Two refreshes within the same trading day → the day's row is overwritten, never duplicated
- A manual snapshot on a day the provider also covers → overwritten by the provider's value
- Request containing a duplicated id → de-duplicated, one result for that ETF

---

### Open Questions / Risks

- [x] **Provider stability and terms:** Yahoo's chart endpoint is unofficial and keyless; it can change, throttle or require headers (a browser-like `User-Agent` is assumed necessary). Probed on 2026-10-27 with a 5-day, 1d-interval request: `EUNL.DE`, `VWCE.DE` and `LYP6.DE` all returned EUR closes on Xetra, so coverage of the current three ETFs is confirmed for today only. Stooq was not probed. **Target:** before merging TASK-2, confirm you accept Yahoo's terms for personal use. **Answer**: We accept for now Yahoo.
- [x] **ETF currency reference:** the RFC says to compare the provider currency with "the ETF's own currency", but `etfs` has no `currency` column (only `currency_hedged`). This spec compares against the latest stored price's currency and accepts the provider's for an ETF with no prices. Alternative: add `etfs.currency` in a follow-up migration. **Target:** decide before implementation. **Answer:** We assume the currency is always in euro.
- [x] **`price_symbol` in seed data:** bare tickers (`VWCE`) are not valid Yahoo symbols; the `.DE` suffix is needed. This spec adds `price_symbol` to the three seed JSON files, which the planning doc does not list. ETFs already in a database need a `PUT /etfs/{id}` with `price_symbol` (the ETF form field arrives in TASK-3). **Target:** confirm at implementation start. **Answer:** Confirmed.
- [x] **`ON CONFLICT` expression inference:** PostgreSQL must infer the unique index from the target expression; the textual form must match the index from migration `006`. Only the manual integration test can prove it. **Target:** during implementation. **Answer:** Verify during the implementation.
- [x] **Partial-day last bar:** while the market is open, the newest daily bar is a live price that a later refresh overwrites. Accepted as intended behaviour, not special-cased. **Target:** none unless it proves confusing in the chart. **Answer:** Behaviour accepted.
- [x] **Request duration:** a first full-history fetch for many ETFs in one synchronous request may approach a client timeout. Mitigated by the semaphore, incremental fetches and per-ETF isolation; the escalation path is a background job (RFC FAQ). **Target:** revisit if the registry grows beyond a handful of ETFs. **Answer:** Accepted.
- [x] **Non-EUR listings:** `GBp` (pence) and similar quoted units would store a wrongly scaled price under a 3-letter currency. Not relevant to the current ETFs; revisit when adding non-Xetra listings. **Target:** when such an ETF is added. **Answer:** Accepted.
