# #69: Look-through Exposure Aggregation Engine

**GitHub Issue:** [69 — Look-through Exposure Aggregation Engine](https://github.com/Volscente/aerarium-saturni/issues/69)
**GitHub Milestone:** [13-holdings-data-visualisation](https://github.com/Volscente/aerarium-saturni/milestone/11)
**Notion page:** [13 - Holdings Data Visualisation](https://app.notion.com/p/13-Holdings-Data-Visualisation-3a45cc6c0f0780aa8c0cefdebc1eed9c)

---

## Technical Scope

**In scope:**

- `backend/alembic/versions/004_add_etf_holdings_stock_country.py` — new migration adding a nullable `stock_country` column to `etf_holdings`
- `src/backend/models.py` — `EtfHolding.stock_country` field
- `src/backend/converters/holdings_xlsx.py` — each per-issuer converter emits `stock_country`; new OpenFIGI-based ISIN reconciliation function
- `src/backend/routers/etfs.py` — `upload_holdings` calls the reconciliation step after a successful upload
- `src/backend/routers/portfolio.py` — new `_build_holdings_exposure_query()` query builder and `GET /portfolio/holdings/exposure` route handler, added alongside the existing `_build_portfolio_query()` / `GET /overview`
- `src/backend/schemas/portfolio.py` — new `HoldingExposureResponse`, `HoldingContribution`, and `HoldingsExposureResponse` Pydantic schemas
- `backend/pyproject.toml` — `httpx` promoted from `dev` to runtime `dependencies`
- `tests/converters/test_holdings_xlsx.py`, `tests/routers/test_etfs.py`, `tests/routers/test_portfolio.py` — new tests

**Out of scope:**

- Frontend components and data wiring (Concentration Dashboard UI, tracked separately under Milestone 2)
- Resolving identities beyond ISIN/ticker (e.g. CUSIP, SEDOL) — not present in any of the current holdings exports (confirmed by inspecting the raw column headers of `EUNL.xlsx`, `VWCE.xlsx`, `LYP6.xlsx`: none contain a CUSIP or SEDOL column)
- A persistent resolution-cache table — re-running OpenFIGI resolution on every upload is free and cheap enough at this data volume (~608 ISINs) that a cache isn't needed (see Architecture)
- Real-time/live pricing — the endpoint reads the same snapshot-based data as the rest of the platform
- Fully deduplicating stocks that this task's ISIN resolution could not resolve — these remain grouped by ticker only, a narrow residual limitation (see Open Questions)

---

## Architecture

This task has two stages: an upload-time fix that makes stock identity trustworthy across issuers, and a read-time endpoint that aggregates on top of it.

### Stage 1 — Stock ISIN resolution at holdings upload

```txt
POST /etfs/{id}/holdings/upload  (any issuer: EUNL, VWCE, or LYP6)
          │
          ▼
    upload_holdings(etf_id, file, session)
          │
          ├── convert_holdings_xlsx(file) → rows            ── existing behaviour
          │     each row now also carries stock_country:
          │       - Amundi:   stock_country = stock_isin[:2]        (free, no lookup)
          │       - iShares:  stock_country = COUNTRY_TO_ISO[Standort]
          │       - Vanguard: stock_country = Region                (already ISO alpha-2)
          │
          ├── atomic delete-then-insert of this ETF's holdings      ── existing behaviour
          │
          └── resolve_stock_isin_aliases(session, http_client)      ── NEW, runs after every upload
                    │
                    ├── SELECT DISTINCT stock_isin FROM etf_holdings
                    │   WHERE stock_isin IS NOT NULL                          ── STEP 1
                    │
                    ├── for each ISIN not yet resolved this run:
                    │     POST https://api.openfigi.com/v3/mapping
                    │     [{"idType": "ID_ISIN", "idValue": isin}]  → ticker  ── STEP 2
                    │
                    └── UPDATE etf_holdings SET stock_isin = :isin
                        WHERE stock_ticker = :ticker
                          AND stock_country = :country               ── STEP 3
                          AND stock_isin IS NULL
                              │
                              ▼
                    Rows across ALL ETFs now share one stock_isin
                    wherever OpenFIGI could resolve a match — order-
                    independent: doesn't matter which ETF was
                    uploaded first, this reconciles the whole table
                    every time.
```

### Stage 2 — Look-through exposure aggregation (reads Stage 1's output)

```txt
Client (Next.js Server Component, portfolio/page.tsx)
          │  GET /portfolio/holdings/exposure
          ▼
    get_holdings_exposure(session: AsyncSession)
    ┌──────────────────────────────────────────────────────────────┐
    │  transactions, etfs, etf_holdings, etf_price_history (Postgres) │
    └──────────────────────────────────────────────────────────────┘
          │  → flat rows via _build_holdings_exposure_query()
          ▼
    _build_holdings_exposure_query() -> Select
          │
          ├── Phase 1 (CTE): net stock quantity per ISIN, summed across
          │   all owners/brokers (unlike `_build_portfolio_query`, not
          │   grouped by owner/broker_platform)                          ── STEP 1
          │
          ├── Phase 1b: join `Etf` + correlated latest `EtfPriceHistory`
          │   price subquery → per-ETF current value                    ── STEP 2
          │
          └── Phase 2: join each ETF's latest `EtfHolding` snapshot
              (`MAX(snapshot_date)` per `etf_id`, via the existing
              `ix_etf_holdings_etf_id_snapshot_date` index) — by now
              `stock_isin` is populated for the large majority of rows
              thanks to Stage 1                                         ── STEP 3
                    │
                    ▼
          get_holdings_exposure() Python post-processing
                    │
                    ├── dedupe rows by `etf_id` → total_portfolio_value   ── STEP 4
                    ├── per-holding: etf_portfolio_weight × weight_percentage ── STEP 5
                    └── group by COALESCE(stock_isin, stock_ticker), sum  ── STEP 6
                              │
                              ▼
          HoldingsExposureResponse(holdings=[...], skipped_etfs=[...])
```

### Why stock identity needed fixing before it could be trusted

iShares/Vanguard holdings only ever report a ticker and Amundi only ever reports an ISIN — confirmed empirically on the real fixtures (0 of 1231 EUNL rows and 0 of 3697 VWCE rows carry an ISIN; 0 of 608 LYP6 rows carry a ticker), with ~30-45% of Amundi's holdings also present, under the other identifier, in the other funds (e.g. `RWE AG` as ticker `RWE` in EUNL, as ISIN `DE0007037129` in LYP6 — the same security, two different keys). A name-normalization fallback was prototyped and rejected: it produced real false positives on this same data (merging the unrelated `EQT AB`, a Swedish private-equity firm, with `EQT Corp`, a US gas company, and conflating `Heineken NV` with the distinct `Heineken Holding NV`) — an accuracy regression, not an improvement.

### Why the resolution runs ISIN → ticker, not ticker → ISIN

The natural first instinct — call OpenFIGI with a ticker and get an ISIN back — doesn't work: OpenFIGI's `/v3/mapping` response never includes an ISIN field, for any input type (confirmed against OpenFIGI's own published API documentation). It returns a Bloomberg FIGI plus descriptive metadata (`ticker`, `name`, `exchCode`, `securityType`). What it *does* support is the reverse: query with `idType=ID_ISIN` and it returns that security's ticker. Since Amundi (LYP6) is the one issuer already reporting ISINs, the resolution has to originate there — resolve LYP6's ISINs to tickers, then use those tickers to find matching rows in EUNL/VWCE, not the other way around.

### Why match on `(ticker, country)` instead of ticker alone

A bare ticker match reintroduces a narrower version of the same collision risk the name-matching heuristic had: two unrelated companies can coincidentally share a ticker on different exchanges (exactly why `EQT AB` and `EQT Corp` collided under name-normalization). Rather than parsing Bloomberg's `exchCode` (its own code system, not directly comparable to the source files' own country fields), the design uses a fact that requires no API call at all: **an ISIN's first two characters are its ISO 3166-1 country code** (e.g. `DE0007037129` → `DE`). Amundi's rows get `stock_country` for free from their own ISIN. iShares' `Standort` column is a German country name (`"Deutschland"`, `"Vereinigte Staaten"`) and needs a small static translation table to ISO alpha-2. Vanguard's `Region` column is already ISO alpha-2 (`"US"`, `"TW"`) and needs no translation at all.

### Why there's no persistent resolution cache

OpenFIGI is confirmed free with no daily/weekly/monthly limits, and even fully unauthenticated (no signup, no API key, no payment info) comfortably handles re-resolving all ~608 of LYP6's distinct ISINs on every upload (well within the unauthenticated rate limit of 25 requests/minute at 10 ISINs per request — roughly 61 requests, a few minutes at worst). Since the backfill `UPDATE` only touches rows still missing `stock_isin`, re-running the whole reconciliation after every upload is a correctness-preserving no-op for already-resolved rows, not wasted work worth caching against.

### Why the final aggregation happens in Python, not SQL

`_build_holdings_exposure_query()` returns one flat row per `(etf, holding)` pair — an ETF's `etf_current_value` repeats once per stock it holds, so summing it directly in SQL would overcount `total_portfolio_value`. `get_portfolio_overview` already establishes the pattern of finishing aggregation in Python after the database round-trip (see its `None`-propagation handling for missing prices); `get_holdings_exposure` follows the same shape: deduplicate per-ETF values first, then compute weights and group by stock identity. This also keeps the `COALESCE(stock_isin, stock_ticker)` grouping key explicit and easy to unit test, rather than buried in a SQL `GROUP BY`.

---

## Tech Stack

| Package | Version | Justification |
| ------- | ------- | -------------- |
| `httpx` | `>=0.27` (already present) | Promoted from the `dev` dependency group to runtime `dependencies` — same precedent as `openpyxl`'s earlier move when XLSX conversion became part of the upload request path. Used to call OpenFIGI's `/v3/mapping` endpoint. |

No new external package for OpenFIGI itself — it's a free HTTP API called directly via `httpx`, not a client library. Everything else extends the existing FastAPI/SQLAlchemy/Pydantic stack already used by `routers/portfolio.py` and `schemas/portfolio.py`.

---

## Implementation Details

### Modules / Files

| File                                                          | Action | Description                                                              |
| --------------------------------------------------------------- | ------ | --------------------------------------------------------------------------- |
| `backend/alembic/versions/004_add_etf_holdings_stock_country.py` | Create | Adds nullable `stock_country VARCHAR(2)` to `etf_holdings`                |
| `src/backend/models.py`                                          | Modify | `EtfHolding.stock_country: Mapped[str \| None] = mapped_column(String(2), nullable=True)` |
| `src/backend/converters/holdings_xlsx.py`                        | Modify | Each converter emits `stock_country`; new `resolve_stock_isin_aliases()` function |
| `src/backend/routers/etfs.py`                                    | Modify | `upload_holdings` calls `resolve_stock_isin_aliases()` after a successful upload |
| `src/backend/routers/portfolio.py`                               | Modify | Add `_build_holdings_exposure_query()` and `GET /portfolio/holdings/exposure` |
| `src/backend/schemas/portfolio.py`                               | Modify | Add `HoldingExposureResponse`, `HoldingContribution`, `HoldingsExposureResponse` |
| `backend/pyproject.toml`                                         | Modify | `httpx` moved to runtime `dependencies`                                   |
| `tests/converters/test_holdings_xlsx.py`                         | Modify | New tests for `stock_country` emission and ISIN reconciliation           |
| `tests/routers/test_etfs.py`                                     | Modify | New tests for the reconciliation call from `upload_holdings`             |
| `tests/routers/test_portfolio.py`                                | Modify | New tests for the exposure endpoint                                      |

---

### Key Functions

```python
def _country_from_isin(isin: str) -> str:
    """Extract the ISO 3166-1 alpha-2 country code from an ISIN's first two characters.

    Args:
        isin: A 12-character ISIN, e.g. "DE0007037129".

    Returns:
        The two-letter country code, e.g. "DE". No validation beyond slicing —
        callers already validate ISIN format upstream (see EtfHoldingRow / the
        Amundi converter's _ISIN_PATTERN check).
    """
```

```python
def _german_country_to_iso(country_name: str) -> str | None:
    """Map a German country name from an iShares export to its ISO alpha-2 code.

    Backed by a small static dict covering the country names observed in
    EUNL.xlsx's Standort column (e.g. "Deutschland" -> "DE",
    "Vereinigte Staaten" -> "US"). Extend the dict as new countries appear in
    future holdings uploads.

    Args:
        country_name: The raw Standort cell value.

    Returns:
        The ISO alpha-2 code, or None if the country name isn't in the
        static mapping — the row still converts, just without stock_country.
    """
```

```python
async def resolve_stock_isin_aliases(
    session: AsyncSession,
    http_client: httpx.AsyncClient,
) -> int:
    """Backfill stock_isin on ticker-only EtfHolding rows via OpenFIGI.

    OpenFIGI's mapping API only resolves ISIN -> ticker, never the reverse, so
    this queries every distinct stock_isin already stored in etf_holdings
    (i.e. every Amundi-sourced ISIN seen so far, from any upload), resolves
    each to its ticker via POST /v3/mapping (idType=ID_ISIN, batched up to the
    API's per-request job limit), then updates any row across ALL ETFs still
    missing stock_isin whose (stock_ticker, stock_country) matches the
    resolved (ticker, country) pair. Matching on country as well as ticker
    avoids merging unrelated companies that coincidentally share a ticker on
    different exchanges. Re-running this after every upload (regardless of
    issuer or order) is idempotent: the UPDATE's `stock_isin IS NULL` clause
    is a no-op for rows already backfilled in a previous run.

    Args:
        session: Async SQLAlchemy session.
        http_client: Shared httpx.AsyncClient used to call OpenFIGI.

    Returns:
        Number of EtfHolding rows whose stock_isin was backfilled by this call.

    Raises:
        httpx.HTTPError: If OpenFIGI is unreachable. Callers should treat this
            as non-fatal to the upload itself — the holdings are already
            committed; reconciliation can be retried on the next upload.
    """
```

```python
def _build_holdings_exposure_query() -> Select:
    """Construct the multi-phase SQLAlchemy SELECT for look-through stock exposure.

    Phase 1 sums net stock quantity per ISIN across all owners/brokers (unlike
    `_build_portfolio_query`, which groups by `(owner, broker_platform, isin)`,
    this groups by `isin` alone to get a portfolio-wide, combined position).
    Phase 1b joins `Etf` and a correlated latest-price subquery on
    `etf_price_history` to derive each ETF's current value; ETFs with no price
    record yield a `NULL` `etf_current_value`, mirroring `_build_portfolio_query`'s
    `latest_price` handling. Phase 2 joins each ETF's most recent `EtfHolding`
    snapshot (`MAX(snapshot_date)` per `etf_id`, using the existing
    `ix_etf_holdings_etf_id_snapshot_date` index) — by this point `stock_isin` is
    already populated for most rows by `resolve_stock_isin_aliases`, so
    `EtfHolding.stock_isin`/`stock_ticker` here are trustworthy identity fields,
    not best-effort guesses. Grouping stock identities and computing weighted
    contributions is left to the caller (see `get_holdings_exposure`), since it
    requires deduplicating repeated per-ETF values across holding rows.

    Returns:
        A SQLAlchemy `Select` yielding rows of `(etf_id, etf_ticker, etf_name,
        etf_current_value, stock_isin, stock_ticker, stock_name,
        weight_percentage, snapshot_date)`. `etf_current_value` is `NULL` when
        the ETF has no price record.
    """
```

```python
async def get_holdings_exposure(
    session: AsyncSession = Depends(get_session),
) -> HoldingsExposureResponse:
    """Aggregate look-through single-stock exposure across all owned ETFs.

    Executes `_build_holdings_exposure_query()`, then in Python: deduplicates
    rows by `etf_id` to compute each ETF's share of `total_portfolio_value`
    (ETFs with a `NULL` current value are excluded from both the numerator and
    denominator and reported in `skipped_etfs` rather than failing the
    request); multiplies each holding's `weight_percentage` by its owning
    ETF's portfolio weight; and groups the results by
    `COALESCE(stock_isin, stock_ticker)`, summing contributions per stock and
    building the nested `HoldingContribution` list per group. Results are
    ordered by `total_weight_percentage` descending.

    Missing-price handling is a settled decision (not an open question): a
    priceless ETF is skipped rather than nulling the whole response.

    Args:
        session: Async SQLAlchemy session injected by `Depends(get_session)`.

    Returns:
        A `HoldingsExposureResponse` with one `HoldingExposureResponse` per
        distinct stock identity found across all owned ETFs' latest holdings
        snapshots, plus the tickers of any ETFs excluded for lacking a price
        record. Returns `holdings=[]` when no ETFs are held.

    Raises:
        sqlalchemy.exc.OperationalError: If the database is unreachable at query time.
    """
```

---

### Data Models / Schemas

```python
class EtfHolding(Base):
    # ... existing columns unchanged ...
    stock_country: Mapped[str | None] = mapped_column(String(2), nullable=True)
```

```python
class HoldingContribution(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    etf_ticker: str = Field(description="Ticker of the contributing ETF.")
    etf_name: str = Field(description="Name of the contributing ETF.")
    contribution_weight_percentage: float = Field(
        description="This ETF's contribution to the stock's total look-through weight, in percentage points."
    )
    snapshot_date: date = Field(
        description="snapshot_date of the EtfHolding row this contribution was computed from."
    )


class HoldingExposureResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    stock_isin: str | None = Field(default=None, description="ISIN of the underlying stock, when reported by its ETF(s).")
    stock_ticker: str | None = Field(default=None, description="Ticker of the underlying stock, when reported by its ETF(s).")
    stock_name: str = Field(description="Display name of the underlying stock.")
    total_weight_percentage: float = Field(
        description="Σ (etf_portfolio_weight × holding.weight_percentage) across all contributing ETFs."
    )
    contributions: list[HoldingContribution] = Field(
        description="Per-ETF breakdown of this stock's total look-through weight."
    )


class HoldingsExposureResponse(BaseModel):
    holdings: list[HoldingExposureResponse] = Field(
        description="One row per distinct stock identity (ISIN-priority, ticker-fallback), ordered by total_weight_percentage DESC."
    )
    skipped_etfs: list[str] = Field(
        default_factory=list,
        description="Tickers of owned ETFs excluded from the aggregation because they have no price record in etf_price_history.",
    )
```

No changes to `EtfHoldingRow` (the upload-time Pydantic schema) are required for `stock_country` to remain internal to the conversion pipeline.

---

### Testing Strategy

**Unit tests** (`tests/converters/test_holdings_xlsx.py`):

- `_country_from_isin("DE0007037129")` → `"DE"`.
- `_german_country_to_iso("Deutschland")` → `"DE"`; an unmapped country name → `None` (row still converts without `stock_country`, doesn't fail).
- Each converter (`_convert_ishares`, `_convert_vanguard`, `_convert_amundi`) emits `stock_country` on every row it produces, using the real fixtures (`EUNL.xlsx`, `VWCE.xlsx`, `LYP6.xlsx`).

**Unit tests** (`tests/routers/test_etfs.py`):

- Mock the OpenFIGI HTTP call: given a LYP6-sourced ISIN resolving to ticker `RWE`/country `DE`, and an existing EUNL row with `stock_ticker="RWE"`, `stock_country="DE"`, `stock_isin=None` — assert the row's `stock_isin` is backfilled after `upload_holdings`.
- Country mismatch: an EUNL row with `stock_ticker="EQT"`, `stock_country="US"` must **not** be backfilled by a resolved LYP6 ISIN mapping to ticker `EQT`/country `SE` — documents exactly the collision this design exists to prevent.
- Unresolvable ISIN (OpenFIGI returns no match, or the HTTP call fails) — the row's `stock_isin` stays `None`; the upload itself still succeeds.
- Idempotency: calling `resolve_stock_isin_aliases` twice in a row backfills the same rows once, doesn't error or double-update.
- Order independence: uploading the ticker-only ETF (EUNL) before the ISIN-only one (LYP6) still ends with EUNL's matching rows backfilled, since the reconciliation reruns on LYP6's own upload afterward.

**Unit tests** (`tests/routers/test_portfolio.py`):

- Mock `session.execute` to return synthetic flat rows spanning 2 ETFs that both hold the same stock (matching `stock_isin`, as it would be after reconciliation) — assert `total_weight_percentage` sums both ETFs' weighted contributions and `contributions` lists both source ETFs.
- Test the residual ticker-fallback case: a stock with `stock_isin = None` on all its rows (OpenFIGI could not resolve it) reported by matching `stock_ticker` in two ETFs — assert it still merges correctly via the ticker fallback.
- Test the residual limitation directly: the same company with `stock_isin` populated in one ETF row but still `None` (unresolved) with only a matching `stock_ticker` in another — assert they are **not** merged (documents the known, now-narrow residual gap for tickers reconciliation could not resolve).
- Test missing-price handling: one held ETF with no `EtfPriceHistory` row — assert its ticker appears in `skipped_etfs` and its holdings are excluded from every `total_weight_percentage`.
- Test Pydantic validation: `HoldingExposureResponse` accepts `stock_isin=None` when `stock_ticker` is set (mirrors `EtfHoldingRow`'s existing at-least-one-identifier invariant in `schemas/etfs.py`).
- Edge case: no owned ETFs → `HoldingsExposureResponse(holdings=[], skipped_etfs=[])`.

**Integration test** (manual):

```bash
# Upload LYP6 first, then EUNL — or the reverse order — and confirm both converge
curl -s -F "file=@data/holdings/original/LYP6.xlsx" http://localhost:8000/etfs/{lyp6_id}/holdings/upload
curl -s -F "file=@data/holdings/original/EUNL.xlsx" http://localhost:8000/etfs/{eunl_id}/holdings/upload
psql -c "SELECT stock_ticker, stock_isin, stock_country FROM etf_holdings WHERE stock_ticker = 'RWE';"

curl -s http://localhost:8000/portfolio/holdings/exposure | jq
```

Verify: the EUNL row for `RWE` ends up with `stock_isin = 'DE0007037129'` regardless of upload order, and the exposure endpoint's `holdings` array reflects `RWE`'s combined weight across both ETFs as a single entry, sorted by `total_weight_percentage` descending, with any price-less ETF appearing in `skipped_etfs` instead of a `500`.

**Edge cases:**

- A ticker shared by two genuinely different companies on different exchanges (e.g. `EQT` in the US vs. Sweden) → not merged, thanks to the country match.
- OpenFIGI temporarily unreachable → holdings upload still succeeds; reconciliation is retried on the next upload of any ETF.
- An ETF fully sold off (net quantity ≤ 0) → excluded from the aggregation entirely, same as `_build_portfolio_query`'s implicit handling via `net_quantity`.
- A stock reconciliation could not resolve an ISIN for, held by two ETFs from different issuers under different identifiers → reported as two separate stock rows (known, narrow residual limitation, see Open Questions and RFC FAQ).

---

### Open Questions / Risks

- [x] **Missing-price handling default** — confirmed: exclude a priceless ETF's holdings from the aggregation entirely and report it via `skipped_etfs`, rather than nulling the whole response the way `GET /portfolio/overview` does.
- [x] **Cross-issuer stock identity matching** — resolved: rather than accepting ISIN-priority/ticker-fallback as a permanent limitation, holdings-upload reconciliation backfills `EtfHolding.stock_isin` via OpenFIGI (ISIN → ticker, matched on `(ticker, country)`), so the aggregation's grouping key is reliable for the large majority of rows. Only tickers reconciliation could not resolve remain a residual, ticker-only-matched gap.
- [ ] **`Standort`→ISO country mapping completeness**: the static translation dict only covers country names actually observed in the current `EUNL.xlsx` fixture. A future EUNL re-upload introducing a new country not in the dict would silently leave `stock_country = None` for those rows (no crash, just no backfill for that row). **Target:** extend the dict if/when a future upload surfaces an unmapped country — not blocking for initial implementation.
- [ ] **OpenFIGI batch sizing**: unauthenticated requests are capped at 10 mapping jobs each; resolving ~608 ISINs means ~61 sequential requests. Confirm this completes comfortably within the 25-requests/minute unauthenticated rate limit during upload (a few minutes) without timing out the upload request itself — may need to run reconciliation as a background task rather than inline in the request/response cycle. **Target:** before this task is marked done.
- [ ] **Aggregation query performance** at realistic holdings volume (e.g. `EUNL.xlsx` alone contributes 1231 `etf_holdings` rows) is unvalidated. **Target:** before this task is marked done — validate against seeded dev data.
