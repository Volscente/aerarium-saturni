"""Add stock_sector to etf_holdings.

Revision ID: 005
Revises: 004
Create Date: 2026-09-16

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add a nullable stock_sector column to etf_holdings.

    Stores the holding's canonical GICS-like sector bucket (e.g.
    "Information Technology", "Financials"), normalised at conversion time
    from each issuer's own raw sector label via _normalize_sector — iShares
    and Amundi both publish German labels (different phrasing for the same
    concepts), Vanguard publishes English. String(50) matches the length
    already used for same-shape fields on Etf (asset_class,
    dividend_policy). No index, mirroring stock_country, which is
    filtered/grouped in Python rather than SQL.
    """
    op.add_column(
        "etf_holdings",
        sa.Column("stock_sector", sa.String(50), nullable=True),
    )


def downgrade() -> None:
    """Reverse: drop stock_sector."""
    op.drop_column("etf_holdings", "stock_sector")
