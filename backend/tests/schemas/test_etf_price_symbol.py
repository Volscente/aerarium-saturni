import pytest
from pydantic import ValidationError

from backend.schemas.etfs import EtfCreate, EtfUpdate
from tests.conftest import VALID_ETF_PAYLOAD


def test_create_without_price_symbol_defaults_to_none():
    """EtfCreate without price_symbol is valid and the field is None."""
    assert EtfCreate(**VALID_ETF_PAYLOAD).price_symbol is None


def test_create_with_price_symbol_strips_whitespace():
    """price_symbol is accepted and surrounding whitespace is stripped."""
    etf = EtfCreate(**VALID_ETF_PAYLOAD, price_symbol="  VWCE.DE ")
    assert etf.price_symbol == "VWCE.DE"


def test_create_empty_price_symbol_rejected():
    """An empty price_symbol violates min_length=1."""
    with pytest.raises(ValidationError):
        EtfCreate(**VALID_ETF_PAYLOAD, price_symbol="")


def test_create_too_long_price_symbol_rejected():
    """A 31-character price_symbol violates max_length=30."""
    with pytest.raises(ValidationError):
        EtfCreate(**VALID_ETF_PAYLOAD, price_symbol="X" * 31)


def test_update_accepts_price_symbol_and_defaults_to_none():
    """EtfUpdate accepts price_symbol; omitting it leaves it None."""
    assert EtfUpdate(price_symbol="CSPX.L").price_symbol == "CSPX.L"
    assert EtfUpdate().price_symbol is None
