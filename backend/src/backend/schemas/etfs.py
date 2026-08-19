from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class EtfCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    ticker: str = Field(min_length=1, max_length=20)
    isin: str
    name: str = Field(min_length=1, max_length=200)
    issuer: str = Field(min_length=1, max_length=100)
    asset_class: str = Field(min_length=1, max_length=50)
    tracked_index: str = Field(min_length=1, max_length=200)
    ter: Decimal = Field(gt=0)
    domicile: str = Field(min_length=1, max_length=50)
    currency_hedged: bool = Field(default=False)
    fiscal_year_end: str = Field(min_length=1, max_length=10)
    german_tax_classification: str = Field(min_length=1, max_length=50)
    replication_strategy: str = Field(min_length=1, max_length=50)
    dividend_policy: str = Field(min_length=1, max_length=50)
    dividend_frequency: str | None = Field(default=None, max_length=20)
    fund_size: Decimal | None = Field(default=None, gt=0)
    monthly_volume: Decimal | None = Field(default=None, gt=0)
    volatility_1y: Decimal | None = Field(default=None, ge=0)
    volatility_3y: Decimal | None = Field(default=None, ge=0)
    holdings_overview: str | None = Field(default=None)
    geographical_distribution: dict[str, float] = Field(description="Country code → weight pct")
    sector_distribution: dict[str, float] = Field(description="Sector name → weight pct")
    bond_maturities: dict[str, float] | None = Field(default=None)
    bond_credit_scores: dict[str, float] | None = Field(default=None)

    @field_validator("isin")
    @classmethod
    def validate_isin(cls, v: str) -> str:
        """Validate ISIN is exactly 12 alphanumeric characters.

        Args:
            v: Raw ISIN string from the request payload.

        Returns:
            The validated ISIN string.

        Raises:
            ValueError: If the value is not exactly 12 alphanumeric characters.
        """
        if len(v) != 12 or not v.isalnum():
            raise ValueError("ISIN must be exactly 12 alphanumeric characters")
        return v

    @model_validator(mode="after")
    def validate_asset_class_fields(self) -> "EtfCreate":
        """Enforce that bond distribution maps are present when asset_class is 'Bonds'.

        Mirrors ``TransactionCreate.validate_type_specific_fields`` — runs after all
        field-level validators so ``asset_class`` is reliably a string.

        Args:
            self: Fully constructed model instance after field-level validation.

        Returns:
            The validated model instance.

        Raises:
            ValueError: If ``asset_class == 'Bonds'`` and either ``bond_maturities``
                or ``bond_credit_scores`` is ``None``.
        """
        if self.asset_class.lower() == "bonds":
            if self.bond_maturities is None or self.bond_credit_scores is None:
                raise ValueError(
                    "bond_maturities and bond_credit_scores are required when asset_class is Bonds"
                )
        return self


class EtfUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    ticker: str | None = Field(default=None, min_length=1, max_length=20)
    isin: str | None = Field(default=None)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    issuer: str | None = Field(default=None, min_length=1, max_length=100)
    asset_class: str | None = Field(default=None)
    tracked_index: str | None = Field(default=None)
    ter: Decimal | None = Field(default=None, gt=0)
    domicile: str | None = Field(default=None)
    currency_hedged: bool | None = Field(default=None)
    fiscal_year_end: str | None = Field(default=None)
    german_tax_classification: str | None = Field(default=None)
    replication_strategy: str | None = Field(default=None)
    dividend_policy: str | None = Field(default=None)
    dividend_frequency: str | None = Field(default=None)
    fund_size: Decimal | None = Field(default=None, gt=0)
    monthly_volume: Decimal | None = Field(default=None, gt=0)
    volatility_1y: Decimal | None = Field(default=None, ge=0)
    volatility_3y: Decimal | None = Field(default=None, ge=0)
    holdings_overview: str | None = Field(default=None)
    geographical_distribution: dict[str, float] | None = Field(default=None)
    sector_distribution: dict[str, float] | None = Field(default=None)
    bond_maturities: dict[str, float] | None = Field(default=None)
    bond_credit_scores: dict[str, float] | None = Field(default=None)


class EtfResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    ticker: str
    isin: str
    name: str
    issuer: str
    asset_class: str
    tracked_index: str
    ter: Decimal
    domicile: str
    currency_hedged: bool
    fiscal_year_end: str
    german_tax_classification: str
    replication_strategy: str
    dividend_policy: str
    dividend_frequency: str | None
    fund_size: Decimal | None
    monthly_volume: Decimal | None
    volatility_1y: Decimal | None
    volatility_3y: Decimal | None
    holdings_overview: str | None
    geographical_distribution: dict[str, float]
    sector_distribution: dict[str, float]
    bond_maturities: dict[str, float] | None
    bond_credit_scores: dict[str, float] | None
    created_at: datetime


class EtfPriceCreate(BaseModel):
    price: Decimal = Field(gt=0)
    currency: str = Field(min_length=3, max_length=3)
    timestamp: datetime


class EtfPriceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    etf_id: UUID
    price: Decimal
    currency: str
    timestamp: datetime


class EtfHoldingRow(BaseModel):
    """Pydantic v2 model for validating a single CSV row from an issuer holdings export.

    Used only at the CSV parse boundary (upload handler); not exposed as an API response
    model. Rejects malformed rows before any database write.

    Exactly one of ``stock_isin`` or ``stock_ticker`` must be provided per row.
    iShares and Vanguard CSVs supply a Ticker; Amundi CSVs supply an ISIN.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    stock_isin: str | None = Field(default=None)
    stock_ticker: str | None = Field(default=None, min_length=1, max_length=20)
    stock_name: str = Field(min_length=1, max_length=200)
    weight_percentage: Decimal = Field(gt=0)
    snapshot_date: date

    @field_validator("stock_isin", mode="before")
    @classmethod
    def validate_isin(cls, v: object) -> str | None:
        """Normalise and validate an ISIN, accepting None and empty string as absent.

        Runs before type coercion (``mode="before"``) so that blank cells from
        issuer CSVs that include the column but leave it empty are treated as
        absent rather than triggering a format error.

        Args:
            v: Raw value from the CSV row; may be ``None``, an empty string, or
                a string ISIN candidate.

        Returns:
            The validated, uppercased ISIN string, or ``None`` when the value is
            absent or blank.

        Raises:
            ValueError: If the value is non-empty but not exactly 12 alphanumeric
                characters after uppercasing.
        """
        if not v:
            return None
        v = str(v).upper()
        if len(v) != 12 or not v.isalnum():
            raise ValueError("ISIN must be exactly 12 alphanumeric characters")
        return v

    @model_validator(mode="after")
    def validate_identifier_present(self) -> "EtfHoldingRow":
        """Enforce that at least one of stock_isin or stock_ticker is present.

        Args:
            self: Fully constructed model instance after field-level validation.

        Returns:
            The validated model instance.

        Raises:
            ValueError: If both ``stock_isin`` and ``stock_ticker`` are ``None``.
        """
        if self.stock_isin is None and self.stock_ticker is None:
            raise ValueError("Either stock_isin or stock_ticker must be provided")
        return self
