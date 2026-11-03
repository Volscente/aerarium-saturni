from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Protocol


@dataclass(frozen=True)
class PricePoint:
    """One daily closing price for a symbol, as reported by a market-data provider."""

    date: date
    close: Decimal
    currency: str


class PriceProviderError(Exception):
    """Raised for any provider failure: HTTP error, unknown symbol, malformed payload."""


class PriceProvider(Protocol):
    """Source of daily closing prices; the seam that keeps the refresh endpoint provider-agnostic."""

    async def fetch_daily_prices(self, symbol: str, start: date | None = None) -> list[PricePoint]:
        """Return daily closes for ``symbol`` from ``start`` (inclusive) to now.

        Args:
            symbol: Provider-specific instrument symbol (e.g. ``VWCE.DE``).
            start: First day to include; ``None`` requests the full available history.

        Returns:
            Points in ascending date order, at most one per date, with null closes dropped.

        Raises:
            PriceProviderError: If the provider cannot return usable data for ``symbol``.
        """
        ...
