"""Add etfs.price_symbol and a unique daily index on etf_price_history.

Revision ID: 006
Revises: 005
Create Date: 2026-10-26

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_DAY_EXPR = "((timestamp AT TIME ZONE 'UTC')::date)"


def upgrade() -> None:
    """Add price_symbol, collapse same-day price rows, and enforce one price per ETF per day.

    ``etfs.price_symbol`` is the nullable provider symbol used for automated
    price retrieval; ``NULL`` means "fall back to ``ticker``" (resolved at
    retrieval time, not stored). ``String(30)`` is wider than ``ticker``
    because provider symbols carry an exchange suffix.

    Existing duplicates are removed before the unique index is created,
    keeping the row with the greatest ``timestamp`` per ``(etf_id, UTC day)``
    (ties broken by ``id`` for determinism); otherwise index creation would
    fail. The day is taken in UTC so the boundary is independent of the
    session timezone, and the expression is immutable, which PostgreSQL
    requires for an index expression.
    """
    op.add_column("etfs", sa.Column("price_symbol", sa.String(30), nullable=True))
    op.execute(
        sa.text(
            f"""
            DELETE FROM etf_price_history
            WHERE id IN (
                SELECT id FROM (
                    SELECT id,
                           ROW_NUMBER() OVER (
                               PARTITION BY etf_id, {_DAY_EXPR}
                               ORDER BY timestamp DESC, id DESC
                           ) AS rn
                    FROM etf_price_history
                ) ranked
                WHERE rn > 1
            )
            """
        )
    )
    op.create_index(
        "uq_etf_price_history_etf_id_day",
        "etf_price_history",
        ["etf_id", sa.text(_DAY_EXPR)],
        unique=True,
    )


def downgrade() -> None:
    """Drop the unique daily index and price_symbol.

    Schema-only: price rows deleted by the upgrade's same-day collapse are not
    restored.
    """
    op.drop_index("uq_etf_price_history_etf_id_day", table_name="etf_price_history")
    op.drop_column("etfs", "price_symbol")
