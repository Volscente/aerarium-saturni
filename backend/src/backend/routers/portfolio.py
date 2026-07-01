from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import Select, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db import get_session
from backend.models import Etf, EtfPriceHistory, Transaction
from backend.schemas.portfolio import PortfolioOverviewResponse, PortfolioRowResponse

router = APIRouter()


def _build_portfolio_query() -> Select:
    """Construct the two-phase SQLAlchemy SELECT for portfolio aggregation.

    Builds a CTE for Phase 1 (net holdings per ISIN group) and the outer
    SELECT for Phase 2 (current-value join and group-level aggregation).
    Uses a correlated scalar subquery on ``etf_price_history`` ordered by
    ``timestamp DESC`` to retrieve the latest price per ETF without a
    LATERAL JOIN (which SQLAlchemy renders portably via ``.correlate()``).
    Returns a composable ``Select`` object; the caller awaits execution.

    Returns:
        A SQLAlchemy ``Select`` statement yielding rows of
        ``(owner, broker_platform, isin, total_invested, net_quantity, latest_price)``.
        ``latest_price`` is ``NULL`` in SQL when no price record exists for the ISIN.
    """
    latest_price_subq = (
        select(EtfPriceHistory.price)
        .where(EtfPriceHistory.etf_id == Etf.id)
        .order_by(EtfPriceHistory.timestamp.desc())
        .limit(1)
        .correlate(Etf)
        .scalar_subquery()
    )

    holdings_cte = (
        select(
            Transaction.owner,
            Transaction.broker_platform,
            Transaction.isin,
            func.sum(
                case(
                    (Transaction.transaction_type == "buy", func.coalesce(Transaction.quantity * Transaction.price, 0)),
                    else_=0,
                )
                - case(
                    (Transaction.transaction_type == "sell", func.coalesce(Transaction.quantity * Transaction.price, 0)),
                    else_=0,
                )
            ).label("total_invested"),
            func.sum(
                case(
                    (Transaction.transaction_type == "buy", func.coalesce(Transaction.quantity, 0)),
                    else_=0,
                )
                - case(
                    (Transaction.transaction_type == "sell", func.coalesce(Transaction.quantity, 0)),
                    else_=0,
                )
            ).label("net_quantity"),
        )
        .where(Transaction.transaction_type.in_(["buy", "sell"]))
        .where(Transaction.isin.is_not(None))
        .group_by(Transaction.owner, Transaction.broker_platform, Transaction.isin)
        .cte("holdings")
    )

    return (
        select(
            holdings_cte.c.owner,
            holdings_cte.c.broker_platform,
            holdings_cte.c.isin,
            holdings_cte.c.total_invested,
            holdings_cte.c.net_quantity,
            latest_price_subq.label("latest_price"),
        )
        .select_from(holdings_cte)
        .outerjoin(Etf, Etf.isin == holdings_cte.c.isin)
    )


def _to_row_response(
    owner: str,
    broker_platform: str,
    total_invested: Decimal,
    current_value: Decimal | None,
) -> PortfolioRowResponse:
    """Derive a ``PortfolioRowResponse`` from raw query output.

    Computes ``performance_abs`` and ``performance_pct`` in Python so that
    ``None`` propagation is explicit and auditable. ``total_invested`` is
    guaranteed non-None at this point (the query filters out rows with no
    buy/sell transactions).

    Args:
        owner: Portfolio owner string.
        broker_platform: Broker platform identifier.
        total_invested: Sum of ``quantity * price`` for buy minus sell transactions.
        current_value: Sum of ``net_quantity * latest_price`` per ISIN in the group,
            or ``None`` if any ISIN lacks a price record.

    Returns:
        A ``PortfolioRowResponse`` with all five fields populated; performance fields
        are ``None`` when ``current_value`` is ``None``.
    """
    performance_abs: Decimal | None = None
    performance_pct: Decimal | None = None
    if current_value is not None:
        performance_abs = current_value - total_invested
        if total_invested != 0:
            performance_pct = performance_abs / total_invested * Decimal("100")
    return PortfolioRowResponse(
        owner=owner,
        broker_platform=broker_platform,
        total_invested=total_invested,
        current_value=current_value,
        performance_abs=performance_abs,
        performance_pct=performance_pct,
    )


@router.get("/overview", response_model=PortfolioOverviewResponse)
async def get_portfolio_overview(
    session: AsyncSession = Depends(get_session),
) -> PortfolioOverviewResponse:
    """Aggregate transaction data into per-(owner, broker_platform) portfolio rows.

    Executes a two-phase SQLAlchemy async query:
    - Phase 1 CTE: groups ``transactions`` by ``(owner, broker_platform, isin)``
      filtering to ``buy`` and ``sell`` types, producing ``net_quantity`` and
      ``total_invested`` per ISIN group.
    - Phase 2: left-joins the holdings CTE to ``etfs`` on ``isin``, then uses a
      correlated subquery on ``etf_price_history`` to find the latest price per ETF.
    Performance fields (``performance_abs``, ``performance_pct``) and the
    ``(owner, broker_platform)`` grouping are computed in Python after the database
    round-trip so that ``None`` propagation from missing prices is explicit: if any
    ISIN in a group has no price record, ``current_value`` is ``None`` for the whole group.

    Args:
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        A ``PortfolioOverviewResponse`` containing one ``PortfolioRowResponse`` per
        ``(owner, broker_platform)`` pair found in ``transactions``. Returns an empty
        ``rows`` list when there are no qualifying transactions.

    Raises:
        sqlalchemy.exc.OperationalError: If the database is unreachable at query time.
    """
    stmt = _build_portfolio_query()
    result = await session.execute(stmt)
    rows = result.all()

    groups: dict[tuple[str, str], dict] = {}
    for row in rows:
        key = (row.owner, row.broker_platform)
        if key not in groups:
            groups[key] = {
                "total_invested": Decimal("0"),
                "computed_value": Decimal("0"),
                "any_missing_price": False,
            }
        groups[key]["total_invested"] += row.total_invested
        if row.latest_price is None:
            groups[key]["any_missing_price"] = True
        else:
            groups[key]["computed_value"] += row.net_quantity * row.latest_price

    return PortfolioOverviewResponse(
        rows=[
            _to_row_response(
                owner=key[0],
                broker_platform=key[1],
                total_invested=group["total_invested"],
                current_value=None if group["any_missing_price"] else group["computed_value"],
            )
            for key, group in groups.items()
        ]
    )
