from datetime import UTC, date, datetime, time
from decimal import Decimal
from urllib.parse import quote

import httpx

from backend.providers.base import PricePoint, PriceProviderError

YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/"


class YahooPriceProvider:
    """Daily-price adapter over Yahoo Finance's public, keyless chart endpoint.

    The endpoint is unofficial and rejects requests without a browser-like
    ``User-Agent`` (HTTP 429), so the client passed in must set one.
    """

    def __init__(self, client: httpx.AsyncClient) -> None:
        """Hold the shared HTTP client; the caller owns its lifecycle.

        Args:
            client: ``httpx.AsyncClient`` used for every request.
        """
        self._client = client

    async def fetch_daily_prices(self, symbol: str, start: date | None = None) -> list[PricePoint]:
        """Fetch and parse daily closes for ``symbol``.

        With ``start=None`` the full available history is requested
        (``range=max``); otherwise ``period1`` is ``start`` at 00:00 UTC and
        ``period2`` is now.

        Args:
            symbol: Yahoo symbol including the exchange suffix (e.g. ``EUNL.DE``).
            start: First day to include, or ``None`` for the full history.

        Returns:
            Points in ascending date order, one per date.

        Raises:
            PriceProviderError: On a transport error, a non-2xx response, a non-JSON
                body, or a payload with ``chart.error`` / no ``result`` (unknown symbol).
        """
        params: dict[str, str | int] = {"interval": "1d"}
        if start is None:
            params["range"] = "max"
        else:
            params["period1"] = int(datetime.combine(start, time.min, tzinfo=UTC).timestamp())
            params["period2"] = int(datetime.now(UTC).timestamp())

        try:
            response = await self._client.get(
                f"{YAHOO_CHART_URL}{quote(symbol, safe='')}", params=params
            )
            response.raise_for_status()
            payload = response.json()
        except httpx.HTTPStatusError as exc:
            raise PriceProviderError(
                f"Provider returned HTTP {exc.response.status_code} for {symbol}"
            ) from exc
        except httpx.HTTPError as exc:
            raise PriceProviderError(f"Could not reach the price provider for {symbol}") from exc
        except ValueError as exc:
            raise PriceProviderError(f"Provider returned a non-JSON response for {symbol}") from exc

        return _parse_chart(payload)


def _parse_chart(payload: dict) -> list[PricePoint]:
    """Turn a Yahoo chart payload into daily price points.

    Each bar timestamp is converted to its exchange-local date via
    ``meta.gmtoffset``; bars whose close is ``null`` (market holidays) are
    skipped, and if two bars land on the same local date the later one wins.
    The currency string is passed through unchanged (no upper-casing — Yahoo
    reports London pence as ``GBp``). A payload with no bars yields ``[]``.

    Args:
        payload: Decoded JSON body of a chart request.

    Returns:
        Points in ascending date order, at most one per date.

    Raises:
        PriceProviderError: If ``chart.error`` is set, ``result`` is empty, or the
            payload lacks the fields needed to read prices.
    """
    chart = payload.get("chart") if isinstance(payload, dict) else None
    if not isinstance(chart, dict):
        raise PriceProviderError("Unexpected provider response shape")
    error = chart.get("error")
    if error:
        raise PriceProviderError(error.get("description") or "Provider reported an error")
    results = chart.get("result")
    if not results:
        raise PriceProviderError("Provider returned no data")

    result = results[0]
    timestamps = result.get("timestamp") or []
    if not timestamps:
        return []

    meta = result.get("meta") or {}
    currency = meta.get("currency")
    if not currency:
        raise PriceProviderError("Provider response has no currency")
    offset = meta.get("gmtoffset") or 0
    quotes = (result.get("indicators") or {}).get("quote") or [{}]
    closes = quotes[0].get("close") or []

    by_date: dict[date, PricePoint] = {}
    for timestamp, close in zip(timestamps, closes):
        if close is None:
            continue
        day = datetime.fromtimestamp(timestamp + offset, tz=UTC).date()
        by_date[day] = PricePoint(day, Decimal(str(round(close, 6))), currency)
    return [by_date[day] for day in sorted(by_date)]
