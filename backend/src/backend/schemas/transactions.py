from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class TransactionCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    owner: str
    broker_platform: Literal["ibkr", "n26"]
    transaction_type: Literal["buy", "sell", "dividend", "split"]
    asset_class: Literal["stock", "bond", "etf"]
    ticker: str | None = None
    isin: str | None = None
    quantity: Decimal | None = Field(default=None, gt=0)
    price: Decimal | None = Field(default=None, gt=0)
    ratio: str | None = None
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

    @model_validator(mode="after")
    def validate_type_specific_fields(self) -> "TransactionCreate":
        """Enforce cross-field rules: quantity required for buy/sell; ratio required for split.

        Args:
            self: The fully-constructed model instance after field-level validation.

        Returns:
            The validated model instance.

        Raises:
            ValueError: If quantity is absent for buy/sell, or ratio is absent for split.
        """
        if self.transaction_type in ("buy", "sell") and self.quantity is None:
            raise ValueError("quantity is required for buy and sell transactions")
        if self.transaction_type == "split" and self.ratio is None:
            raise ValueError("ratio is required for split transactions")
        return self


class TransactionUpdate(BaseModel):
    """Partial update payload for an existing transaction.

    All fields are optional with ``None`` defaults. Only non-``None`` fields are
    applied to the ORM row via the ``setattr`` loop in ``update_transaction``.
    No ``model_validator`` is present — the caller (Server Action) is responsible
    for sending a consistent payload validated by ``TransactionFormSchema``.

    Mirrors ``EtfUpdate`` in ``schemas/etfs.py``.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    owner: str | None = None
    broker_platform: Literal["ibkr", "n26"] | None = None
    transaction_type: Literal["buy", "sell", "dividend", "split"] | None = None
    asset_class: Literal["stock", "bond", "etf"] | None = None
    ticker: str | None = None
    isin: str | None = None
    quantity: Decimal | None = Field(default=None, gt=0)
    price: Decimal | None = Field(default=None, gt=0)
    ratio: str | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    fees: Decimal | None = Field(default=None, ge=0)
    transaction_date: date | None = None


class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    owner: str
    broker_platform: str
    transaction_type: str
    asset_class: str
    ticker: str | None
    isin: str | None
    quantity: Decimal | None
    price: Decimal | None
    currency: str
    fees: Decimal
    ratio: str | None
    transaction_date: date
    created_at: datetime
