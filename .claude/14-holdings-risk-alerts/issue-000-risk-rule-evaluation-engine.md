# #issue-000: Risk Rule Evaluation Engine

**GitHub Issue:** [issue-000 — Risk Rule Evaluation Engine](https://github.com/Volscente/aerarium-saturni/issues/issue-000)
**GitHub Milestone:** Risk Rule Evaluation Engine

---

## Technical Scope

**In scope:**

- `backend/src/backend/schemas/portfolio.py` — new `RiskAlert` schema; `alerts: list[RiskAlert]` added to `HoldingsExposureResponse`
- `backend/src/backend/routers/portfolio.py` — `CONCENTRATION_THRESHOLD_PCT`/`FRESHNESS_THRESHOLD_DAYS` constants; alert derivation in `get_holdings_exposure`
- `backend/tests/routers/test_portfolio.py` — new tests for both rules

**Out of scope:**

- The cache-invalidation fix that makes this data actually fresh on every request — tracked separately under TASK-1; this task's own correctness doesn't depend on it (tests exercise the function directly against mocked query results, same as every existing `get_holdings_exposure` test)
- Any frontend rendering of `alerts` — tracked separately under TASK-3
- User-configurable thresholds — both constants are fixed per the RFC's Constraints section

---

## Architecture

```txt
get_holdings_exposure(session)
          │
          ├── stmt = _build_holdings_exposure_query()          ── UNCHANGED
          ├── rows = await session.execute(stmt)                ── UNCHANGED
          │
          ├── etf_values: dict[UUID, tuple[str, Decimal|None, date]]   ── EXTENDED
          │     (etf_ticker, etf_current_value, snapshot_date) per distinct etf_id
          │     — snapshot_date is new; every row for a given etf_id already
          │     carries the same value (see _build_holdings_exposure_query's
          │     own WHERE EtfHolding.snapshot_date == latest_snapshot_subq),
          │     so capturing it once per etf_id in the existing dedup loop
          │     is free — no new query, no new loop.
          │
          ├── groups: dict[str, dict]  ── UNCHANGED (total_weight_percentage,
          │     contributions per COALESCE(stock_isin, stock_ticker))
          │
          ├── holdings = sorted(...)   ── UNCHANGED
          │
          ├── concentration_alerts = [                          ── NEW
          │       RiskAlert(rule="concentration_risk", ...)
          │       for h in holdings
          │       if h.total_weight_percentage > CONCENTRATION_THRESHOLD_PCT
          │   ]
          │
          ├── freshness_alerts = [                               ── NEW
          │       RiskAlert(rule="data_freshness_risk", ...)
          │       for (etf_ticker, _, snapshot_date) in etf_values.values()
          │       if snapshot_date is not None
          │       and (date.today() - snapshot_date).days > FRESHNESS_THRESHOLD_DAYS
          │   ]
          │
          └── return HoldingsExposureResponse(
                  holdings=holdings,
                  skipped_etfs=list(skipped_etfs),
                  alerts=concentration_alerts + freshness_alerts,   ── NEW field
              )
```

### Why `snapshot_date` piggybacks on the existing `etf_values` dedup, not a new query

`_build_holdings_exposure_query()` already selects `EtfHolding.snapshot_date` per row and already filters to each ETF's single latest snapshot (`WHERE EtfHolding.snapshot_date == latest_snapshot_subq`) — every row sharing an `etf_id` therefore carries the identical `snapshot_date` value. The existing loop that builds `etf_values` already dedupes by `etf_id` on first sight of each one (to capture `etf_ticker`/`etf_current_value` exactly once); extending that same tuple to also capture `row.snapshot_date` costs nothing extra and keeps freshness data scoped to the one place ETF-level dedup already happens, rather than introducing a second per-ETF pass.

### Why freshness alerts are built from `etf_values`, not from `groups`/`holdings`

`groups`/`holdings` are keyed by stock identity, not ETF identity — a single ETF's `snapshot_date` would otherwise need re-deriving from whichever `HoldingContribution` happens to reference it, once per stock it holds. `etf_values` is already the one dict keyed by `etf_id`, exactly matching what a per-ETF freshness rule needs.

---

## Tech Stack

No new packages — `date.today()` and `timedelta` are from the standard library `datetime` module, already imported indirectly via `date` in `schemas/portfolio.py`; `routers/portfolio.py` needs a new `from datetime import date, timedelta` import (it currently has no `datetime` import at all, per its current import block).

---

## Implementation Details

### Modules / Files

| File | Action | Description |
| --- | --- | --- |
| `backend/src/backend/schemas/portfolio.py` | Modify | New `RiskAlert` model; `alerts` field on `HoldingsExposureResponse` |
| `backend/src/backend/routers/portfolio.py` | Modify | Threshold constants; alert derivation appended to `get_holdings_exposure` |
| `backend/tests/routers/test_portfolio.py` | Modify | New test functions for both rules |
| `backend/tests/conftest.py` | Modify | Extend `_make_holdings_exposure_row`-backed fixtures with a `snapshot_date` far enough in the past to exercise the freshness rule, alongside existing fixtures |

---

### Key Functions / Models

```python
# backend/src/backend/schemas/portfolio.py

from typing import Literal


class RiskAlert(BaseModel):
    """A single active risk warning, computed by get_holdings_exposure.

    One instance per breached rule instance — e.g. two different stocks both
    over the concentration threshold produce two separate RiskAlert objects,
    not one combined alert.
    """

    model_config = ConfigDict(from_attributes=True)

    rule: Literal["concentration_risk", "data_freshness_risk"] = Field(
        description="Which rule produced this alert."
    )
    message: str = Field(description="Human-readable summary, ready to render as-is.")
    # Concentration Risk context (present only when rule == 'concentration_risk'):
    stock_isin: str | None = Field(default=None, description="ISIN of the concentrated stock, if known.")
    stock_ticker: str | None = Field(default=None, description="Ticker of the concentrated stock, if known.")
    stock_name: str | None = Field(default=None, description="Name of the concentrated stock.")
    total_weight_percentage: float | None = Field(
        default=None, description="The breaching total_weight_percentage value."
    )
    # Data Freshness Risk context (present only when rule == 'data_freshness_risk'):
    etf_ticker: str | None = Field(default=None, description="Ticker of the stale ETF.")
    etf_name: str | None = Field(default=None, description="Name of the stale ETF.")
    snapshot_date: date | None = Field(default=None, description="The stale ETF's latest holdings snapshot_date.")
    days_stale: int | None = Field(default=None, description="Days between today and snapshot_date.")
```

```python
# backend/src/backend/routers/portfolio.py

CONCENTRATION_THRESHOLD_PCT = Decimal("10")
FRESHNESS_THRESHOLD_DAYS = 60


def _build_concentration_alerts(holdings: list[HoldingExposureResponse]) -> list[RiskAlert]:
    """Builds one RiskAlert per holding whose total_weight_percentage exceeds
    CONCENTRATION_THRESHOLD_PCT.

    Strict `>`, matching the same convention already established across the
    frontend's badge/bar-chart/treemap warning coloring (a holding sitting
    exactly at the threshold is at the limit, not yet over it).

    Args:
        holdings: The already-built, already-sorted holdings list.

    Returns:
        Zero or more RiskAlert objects with rule='concentration_risk'.
    """


def _build_freshness_alerts(
    etf_values: dict[UUID, tuple[str, Decimal | None, date | None]],
) -> list[RiskAlert]:
    """Builds one RiskAlert per distinct owned ETF whose latest snapshot_date
    is more than FRESHNESS_THRESHOLD_DAYS days before today.

    An ETF with no holdings snapshot at all (snapshot_date is None — not
    structurally possible today since every row in etf_values comes from a
    join against EtfHolding, but defensively skipped rather than raising)
    produces no alert; a priceless ETF (already excluded from etf_values'
    weighting elsewhere) can still be evaluated for freshness independently,
    since freshness is about the holdings snapshot, not the price record.

    Args:
        etf_values: The existing per-etf_id dedup dict, extended with each
            ETF's snapshot_date as its third tuple element.

    Returns:
        Zero or more RiskAlert objects with rule='data_freshness_risk'.
    """
```

`get_holdings_exposure` calls both helpers after `holdings` is built, and returns their concatenation as `alerts` on the response. Extracting these as two named functions (rather than inlining two more comprehensions into an already-long function body) mirrors how `_build_holdings_exposure_query`/`_to_row_response` are already split out as named helpers elsewhere in this file.

---

### Data Models / Schemas

```python
# backend/src/backend/schemas/portfolio.py — HoldingsExposureResponse, extended

class HoldingsExposureResponse(BaseModel):
    holdings: list[HoldingExposureResponse] = Field(...)
    skipped_etfs: list[str] = Field(default_factory=list, ...)
    alerts: list[RiskAlert] = Field(
        default_factory=list,
        description="Active Concentration Risk and Data Freshness Risk warnings, computed fresh on every request.",
    )
```

---

### Testing Strategy

**Unit tests** (`backend/tests/routers/test_portfolio.py`, mirroring the existing `test_get_holdings_exposure_*` fixture-based pattern):

- `test_get_holdings_exposure_concentration_alert_above_threshold` — a holding at e.g. `12%` total weight produces one `concentration_risk` alert referencing that stock.
- `test_get_holdings_exposure_no_concentration_alert_at_exactly_threshold` — a holding at exactly `10%` produces zero concentration alerts (strict `>`).
- `test_get_holdings_exposure_freshness_alert_when_stale` — an ETF whose `snapshot_date` is 61+ days old produces one `data_freshness_risk` alert.
- `test_get_holdings_exposure_no_freshness_alert_at_exactly_threshold` — an ETF at exactly 60 days old produces zero freshness alerts.
- `test_get_holdings_exposure_multiple_alerts` — a fixture combining both a concentrated stock and a stale ETF produces both alerts in the same response.
- `test_get_holdings_exposure_no_alerts_when_nothing_breaches` — the existing `client_exposure_merged_by_isin`-style fixture (all weights well under 10%, snapshot dates recent) produces `alerts == []`; extend that existing test rather than duplicating its fixture.

**Fixtures** (`backend/tests/conftest.py`): `_make_holdings_exposure_row` already accepts a `snapshot_date` override — no new helper needed, just new fixture functions supplying dates far enough in the past (or exactly 60/61 days back, computed relative to a frozen reference rather than `date.today()` at test-authoring time, so the test doesn't silently start failing months from now — see Open Questions).

**Edge cases:**

- Zero owned ETFs (`etf_values` empty) → both alert lists are empty, `alerts == []`, matching `test_get_holdings_exposure_empty`'s existing empty-response shape.
- A priceless ETF (already in `skipped_etfs`, excluded from concentration weighting) whose holdings snapshot is also stale → still produces a freshness alert, since freshness doesn't depend on price data being present.
- A stock breaching concentration whose only contributing ETF is also stale → both a `concentration_risk` alert (for the stock) and a `data_freshness_risk` alert (for the ETF) appear in the same `alerts` list, independently.

---

### Open Questions / Risks

- [ ] **Freezing "today" for the freshness test boundary:** `_build_freshness_alerts` compares against `date.today()` at request time by design (no injected clock — this is a straightforward per-request comparison, not a scheduled job). The exactly-60-day and 61-day test fixtures need a `snapshot_date` computed relative to `date.today()` at test-run time (e.g. `date.today() - timedelta(days=61)`), not a hardcoded literal date, so the boundary tests keep passing indefinitely rather than only working near their authoring date. **Target:** implementation time — straightforward to get right, but easy to get wrong by hardcoding a date.
