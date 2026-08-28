import asyncio
from decimal import Decimal
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from backend.converters.holdings_xlsx import (
    _OPENFIGI_JOBS_PER_REQUEST,
    _country_from_isin,
    _german_country_to_iso,
    convert_holdings_xlsx,
    resolve_stock_isin_aliases,
    write_csv,
)
from backend.schemas.etfs import EtfHoldingRow

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "data" / "holdings" / "original"


def _assert_all_rows_valid(rows: list[dict[str, str]]) -> None:
    """Every row must pass the same EtfHoldingRow validation the upload endpoint applies."""
    for row in rows:
        EtfHoldingRow(**row)


def test_convert_ishares_valid():
    """iShares (EUNL.xlsx): ticker-only rows, German header, date parsed from title cell."""
    rows = convert_holdings_xlsx(FIXTURES_DIR / "EUNL.xlsx")

    assert len(rows) == 1231
    assert set(rows[0].keys()) == {
        "stock_ticker",
        "stock_name",
        "stock_country",
        "weight_percentage",
        "snapshot_date",
    }
    assert rows[0] == {
        "stock_ticker": "NVDA",
        "stock_name": "NVIDIA CORP",
        "stock_country": "US",
        "weight_percentage": "5.4400",
        "snapshot_date": "2026-07-23",
    }
    assert all(Decimal(r["weight_percentage"]) > 0 for r in rows)
    _assert_all_rows_valid(rows)


def test_convert_ishares_excludes_cash_and_derivative_lines():
    """Cash, money-market, and futures/FX overlay rows (Anlageklasse != 'Aktien') are dropped."""
    rows = convert_holdings_xlsx(FIXTURES_DIR / "EUNL.xlsx")

    assert not any(r["stock_ticker"] in {"USD", "GBP", "EUR", "CHF"} for r in rows)
    assert not any("CASH" in r["stock_name"].upper() for r in rows)


def test_convert_vanguard_valid():
    """Vanguard (VWCE.xlsx): ticker-only rows, date parsed from 'Per DD. Month YYYY' title."""
    rows = convert_holdings_xlsx(FIXTURES_DIR / "VWCE.xlsx")

    assert len(rows) == 3697
    assert set(rows[0].keys()) == {
        "stock_ticker",
        "stock_name",
        "stock_country",
        "weight_percentage",
        "snapshot_date",
    }
    assert rows[0] == {
        "stock_ticker": "NVDA",
        "stock_name": "NVIDIA Corp",
        "stock_country": "US",
        "weight_percentage": "4.4503",
        "snapshot_date": "2026-06-30",
    }
    assert all(Decimal(r["weight_percentage"]) > 0 for r in rows)
    _assert_all_rows_valid(rows)


def test_convert_vanguard_excludes_blank_ticker_and_zero_weight_rows():
    """Secondary listings with no ticker, and positions rounding to 0.00%, are dropped."""
    rows = convert_holdings_xlsx(FIXTURES_DIR / "VWCE.xlsx")

    assert all(r["stock_ticker"] for r in rows)
    assert not any(r["stock_name"] == "AXIA ENERGIA SA" for r in rows)


def test_convert_amundi_valid():
    """Amundi (LYP6.xlsx): ISIN-only rows, malformed styles.xml, weight given as a fraction."""
    rows = convert_holdings_xlsx(FIXTURES_DIR / "LYP6.xlsx")

    assert len(rows) == 609
    assert set(rows[0].keys()) == {
        "stock_isin",
        "stock_name",
        "stock_country",
        "weight_percentage",
        "snapshot_date",
    }
    assert rows[0] == {
        "stock_isin": "NL0010273215",
        "stock_name": "ASML HOLDING NV",
        "stock_country": "NL",
        "weight_percentage": "4.5914",
        "snapshot_date": "2026-07-22",
    }
    assert all(Decimal(r["weight_percentage"]) > 0 for r in rows)
    _assert_all_rows_valid(rows)


def test_convert_amundi_excludes_cash_and_futures_lines():
    """CASH lines and the STOXX futures overlay (Anlageklasse != 'EQUITY') are dropped."""
    rows = convert_holdings_xlsx(FIXTURES_DIR / "LYP6.xlsx")

    assert not any(r["stock_name"] == "STOXX EUROPE 600 09/26 EUREX" for r in rows)


def test_convert_unknown_ticker_raises():
    """A file whose stem isn't a registered ticker raises before any parsing is attempted."""
    with pytest.raises(ValueError, match="Unrecognised ETF ticker"):
        convert_holdings_xlsx(Path("UNKNOWN.xlsx"))


def test_convert_from_file_like_object_with_explicit_ticker():
    """A BytesIO source (e.g. an in-memory upload) works with an explicit ticker argument."""
    with (FIXTURES_DIR / "EUNL.xlsx").open("rb") as f:
        rows = convert_holdings_xlsx(f, ticker="eunl")

    assert len(rows) == 1231
    assert rows[0]["stock_ticker"] == "NVDA"


def test_convert_file_like_object_without_ticker_raises():
    """A non-Path source has no filename to infer a ticker from, so ticker is required."""
    with (FIXTURES_DIR / "EUNL.xlsx").open("rb") as f:
        with pytest.raises(ValueError, match="ticker must be provided"):
            convert_holdings_xlsx(f)


