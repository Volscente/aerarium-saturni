from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TransactionCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    owner: str
    broker_platform: Literal["ibkr", "n26"]
    transaction_type: Literal["buy", "sell", "dividend", "split"]
    asset_class: Literal["stock", "bond", "etf"]
    ticker: str | None = None
    isin: str | None = None
    quantity: Decimal = Field(gt=0)
    price: Decimal | None = Field(default=None, gt=0)
    currency: str = Field(min_length=3, max_length=3)
    fees: Decimal = Field(default=Decimal("0"), ge=0)
    transaction_date: date

    @field_validator("isin")
    @classmethod
    def validate_isin(cls, v: str | None) -> str | None:
        """Validate ISIN is exactly 12 alphanumeric characters when provided.

        Accepts ``None`` (ISIN is optional). When a value is supplied, enforces
        ISO 6166 format: exactly 12 uppercase alphanumeric characters. Whitespace
        is stripped before validation via ``str_strip_whitespace=True``.

        Args:
            v: Raw ISIN string from the request payload, or ``None``.

        Returns:
            The validated ISIN string, or ``None`` if not provided.

        Raises:
            ValueError: If the value is not exactly 12 alphanumeric characters.
        """
        if v is not None and (len(v) != 12 or not v.isalnum()):
            raise ValueError("ISIN must be exactly 12 alphanumeric characters")
        return v


class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    owner: str
    broker_platform: str
    transaction_type: str
    asset_class: str
    ticker: str | None
    isin: str | None
    quantity: Decimal
    price: Decimal | None
    currency: str
    fees: Decimal
    transaction_date: date
    created_at: datetime
