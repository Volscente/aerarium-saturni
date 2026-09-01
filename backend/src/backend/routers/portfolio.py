from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import Select, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db import get_session
from backend.models import Etf, EtfHolding, EtfPriceHistory, Transaction
from backend.schemas.portfolio import (
    HoldingContribution,
    HoldingExposureResponse,
    HoldingsExposureResponse,
    PortfolioOverviewResponse,
    PortfolioRowResponse,
)

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


def _build_holdings_exposure_query() -> Select:
    """Construct the multi-phase SQLAlchemy SELECT for look-through stock exposure.

    Phase 1 sums net stock quantity per ISIN across all owners/brokers (unlike
    ``_build_portfolio_query``, which groups by ``(owner, broker_platform, isin)``,
    this groups by ``isin`` alone to get a portfolio-wide, combined position).
    Phase 1b joins ``Etf`` and a correlated latest-price subquery on
    ``etf_price_history`` to derive each ETF's current value; ETFs with no price
    record yield a ``NULL`` ``etf_current_value``, mirroring ``_build_portfolio_query``'s
    ``latest_price`` handling. Phase 2 joins each ETF's most recent ``EtfHolding``
    snapshot (``MAX(snapshot_date)`` per ``etf_id``, using the existing
    ``ix_etf_holdings_etf_id_snapshot_date`` index) — by this point ``stock_isin`` is
    already populated for most rows by ``resolve_stock_isin_aliases``'s upload-time
    resolution, so ``EtfHolding.stock_isin``/``stock_ticker`` here are trustworthy
    identity fields, not best-effort guesses. Grouping stock identities and
    computing weighted contributions is left to the caller (see
    ``get_holdings_exposure``), since it requires deduplicating repeated per-ETF
    values across holding rows.

    Returns:
        A SQLAlchemy ``Select`` yielding rows of ``(etf_id, etf_ticker, etf_name,
        etf_current_value, stock_isin, stock_ticker, stock_name,
        weight_percentage, snapshot_date)``. ``etf_current_value`` is ``NULL`` when
        the ETF has no price record.
    """
    latest_price_subq = (
        select(EtfPriceHistory.price)
        .where(EtfPriceHistory.etf_id == Etf.id)
        .order_by(EtfPriceHistory.timestamp.desc())
        .limit(1)
        .correlate(Etf)
        .scalar_subquery()
    )

    net_holdings_cte = (
        select(
            Transaction.isin,
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
        .group_by(Transaction.isin)
        .cte("net_holdings")
    )

    etf_value_cte = (
        select(
            Etf.id.label("etf_id"),
            Etf.ticker.label("etf_ticker"),
            Etf.name.label("etf_name"),
            (net_holdings_cte.c.net_quantity * latest_price_subq).label("etf_current_value"),
        )
        .select_from(net_holdings_cte)
        .join(Etf, Etf.isin == net_holdings_cte.c.isin)
        .where(net_holdings_cte.c.net_quantity > 0)
        .cte("etf_value")
    )

    latest_snapshot_subq = (
        select(func.max(EtfHolding.snapshot_date))
        .where(EtfHolding.etf_id == etf_value_cte.c.etf_id)
        .correlate(etf_value_cte)
        .scalar_subquery()
    )

    return (
        select(
            etf_value_cte.c.etf_id,
            etf_value_cte.c.etf_ticker,
            etf_value_cte.c.etf_name,
            etf_value_cte.c.etf_current_value,
            EtfHolding.stock_isin,
            EtfHolding.stock_ticker,
            EtfHolding.stock_name,
            EtfHolding.weight_percentage,
            EtfHolding.snapshot_date,
        )
        .select_from(etf_value_cte)
        .join(EtfHolding, EtfHolding.etf_id == etf_value_cte.c.etf_id)
        .where(EtfHolding.snapshot_date == latest_snapshot_subq)
    )


@router.get("/holdings/exposure", response_model=HoldingsExposureResponse)
async def get_holdings_exposure(
    session: AsyncSession = Depends(get_session),
) -> HoldingsExposureResponse:
    """Aggregate look-through single-stock exposure across all owned ETFs.

    Executes ``_build_holdings_exposure_query()``, then in Python: deduplicates
    rows by ``etf_id`` to compute each ETF's share of ``total_portfolio_value``
    (ETFs with a ``NULL`` current value are excluded from both the numerator and
    denominator and reported in ``skipped_etfs`` rather than failing the
    request); multiplies each holding's ``weight_percentage`` by its owning
    ETF's portfolio weight; and groups the results by
    ``COALESCE(stock_isin, stock_ticker)``, summing contributions per stock and
    building the nested ``HoldingContribution`` list per group. Results are
    ordered by ``total_weight_percentage`` descending.

    Missing-price handling is a settled decision (not an open question): a
    priceless ETF is skipped rather than nulling the whole response.

    Args:
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        A ``HoldingsExposureResponse`` with one ``HoldingExposureResponse`` per
        distinct stock identity found across all owned ETFs' latest holdings
        snapshots, plus the tickers of any ETFs excluded for lacking a price
        record. Returns ``holdings=[]`` when no ETFs are held.

    Raises:
        sqlalchemy.exc.OperationalError: If the database is unreachable at query time.
    """
    stmt = _build_holdings_exposure_query()
    result = await session.execute(stmt)
    rows = result.all()

    etf_values: dict[UUID, tuple[str, Decimal | None]] = {}
    skipped_etfs: set[str] = set()
    for row in rows:
        if row.etf_id not in etf_values:
            etf_values[row.etf_id] = (row.etf_ticker, row.etf_current_value)
            if row.etf_current_value is None:
                skipped_etfs.add(row.etf_ticker)

    total_portfolio_value = sum(
        (value for _, value in etf_values.values() if value is not None),
        Decimal("0"),
    )

    groups: dict[str, dict] = {}
    for row in rows:
        _, etf_current_value = etf_values[row.etf_id]
        if etf_current_value is None or total_portfolio_value == 0:
            continue
        etf_portfolio_weight = etf_current_value / total_portfolio_value
        contribution_weight = etf_portfolio_weight * row.weight_percentage

        key = row.stock_isin or row.stock_ticker
        if key not in groups:
            groups[key] = {
                "stock_isin": row.stock_isin,
                "stock_ticker": row.stock_ticker,
                "stock_name": row.stock_name,
                "total_weight_percentage": Decimal("0"),
                "contributions": [],
            }
        groups[key]["total_weight_percentage"] += contribution_weight
        groups[key]["contributions"].append(
            HoldingContribution(
                etf_ticker=row.etf_ticker,
                etf_name=row.etf_name,
                etf_portfolio_weight_percentage=etf_portfolio_weight * 100,
                stock_weight_in_etf_percentage=row.weight_percentage,
                contribution_weight_percentage=contribution_weight,
                snapshot_date=row.snapshot_date,
            )
        )

    holdings = sorted(
        (
            HoldingExposureResponse(
                stock_isin=group["stock_isin"],
                stock_ticker=group["stock_ticker"],
                stock_name=group["stock_name"],
                total_weight_percentage=group["total_weight_percentage"],
                contributions=group["contributions"],
            )
            for group in groups.values()
        ),
        key=lambda holding: holding.total_weight_percentage,
        reverse=True,
    )

    return HoldingsExposureResponse(holdings=holdings, skipped_etfs=sorted(skipped_etfs))
