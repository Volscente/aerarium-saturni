from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import Date, DateTime, Enum, Numeric, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


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
