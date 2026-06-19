"""Create etfs, etf_holdings, and etf_price_history tables.

Revision ID: 001
Revises:
Create Date: 2026-06-19

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create etfs, etf_holdings, and etf_price_history tables with all constraints and indexes.

    Creates tables in dependency order (parent before children) so foreign key references
    resolve at DDL time. Indexes are added immediately after each table so the migration
    is fully self-contained and reversible.

    Tables created:
        etfs: Parent record with UUID PK, UNIQUE ticker/isin, four JSONB distribution
              columns, and scalar ETF metadata. GIN indexes on geographical_distribution
              and sector_distribution for containment queries.
        etf_holdings: Constituent positions linked to etfs via etf_id FK (ON DELETE CASCADE).
        etf_price_history: Price snapshots linked to etfs via etf_id FK (ON DELETE CASCADE)
                           with a composite B-Tree index on (etf_id, timestamp DESC) for
                           O(1) latest-price lookups.
    """
    op.create_table(
        "etfs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("ticker", sa.String(20), nullable=False),
        sa.Column("isin", sa.String(12), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("issuer", sa.String(100), nullable=False),
        sa.Column("asset_class", sa.String(50), nullable=False),
        sa.Column("tracked_index", sa.String(200), nullable=False),
        sa.Column("ter", sa.Numeric(6, 4), nullable=False),
        sa.Column("domicile", sa.String(50), nullable=False),
        sa.Column("currency_hedged", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("fiscal_year_end", sa.String(10), nullable=False),
        sa.Column("german_tax_classification", sa.String(50), nullable=False),
        sa.Column("replication_strategy", sa.String(50), nullable=False),
        sa.Column("fund_size", sa.Numeric(18, 2), nullable=True),
        sa.Column("monthly_volume", sa.Numeric(18, 2), nullable=True),
        sa.Column("volatility_1y", sa.Numeric(6, 4), nullable=True),
        sa.Column("volatility_3y", sa.Numeric(6, 4), nullable=True),
        sa.Column("dividend_policy", sa.String(50), nullable=False),
        sa.Column("dividend_frequency", sa.String(20), nullable=True),
        sa.Column("holdings_overview", sa.Text(), nullable=True),
        sa.Column("geographical_distribution", JSONB(), nullable=False),
        sa.Column("sector_distribution", JSONB(), nullable=False),
        sa.Column("bond_maturities", JSONB(), nullable=True),
        sa.Column("bond_credit_scores", JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("ticker"),
        sa.UniqueConstraint("isin"),
    )
    op.create_index(
        "ix_etfs_geographical_distribution",
        "etfs",
        ["geographical_distribution"],
        postgresql_using="gin",
    )
    op.create_index(
        "ix_etfs_sector_distribution",
        "etfs",
        ["sector_distribution"],
        postgresql_using="gin",
    )

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

    op.create_table(
        "etf_price_history",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("etf_id", sa.UUID(), nullable=False),
        sa.Column("price", sa.Numeric(18, 6), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["etf_id"], ["etfs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    # DESC direction on timestamp requires sa.text() — SQLAlchemy Index does not
    # carry per-column sort order natively for B-Tree indexes.
    op.create_index(
        "ix_etf_price_history_etf_id_timestamp",
        "etf_price_history",
        ["etf_id", sa.text("timestamp DESC")],
    )


def downgrade() -> None:
    """Drop etf_price_history, etf_holdings, and etfs in reverse dependency order.

    Drops child tables before the parent to avoid FK constraint violations at DDL time.
    Indexes on each table are dropped implicitly when their table is dropped.
    The transactions table (managed by create_all, not Alembic) is not touched.
    """
    op.drop_table("etf_price_history")
    op.drop_table("etf_holdings")
    op.drop_index("ix_etfs_sector_distribution", table_name="etfs")
    op.drop_index("ix_etfs_geographical_distribution", table_name="etfs")
    op.drop_table("etfs")
