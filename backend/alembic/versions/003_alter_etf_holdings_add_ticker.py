"""Alter etf_holdings: make stock_isin nullable, add stock_ticker column.

Revision ID: 003
Revises: 002
Create Date: 2026-07-24

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Make stock_isin nullable and add stock_ticker to etf_holdings.

    iShares and Vanguard issuer CSVs provide a Ticker rather than an ISIN for
    each constituent row. The schema must accommodate both identifier types while
    requiring at least one per row (enforced at the application layer by
    EtfHoldingRow.validate_identifier_present).
    """
    op.alter_column(
        "etf_holdings",
        "stock_isin",
        existing_type=sa.String(12),
        nullable=True,
    )
    op.add_column(
        "etf_holdings",
        sa.Column("stock_ticker", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    """Reverse: drop stock_ticker, restore stock_isin NOT NULL constraint.

    Note: downgrade will fail if any row has stock_isin = NULL. Rows with a
    null ISIN must be deleted or back-filled before running this downgrade.
    """
    op.drop_column("etf_holdings", "stock_ticker")
    op.alter_column(
        "etf_holdings",
        "stock_isin",
        existing_type=sa.String(12),
        nullable=False,
    )
