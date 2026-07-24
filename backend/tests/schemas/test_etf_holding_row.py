import os

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test:test@localhost/test")

from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from backend.schemas.etfs import EtfHoldingRow

VALID_ROW = {
    "stock_isin": "IE00B3RBWM25",
    "stock_name": "Vanguard FTSE All-World UCITS ETF",
    "weight_percentage": "0.5000",
    "snapshot_date": "2026-07-22",
}


def test_valid_row():
    """All required fields present and well-formed — model instantiates without error."""
    row = EtfHoldingRow(**VALID_ROW)
    assert row.stock_isin == "IE00B3RBWM25"
    assert row.stock_name == "Vanguard FTSE All-World UCITS ETF"
    assert row.weight_percentage == Decimal("0.5000")
    assert row.snapshot_date == date(2026, 7, 22)


def test_invalid_isin_too_short():
    """ISIN with 11 characters raises ValidationError."""
    with pytest.raises(ValidationError):
        EtfHoldingRow(**{**VALID_ROW, "stock_isin": "IE00B3RBWM2"})


def test_invalid_isin_non_alphanumeric():
    """ISIN that is 12 chars but contains a special character raises ValidationError."""
    with pytest.raises(ValidationError):
        EtfHoldingRow(**{**VALID_ROW, "stock_isin": "IE00B3RBW-25"})


def test_weight_percentage_zero():
    """weight_percentage = 0 raises ValidationError (must be > 0)."""
    with pytest.raises(ValidationError):
        EtfHoldingRow(**{**VALID_ROW, "weight_percentage": "0"})


def test_weight_percentage_negative():
    """Negative weight_percentage raises ValidationError."""
    with pytest.raises(ValidationError):
        EtfHoldingRow(**{**VALID_ROW, "weight_percentage": "-0.5"})


def test_missing_stock_name():
    """Omitting stock_name raises ValidationError."""
    payload = {k: v for k, v in VALID_ROW.items() if k != "stock_name"}
    with pytest.raises(ValidationError):
        EtfHoldingRow(**payload)


def test_missing_snapshot_date():
    """Omitting snapshot_date raises ValidationError."""
    payload = {k: v for k, v in VALID_ROW.items() if k != "snapshot_date"}
    with pytest.raises(ValidationError):
        EtfHoldingRow(**payload)


def test_isin_lowercase_normalised():
    """Lowercase ISIN is silently normalised to uppercase — no error raised."""
    row = EtfHoldingRow(**{**VALID_ROW, "stock_isin": "ie00b3rbwm25"})
    assert row.stock_isin == "IE00B3RBWM25"
