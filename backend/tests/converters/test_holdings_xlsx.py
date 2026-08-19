from decimal import Decimal
from pathlib import Path

import pytest

from backend.converters.holdings_xlsx import convert_holdings_xlsx, write_csv
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
    assert set(rows[0].keys()) == {"stock_ticker", "stock_name", "weight_percentage", "snapshot_date"}
    assert rows[0] == {
        "stock_ticker": "NVDA",
        "stock_name": "NVIDIA CORP",
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
    assert set(rows[0].keys()) == {"stock_ticker", "stock_name", "weight_percentage", "snapshot_date"}
    assert rows[0] == {
        "stock_ticker": "NVDA",
        "stock_name": "NVIDIA Corp",
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
    assert set(rows[0].keys()) == {"stock_isin", "stock_name", "weight_percentage", "snapshot_date"}
    assert rows[0] == {
        "stock_isin": "NL0010273215",
        "stock_name": "ASML HOLDING NV",
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
