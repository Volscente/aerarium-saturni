import uuid
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Index, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner: Mapped[str] = mapped_column(String(255), index=True)
    broker_platform: Mapped[str] = mapped_column(
        Enum("ibkr", "n26", name="broker_enum"), index=True
    )
    transaction_type: Mapped[str] = mapped_column(
        Enum("buy", "sell", "dividend", "split", name="transaction_type_enum")
    )
    asset_class: Mapped[str] = mapped_column(
        Enum("stock", "bond", "etf", name="asset_class_enum")
    )
    ticker: Mapped[str | None] = mapped_column(String(20))
    isin: Mapped[str | None] = mapped_column(String(12))
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    price: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    ratio: Mapped[str | None] = mapped_column(String(10))
    currency: Mapped[str] = mapped_column(String(3))
    fees: Mapped[Decimal] = mapped_column(Numeric(14, 4), default=Decimal("0"))
    transaction_date: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Etf(Base):
    __tablename__ = "etfs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    ticker: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    isin: Mapped[str] = mapped_column(String(12), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    issuer: Mapped[str] = mapped_column(String(100), nullable=False)
    asset_class: Mapped[str] = mapped_column(String(50), nullable=False)
    tracked_index: Mapped[str] = mapped_column(String(200), nullable=False)
    ter: Mapped[Decimal] = mapped_column(Numeric(6, 4), nullable=False)
    domicile: Mapped[str] = mapped_column(String(50), nullable=False)
    currency_hedged: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    fiscal_year_end: Mapped[str] = mapped_column(String(10), nullable=False)
    german_tax_classification: Mapped[str] = mapped_column(String(50), nullable=False)
    replication_strategy: Mapped[str] = mapped_column(String(50), nullable=False)
    fund_size: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    monthly_volume: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    volatility_1y: Mapped[Decimal | None] = mapped_column(Numeric(6, 4), nullable=True)
    volatility_3y: Mapped[Decimal | None] = mapped_column(Numeric(6, 4), nullable=True)
    dividend_policy: Mapped[str] = mapped_column(String(50), nullable=False)
    dividend_frequency: Mapped[str | None] = mapped_column(String(20), nullable=True)
    holdings_overview: Mapped[str | None] = mapped_column(Text, nullable=True)
    geographical_distribution: Mapped[dict] = mapped_column(JSONB, nullable=False)
    sector_distribution: Mapped[dict] = mapped_column(JSONB, nullable=False)
    bond_maturities: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    bond_credit_scores: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    holdings: Mapped[list["EtfHolding"]] = relationship(
        back_populates="etf", cascade="all, delete-orphan"
    )
    price_history: Mapped[list["EtfPriceHistory"]] = relationship(
        back_populates="etf", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_etfs_geographical_distribution", "geographical_distribution", postgresql_using="gin"),
        Index("ix_etfs_sector_distribution", "sector_distribution", postgresql_using="gin"),
    )


class EtfHolding(Base):
    __tablename__ = "etf_holdings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    etf_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("etfs.id", ondelete="CASCADE"), nullable=False
    )
    stock_isin: Mapped[str] = mapped_column(String(12), nullable=False)
    stock_name: Mapped[str] = mapped_column(String(200), nullable=False)
    weight_percentage: Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=False)
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)

    etf: Mapped["Etf"] = relationship(back_populates="holdings")

    __table_args__ = (
        Index("ix_etf_holdings_etf_id_snapshot_date", "etf_id", "snapshot_date"),
    )


class EtfPriceHistory(Base):
    __tablename__ = "etf_price_history"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    etf_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("etfs.id", ondelete="CASCADE"), nullable=False
    )
    price: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    etf: Mapped["Etf"] = relationship(back_populates="price_history")

    __table_args__ = (
        Index("ix_etf_price_history_etf_id_timestamp", "etf_id", "timestamp"),
    )