@pytest.mark.parametrize(
    "stem",
    ["EUNL", "eunl", "EUNL (1)", "EUNL(2)", "EUNL_2026-07-23", "EUNL-holdings"],
)
def test_convert_resolves_ticker_from_renamed_or_suffixed_filenames(stem):
    """The ticker is resolved from a leading token, not an exact match, so browser-suffixed repeat downloads (e.g. 'EUNL (1).xlsx') still resolve to EUNL."""
    with (FIXTURES_DIR / "EUNL.xlsx").open("rb") as f:
        rows = convert_holdings_xlsx(f, ticker=stem)

    assert len(rows) == 1231
    assert rows[0]["stock_ticker"] == "NVDA"


def test_country_from_isin():
    """The country code is the ISIN's first two characters."""
    assert _country_from_isin("DE0007037129") == "DE"
    assert _country_from_isin("NL0010273215") == "NL"


def test_german_country_to_iso_known_and_unknown():
    """Known Standort values map to ISO alpha-2; unmapped names return None."""
    assert _german_country_to_iso("Deutschland") == "DE"
    assert _german_country_to_iso("Vereinigte Staaten") == "US"
    assert _german_country_to_iso("Atlantis") is None


def test_write_csv_roundtrip(tmp_path):
    """Rows written to CSV and re-read via csv.DictReader still validate against EtfHoldingRow."""
    import csv

    rows = convert_holdings_xlsx(FIXTURES_DIR / "EUNL.xlsx")
    output_path = tmp_path / "EUNL.csv"

    write_csv(rows, output_path)

    with output_path.open() as f:
        reread_rows = list(csv.DictReader(f))

    assert len(reread_rows) == len(rows)
    _assert_all_rows_valid(reread_rows)


def _make_openfigi_response(tickers: list[str | None]) -> MagicMock:
    """Build a mocked httpx.Response mimicking OpenFIGI's /v3/mapping shape."""
    response = MagicMock()
    response.raise_for_status = MagicMock()
    response.json.return_value = [
        {"data": [{"ticker": ticker}]} if ticker else {"warning": "No identifier found."}
        for ticker in tickers
    ]
    return response


def test_resolve_stock_isin_aliases_backfills_matching_ticker_and_country():
    """A LYP6-sourced ISIN resolving to ticker RWE/country DE backfills a matching EUNL row."""
    session = AsyncMock()
    isins_result = MagicMock()
    isins_result.all.return_value = [("DE0007037129",)]
    update_result = MagicMock()
    update_result.rowcount = 1
    session.execute = AsyncMock(side_effect=[isins_result, update_result])
    session.commit = AsyncMock()

    http_client = AsyncMock()
    http_client.post = AsyncMock(return_value=_make_openfigi_response(["RWE"]))

    updated = asyncio.run(resolve_stock_isin_aliases(session, http_client))

    assert updated == 1
    session.commit.assert_awaited_once()


def test_resolve_stock_isin_aliases_country_mismatch_not_backfilled():
    """A resolved ticker whose country doesn't match any row backfills nothing."""
    session = AsyncMock()
    isins_result = MagicMock()
    isins_result.all.return_value = [("SE0012853455",)]
    update_result = MagicMock()
    update_result.rowcount = 0
    session.execute = AsyncMock(side_effect=[isins_result, update_result])
    session.commit = AsyncMock()

    http_client = AsyncMock()
    http_client.post = AsyncMock(return_value=_make_openfigi_response(["EQT"]))

    updated = asyncio.run(resolve_stock_isin_aliases(session, http_client))

    assert updated == 0
    session.commit.assert_not_awaited()


def test_resolve_stock_isin_aliases_unresolvable_isin_stays_none():
    """An ISIN OpenFIGI can't resolve (no data in the response) backfills nothing."""
    session = AsyncMock()
    isins_result = MagicMock()
    isins_result.all.return_value = [("XX0000000000",)]
    session.execute = AsyncMock(return_value=isins_result)
    session.commit = AsyncMock()

    http_client = AsyncMock()
    http_client.post = AsyncMock(return_value=_make_openfigi_response([None]))

    updated = asyncio.run(resolve_stock_isin_aliases(session, http_client))

    assert updated == 0
    session.commit.assert_not_awaited()


def test_resolve_stock_isin_aliases_continues_after_batch_failure(monkeypatch):
    """A rate-limited/failing batch does not discard an earlier batch's successful resolution."""
    monkeypatch.setattr(
        "backend.converters.holdings_xlsx.asyncio.sleep",
        AsyncMock(return_value=None),
    )

    isins = [f"DE00000000{i:02d}" for i in range(_OPENFIGI_JOBS_PER_REQUEST + 1)]
    session = AsyncMock()
    isins_result = MagicMock()
    isins_result.all.return_value = [(isin,) for isin in isins]
    update_result = MagicMock()
    update_result.rowcount = 1
    session.execute = AsyncMock(side_effect=[isins_result, update_result])
    session.commit = AsyncMock()

    first_batch_response = _make_openfigi_response(["RWE"] + [None] * (_OPENFIGI_JOBS_PER_REQUEST - 1))
    http_client = AsyncMock()
    http_client.post = AsyncMock(
        side_effect=[
            first_batch_response,
            httpx.HTTPStatusError("429 Too Many Requests", request=MagicMock(), response=MagicMock()),
        ]
    )

    updated = asyncio.run(resolve_stock_isin_aliases(session, http_client))

    assert updated == 1
    session.commit.assert_awaited_once()


def test_resolve_stock_isin_aliases_no_isins_short_circuits():
    """No stock_isin values in etf_holdings yet -> no OpenFIGI call is made."""
    session = AsyncMock()
    isins_result = MagicMock()
    isins_result.all.return_value = []
    session.execute = AsyncMock(return_value=isins_result)

    http_client = AsyncMock()

    updated = asyncio.run(resolve_stock_isin_aliases(session, http_client))

    assert updated == 0
    http_client.post.assert_not_called()
