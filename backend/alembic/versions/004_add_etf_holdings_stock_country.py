"""Add stock_country to etf_holdings.

Revision ID: 004
Revises: 003
Create Date: 2026-08-22

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add a nullable stock_country column to etf_holdings.

    Stores the holding's ISO 3166-1 alpha-2 country code (from Amundi's own
    ISIN prefix, or translated from iShares'/Vanguard's country columns at
    conversion time). Used to disambiguate stock identity when backfilling
    stock_isin from a resolved ticker, so two unrelated companies that
    coincidentally share a ticker on different exchanges are not merged.
    """
    op.add_column(
        "etf_holdings",
        sa.Column("stock_country", sa.String(2), nullable=True),
    )


def downgrade() -> None:
    """Reverse: drop stock_country."""
    op.drop_column("etf_holdings", "stock_country")
