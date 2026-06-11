import os

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test:test@localhost/test")

from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.db import get_session
from backend.main import app
from backend.models import Transaction

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
