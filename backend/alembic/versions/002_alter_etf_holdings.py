"""Alter etf_holdings table to RFC schema: replace old columns with stock_isin, stock_name, weight_percentage, snapshot_date.

Revision ID: 002
Revises: 001
Create Date: 2026-07-24

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Drop and recreate etf_holdings with the RFC-specified schema.

    The original schema created by 001 (company_name, weight_pct, sector,
    region, market_value, shares) is replaced with a minimal issuer-agnostic
    layout: stock_isin, stock_name, weight_percentage, snapshot_date.

    A composite B-Tree index on (etf_id, snapshot_date DESC) replaces the
    unindexed original table, supporting the primary read pattern of retrieving
    all current holdings for a given ETF ordered by most-recent snapshot.

    No data migration is needed — no real data existed in this table.
    """
    op.drop_table("etf_holdings")

    op.create_table(
        "etf_holdings",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("etf_id", sa.UUID(), nullable=False),
        sa.Column("stock_isin", sa.String(12), nullable=False),
        sa.Column("stock_name", sa.String(200), nullable=False),
        sa.Column("weight_percentage", sa.Numeric(8, 4), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.ForeignKeyConstraint(["etf_id"], ["etfs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    # DESC direction requires sa.text() — SQLAlchemy Index does not carry
    # per-column sort order natively for B-Tree indexes.
    op.create_index(
        "ix_etf_holdings_etf_id_snapshot_date",
        "etf_holdings",
        ["etf_id", sa.text("snapshot_date DESC")],
    )


def downgrade() -> None:
    """Restore the etf_holdings layout created by migration 001.

    Drops the 002 schema and recreates the original table structure so that
    alembic downgrade -1 correctly reverts to the 001 state.
    """
    op.drop_index("ix_etf_holdings_etf_id_snapshot_date", table_name="etf_holdings")
    op.drop_table("etf_holdings")

    op.create_table(
        "etf_holdings",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("etf_id", sa.UUID(), nullable=False),
        sa.Column("company_name", sa.String(200), nullable=False),
        sa.Column("weight_pct", sa.Numeric(6, 4), nullable=False),
        sa.Column("sector", sa.String(100), nullable=False),
        sa.Column("region", sa.String(100), nullable=False),
        sa.Column("market_value", sa.Numeric(18, 2), nullable=True),
        sa.Column("shares", sa.Numeric(18, 6), nullable=True),
        sa.ForeignKeyConstraint(["etf_id"], ["etfs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
