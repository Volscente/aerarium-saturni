import os

os.environ["DATABASE_URL"] = "postgresql+psycopg://test:test@localhost/test"

from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.db import get_session
from backend.main import app
from backend.models import Etf, Transaction

VALID_ETF_PAYLOAD = {
    "ticker": "VWCE",
    "isin": "IE00B3RBWM25",
    "name": "Vanguard FTSE All-World UCITS ETF",
    "issuer": "Vanguard",
    "asset_class": "Equities",
    "tracked_index": "FTSE All-World",
    "ter": "0.0022",
    "domicile": "Ireland",
    "currency_hedged": False,
    "fiscal_year_end": "31-Dec",
    "german_tax_classification": "Aktien",
    "replication_strategy": "Full replication",
    "dividend_policy": "Accumulating",
    "geographical_distribution": {"US": 63.0, "EU": 20.0},
    "sector_distribution": {"Technology": 25.0, "Financials": 18.0},
}

VALID_BUY_PAYLOAD = {
    "owner": "simone",
    "broker_platform": "ibkr",
    "transaction_type": "buy",
    "asset_class": "stock",
    "ticker": "AAPL",
    "isin": "US0378331005",
    "quantity": "10.0000",
    "price": "175.0000",
    "currency": "USD",
    "fees": "1.5000",
    "transaction_date": "2026-06-11",
}


def _make_async_cm(return_value: object = None) -> MagicMock:
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=return_value or AsyncMock())
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm


def _make_mock_row(**overrides) -> MagicMock:
    row = MagicMock(spec=Transaction)
    row.id = overrides.get("id", uuid4())
    row.owner = overrides.get("owner", "simone")
    row.broker_platform = overrides.get("broker_platform", "ibkr")
    row.transaction_type = overrides.get("transaction_type", "buy")
    row.asset_class = overrides.get("asset_class", "stock")
    row.ticker = overrides.get("ticker", "AAPL")
    row.isin = overrides.get("isin", "US0378331005")
    row.quantity = overrides.get("quantity", Decimal("10.0000"))
    row.price = overrides.get("price", Decimal("175.0000"))
    row.ratio = overrides.get("ratio", None)
    row.currency = overrides.get("currency", "USD")
    row.fees = overrides.get("fees", Decimal("1.5000"))
    row.transaction_date = overrides.get("transaction_date", date(2026, 6, 11))
    row.created_at = overrides.get("created_at", datetime(2026, 6, 11, 12, 0, 0, tzinfo=timezone.utc))
    return row


@pytest.fixture
def mock_session_empty():
    """Async session that returns an empty list for execute queries and handles add/commit/refresh."""
    session = AsyncMock()
    session.add = MagicMock()

    result = MagicMock()
    result.scalars.return_value.all.return_value = []
    session.execute = AsyncMock(return_value=result)

    async def mock_refresh(obj):
        obj.id = uuid4()
        obj.created_at = datetime(2026, 6, 11, 12, 0, 0, tzinfo=timezone.utc)

    session.refresh = mock_refresh
    return session


@pytest.fixture
def mock_session_with_rows():
    """Async session that returns two rows with different dates and owners."""
    session = AsyncMock()
    session.add = MagicMock()

    rows = [
        _make_mock_row(
            owner="simone",
            transaction_date=date(2026, 6, 11),
        ),
        _make_mock_row(
            owner="simone",
            transaction_date=date(2026, 5, 1),
        ),
    ]

    result = MagicMock()
    result.scalars.return_value.all.return_value = rows
    session.execute = AsyncMock(return_value=result)
    return session


def _build_client(session_fixture) -> TestClient:
    async def override_get_session():
        yield session_fixture

    app.dependency_overrides[get_session] = override_get_session
    mock_conn = AsyncMock()
    with patch("backend.main.engine.begin", return_value=_make_async_cm(mock_conn)):
        client = TestClient(app)
        return client


@pytest.fixture
def client(mock_session_empty):
    async def override_get_session():
        yield mock_session_empty

    app.dependency_overrides[get_session] = override_get_session
    mock_conn = AsyncMock()
    mock_engine = MagicMock()
    mock_conn = AsyncMock()
    mock_conn.run_sync = AsyncMock()
    mock_engine.begin.return_value = _make_async_cm(mock_conn)
    with patch("backend.main.engine", mock_engine):
        with TestClient(app) as c:
            yield c
    app.dependency_overrides.clear()


