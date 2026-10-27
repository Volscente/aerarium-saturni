import asyncio
from datetime import UTC, date, datetime
from decimal import Decimal

import httpx
import pytest

from backend.providers.base import PricePoint, PriceProviderError
from backend.providers.yahoo import YahooPriceProvider


def _ts(year: int, month: int, day: int, hour: int = 8, minute: int = 0) -> int:
    return int(datetime(year, month, day, hour, minute, tzinfo=UTC).timestamp())


def _payload(timestamps, closes, currency="EUR", gmtoffset=3600) -> dict:
    return {
        "chart": {
            "result": [
                {
                    "meta": {"currency": currency, "gmtoffset": gmtoffset},
                    "timestamp": timestamps,
                    "indicators": {"quote": [{"close": closes}]},
                }
            ],
            "error": None,
        }
    }


def _fetch(handler, symbol: str = "VWCE.DE", start: date | None = None) -> list[PricePoint]:
    async def run() -> list[PricePoint]:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await YahooPriceProvider(client).fetch_daily_prices(symbol, start)

    return asyncio.run(run())


def _respond(payload: dict):
    return lambda request: httpx.Response(200, json=payload)


def test_fetch_parses_ascending_points_with_exchange_local_dates():
    """Valid payload → ascending PricePoints with close, currency and exchange-local date."""
    payload = _payload(
        # Out of order on purpose; the late-evening UTC bar is already the next day in CET (+1h).
        [_ts(2026, 10, 21), _ts(2026, 10, 19), _ts(2026, 10, 21, 23, 30)],
        [101.5, 100.25, 102.0],
    )
    points = _fetch(_respond(payload))
    assert [p.date for p in points] == [date(2026, 10, 19), date(2026, 10, 21), date(2026, 10, 22)]
    assert points[0] == PricePoint(date(2026, 10, 19), Decimal("100.25"), "EUR")
    assert all(p.currency == "EUR" for p in points)


def test_fetch_drops_null_closes_and_collapses_duplicate_dates():
    """null closes are dropped; two bars on the same local date collapse to the later one."""
    payload = _payload(
        [_ts(2026, 10, 19), _ts(2026, 10, 20), _ts(2026, 10, 21, 8), _ts(2026, 10, 21, 9)],
        [100.0, None, 101.0, 102.0],
    )
    points = _fetch(_respond(payload))
    assert [(p.date, p.close) for p in points] == [
        (date(2026, 10, 19), Decimal("100.0")),
        (date(2026, 10, 21), Decimal("102.0")),
    ]


def test_fetch_without_start_requests_max_range():
    """start=None sends range=max and no period parameters."""
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(request.url.params)
        seen["path"] = request.url.path
        return httpx.Response(200, json=_payload([_ts(2026, 10, 19)], [100.0]))

    _fetch(handler, symbol="EUNL.DE")
    assert seen["range"] == "max"
    assert seen["interval"] == "1d"
    assert "period1" not in seen
    assert seen["path"].endswith("/EUNL.DE")


def test_fetch_with_start_sends_period_bounds_and_no_range():
    """A start date sends period1 (00:00 UTC of that day) and period2, and no range."""
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(request.url.params)
        return httpx.Response(200, json=_payload([_ts(2026, 10, 19)], [100.0]))

    _fetch(handler, start=date(2026, 10, 19))
    assert "range" not in seen
    assert int(seen["period1"]) == _ts(2026, 10, 19, 0)
    assert int(seen["period2"]) >= int(seen["period1"])


@pytest.mark.parametrize(
    "body",
    [
        {"chart": {"result": None, "error": {"code": "Not Found", "description": "No data found"}}},
        {"chart": {"result": [], "error": None}},
        {"unexpected": "shape"},
    ],
    ids=["chart-error", "empty-result", "unexpected-shape"],
)
def test_fetch_error_payloads_raise_provider_error(body):
    """chart.error / empty result / unexpected shape → PriceProviderError."""
    with pytest.raises(PriceProviderError):
        _fetch(_respond(body))


def test_fetch_non_json_body_raises_provider_error():
    """A non-JSON body → PriceProviderError."""
    with pytest.raises(PriceProviderError):
        _fetch(lambda request: httpx.Response(200, text="<html>not json</html>"))


@pytest.mark.parametrize("status", [404, 429, 500])
def test_fetch_http_errors_raise_provider_error(status):
    """HTTP 404/429/5xx → PriceProviderError naming the status."""
    with pytest.raises(PriceProviderError, match=str(status)):
        _fetch(lambda request: httpx.Response(status))


def test_fetch_transport_error_raises_provider_error():
    """A transport failure (ConnectError) → PriceProviderError."""

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom")

    with pytest.raises(PriceProviderError):
        _fetch(handler)