def _make_mock_etf_row(**overrides) -> MagicMock:
    row = MagicMock(spec=Etf)
    row.id = overrides.get("id", uuid4())
    row.ticker = overrides.get("ticker", "VWCE")
    row.isin = overrides.get("isin", "IE00B3RBWM25")
    row.name = overrides.get("name", "Vanguard FTSE All-World UCITS ETF")
    row.issuer = overrides.get("issuer", "Vanguard")
    row.asset_class = overrides.get("asset_class", "Equities")
    row.tracked_index = overrides.get("tracked_index", "FTSE All-World")
    row.ter = overrides.get("ter", Decimal("0.0022"))
    row.domicile = overrides.get("domicile", "Ireland")
    row.currency_hedged = overrides.get("currency_hedged", False)
    row.fiscal_year_end = overrides.get("fiscal_year_end", "31-Dec")
    row.german_tax_classification = overrides.get("german_tax_classification", "Aktien")
    row.replication_strategy = overrides.get("replication_strategy", "Full replication")
    row.dividend_policy = overrides.get("dividend_policy", "Accumulating")
    row.dividend_frequency = overrides.get("dividend_frequency", None)
    row.fund_size = overrides.get("fund_size", None)
    row.monthly_volume = overrides.get("monthly_volume", None)
    row.volatility_1y = overrides.get("volatility_1y", None)
    row.volatility_3y = overrides.get("volatility_3y", None)
    row.holdings_overview = overrides.get("holdings_overview", None)
    row.geographical_distribution = overrides.get("geographical_distribution", {"US": 63.0, "EU": 20.0})
    row.sector_distribution = overrides.get("sector_distribution", {"Technology": 25.0, "Financials": 18.0})
    row.bond_maturities = overrides.get("bond_maturities", None)
    row.bond_credit_scores = overrides.get("bond_credit_scores", None)
    row.created_at = overrides.get("created_at", datetime(2026, 6, 19, 12, 0, 0, tzinfo=timezone.utc))
    return row


@pytest.fixture
def mock_session_with_etfs():
    """Async session returning two ETF rows for list queries and one for id queries."""
    session = AsyncMock()
    session.add = MagicMock()
    session.add_all = MagicMock()

    rows = [
        _make_mock_etf_row(),
        _make_mock_etf_row(ticker="CSPX", isin="IE00B5BMR087"),
    ]

    result = MagicMock()
    result.scalars.return_value.all.return_value = rows
    result.scalar_one_or_none.return_value = rows[0]
    session.execute = AsyncMock(return_value=result)

    async def mock_refresh(obj):
        obj.id = uuid4()
        obj.created_at = datetime(2026, 6, 19, 12, 0, 0, tzinfo=timezone.utc)

    session.refresh = mock_refresh
    return session


@pytest.fixture
def mock_session_etf_not_found():
    """Async session returning None from scalar_one_or_none (ETF not found)."""
    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    session.execute = AsyncMock(return_value=result)
    return session


@pytest.fixture
def client_with_rows(mock_session_with_rows):
    async def override_get_session():
        yield mock_session_with_rows

    app.dependency_overrides[get_session] = override_get_session
    mock_engine = MagicMock()
    mock_conn = AsyncMock()
    mock_conn.run_sync = AsyncMock()
    mock_engine.begin.return_value = _make_async_cm(mock_conn)
    with patch("backend.main.engine", mock_engine):
        with TestClient(app) as c:
            yield c
    app.dependency_overrides.clear()


@pytest.fixture
def client_with_etfs(mock_session_with_etfs):
    async def override_get_session():
        yield mock_session_with_etfs

    app.dependency_overrides[get_session] = override_get_session
    mock_engine = MagicMock()
    mock_conn = AsyncMock()
    mock_conn.run_sync = AsyncMock()
    mock_engine.begin.return_value = _make_async_cm(mock_conn)
    with patch("backend.main.engine", mock_engine):
        with TestClient(app) as c:
            yield c
    app.dependency_overrides.clear()


@pytest.fixture
def client_etf_not_found(mock_session_etf_not_found):
    async def override_get_session():
        yield mock_session_etf_not_found

    app.dependency_overrides[get_session] = override_get_session
    mock_engine = MagicMock()
    mock_conn = AsyncMock()
    mock_conn.run_sync = AsyncMock()
    mock_engine.begin.return_value = _make_async_cm(mock_conn)
    with patch("backend.main.engine", mock_engine):
        with TestClient(app) as c:
            yield c
    app.dependency_overrides.clear()
