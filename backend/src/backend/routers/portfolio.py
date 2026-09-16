from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import Select, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db import get_session
from backend.models import Etf, EtfHolding, EtfPriceHistory, Transaction
from backend.schemas.portfolio import (
    BucketEtfContribution,
    CountryExposureResponse,
    HoldingContribution,
    HoldingExposureResponse,
    HoldingsExposureResponse,
    HoldingsGeographyResponse,
    HoldingsSectorsResponse,
    PortfolioOverviewResponse,
    PortfolioRowResponse,
    RiskAlert,
    SectorExposureResponse,
)

router = APIRouter()

CONCENTRATION_THRESHOLD_PCT = Decimal("10")
FRESHNESS_THRESHOLD_DAYS = 60


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
        etf_current_value, stock_isin, stock_ticker, stock_name, stock_country,
        stock_sector, weight_percentage, snapshot_date)``. ``etf_current_value``
        is ``NULL`` when the ETF has no price record.
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
            EtfHolding.stock_country,
            EtfHolding.stock_sector,
            EtfHolding.weight_percentage,
            EtfHolding.snapshot_date,
        )
        .select_from(etf_value_cte)
        .join(EtfHolding, EtfHolding.etf_id == etf_value_cte.c.etf_id)
        .where(EtfHolding.snapshot_date == latest_snapshot_subq)
    )


def _build_concentration_alerts(holdings: list[HoldingExposureResponse]) -> list[RiskAlert]:
    """Builds one RiskAlert per holding whose total_weight_percentage exceeds CONCENTRATION_THRESHOLD_PCT.

    Strict `>`, matching the same convention already established across the
    frontend's badge/bar-chart/treemap warning coloring (a holding sitting
    exactly at the threshold is at the limit, not yet over it).

    Args:
        holdings: The already-built, already-sorted holdings list.

    Returns:
        Zero or more RiskAlert objects with rule='concentration_risk'.
    """
    alerts = []
    for holding in holdings:
        if holding.total_weight_percentage > CONCENTRATION_THRESHOLD_PCT:
            label = holding.stock_ticker or holding.stock_isin or holding.stock_name
            alerts.append(
                RiskAlert(
                    rule="concentration_risk",
                    message=f"{label} is {holding.total_weight_percentage:.2f}% of the combined portfolio, "
                    f"above the {CONCENTRATION_THRESHOLD_PCT}% concentration limit.",
                    stock_isin=holding.stock_isin,
                    stock_ticker=holding.stock_ticker,
                    stock_name=holding.stock_name,
                    total_weight_percentage=holding.total_weight_percentage,
                )
            )
    return alerts


def _build_freshness_alerts(
    etf_values: dict[UUID, tuple[str, str, Decimal | None, date | None]],
) -> list[RiskAlert]:
    """Builds one RiskAlert per distinct owned ETF whose latest snapshot_date is more than FRESHNESS_THRESHOLD_DAYS days before today.

    An ETF with no holdings snapshot at all (snapshot_date is None — not
    structurally possible today since every row in etf_values comes from a
    join against EtfHolding, but defensively skipped rather than raising)
    produces no alert; a priceless ETF (already excluded from etf_values'
    weighting elsewhere) can still be evaluated for freshness independently,
    since freshness is about the holdings snapshot, not the price record.

    Args:
        etf_values: The existing per-etf_id dedup dict, extended with each
            ETF's name and snapshot_date.

    Returns:
        Zero or more RiskAlert objects with rule='data_freshness_risk'.
    """
    alerts = []
    today = date.today()
    for etf_ticker, etf_name, _, snapshot_date in etf_values.values():
        if snapshot_date is None:
            continue
        days_stale = (today - snapshot_date).days
        if days_stale > FRESHNESS_THRESHOLD_DAYS:
            alerts.append(
                RiskAlert(
                    rule="data_freshness_risk",
                    message=f"{etf_ticker}'s holdings snapshot is {days_stale} days old "
                    f"(last updated {snapshot_date.isoformat()}), above the {FRESHNESS_THRESHOLD_DAYS}-day freshness limit.",
                    etf_ticker=etf_ticker,
                    etf_name=etf_name,
                    snapshot_date=snapshot_date,
                    days_stale=days_stale,
                )
            )
    return alerts


async def _aggregate_stock_groups(
    session: AsyncSession,
) -> tuple[dict[str, dict], dict[UUID, tuple], set[str]]:
    """Run _build_holdings_exposure_query once and group its rows by stock identity.

    Shared by get_holdings_exposure, get_holdings_geography, and
    get_holdings_sectors so the query (and the etf-value dedup/weighting
    logic built on top of it) runs exactly once per request regardless of
    which endpoint is called -- geography/sectors bucket the SAME per-stock
    groups dict in a second, small Python-side pass rather than re-querying
    or re-deriving stock identity.

    A stock's stock_country/stock_sector is taken from the first row seen
    for that stock's key and treated as invariant across every ETF that
    holds it -- i.e. if two ETFs disagree (e.g. a stale country/sector on
    one issuer's export), whichever ETF's row is encountered first for that
    stock silently wins. This mirrors the "first row wins" convention
    already used for stock_name in this same groups dict.

    Args:
        session: Async SQLAlchemy session.

    Returns:
        A 3-tuple:
        - groups: dict keyed by COALESCE(stock_isin, stock_ticker), each
          value a dict with stock_isin, stock_ticker, stock_name,
          stock_country, stock_sector, total_weight_percentage, and
          contributions (a list[HoldingContribution]).
        - etf_values: dict keyed by etf_id, each value
          (etf_ticker, etf_name, etf_current_value, snapshot_date).
        - skipped_etfs: tickers of ETFs excluded for lacking a price record.
    """
    stmt = _build_holdings_exposure_query()
    result = await session.execute(stmt)
    rows = result.all()

    etf_values: dict[UUID, tuple[str, str, Decimal | None, date | None]] = {}
    skipped_etfs: set[str] = set()
    for row in rows:
        if row.etf_id not in etf_values:
            etf_values[row.etf_id] = (row.etf_ticker, row.etf_name, row.etf_current_value, row.snapshot_date)
            if row.etf_current_value is None:
                skipped_etfs.add(row.etf_ticker)

    total_portfolio_value = sum(
        (value for _, _, value, _ in etf_values.values() if value is not None),
        Decimal("0"),
    )

    groups: dict[str, dict] = {}
    for row in rows:
        _, _, etf_current_value, _ = etf_values[row.etf_id]
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
                "stock_country": row.stock_country,
                "stock_sector": row.stock_sector,
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

    return groups, etf_values, skipped_etfs


def _bucket_etf_contributions(groups: dict[str, dict], bucket_field: str) -> list[dict]:
    """Group per-stock groups' per-ETF contributions into per-ETF totals within each geography/sector bucket.

    Each per-stock group (from _aggregate_stock_groups) already carries a
    per-ETF ``contributions`` list (one HoldingContribution per ETF holding
    that stock). This re-groups those contributions by (bucket, etf_ticker)
    -- summing an ETF's contribution across every stock it holds within the
    same bucket -- so an ETF holding multiple stocks in the same country/
    sector appears as ONE combined row under that bucket, not one row per
    stock. This mirrors what the Holdings tab already shows (a per-ETF
    breakdown), just re-aggregated by bucket instead of by stock. No
    additional query; this is a second, small Python-side pass over
    _aggregate_stock_groups' already-computed groups.

    Args:
        groups: The per-stock groups dict from _aggregate_stock_groups.
        bucket_field: Either "stock_country" or "stock_sector".

    Returns:
        List of dicts with keys "bucket" (the country code / sector name,
        or None), "total_weight_percentage", and "contributions" (a list of
        BucketEtfContribution, sorted DESC by contribution_weight_percentage)
        -- the whole list sorted DESC by total_weight_percentage.
    """
    buckets: dict[str | None, dict] = {}
    for group in groups.values():
        bucket_key = group[bucket_field]
        bucket = buckets.setdefault(
            bucket_key,
            {"bucket": bucket_key, "total_weight_percentage": Decimal("0"), "etf_totals": {}},
        )
        bucket["total_weight_percentage"] += group["total_weight_percentage"]
        for contribution in group["contributions"]:
            etf_total = bucket["etf_totals"].setdefault(
                contribution.etf_ticker,
                {
                    "etf_ticker": contribution.etf_ticker,
                    "etf_name": contribution.etf_name,
                    "etf_portfolio_weight_percentage": contribution.etf_portfolio_weight_percentage,
                    "bucket_weight_in_etf_percentage": 0.0,
                    "contribution_weight_percentage": 0.0,
                    "snapshot_date": contribution.snapshot_date,
                },
            )
            etf_total["bucket_weight_in_etf_percentage"] += contribution.stock_weight_in_etf_percentage
            etf_total["contribution_weight_percentage"] += contribution.contribution_weight_percentage

    result = []
    for bucket in buckets.values():
        contributions = sorted(
            (BucketEtfContribution(**etf_total) for etf_total in bucket["etf_totals"].values()),
            key=lambda c: c.contribution_weight_percentage,
            reverse=True,
        )
        result.append(
            {
                "bucket": bucket["bucket"],
                "total_weight_percentage": bucket["total_weight_percentage"],
                "contributions": contributions,
            }
        )
    return sorted(result, key=lambda b: b["total_weight_percentage"], reverse=True)


@router.get("/holdings/exposure", response_model=HoldingsExposureResponse)
async def get_holdings_exposure(
    session: AsyncSession = Depends(get_session),
) -> HoldingsExposureResponse:
    """Aggregate look-through single-stock exposure across all owned ETFs.

    Delegates the query execution and per-stock aggregation to
    _aggregate_stock_groups (shared with get_holdings_geography and
    get_holdings_sectors); builds the response exactly as before --
    stock_country/stock_sector captured by the helper stay internal to the
    aggregation step and are not exposed on HoldingExposureResponse.

    Missing-price handling is a settled decision (not an open question): a
    priceless ETF is skipped rather than nulling the whole response.

    Also derives ``alerts``: a Concentration Risk ``RiskAlert`` for every
    holding whose ``total_weight_percentage`` exceeds ``CONCENTRATION_THRESHOLD_PCT``
    (``_build_concentration_alerts``), and a Data Freshness Risk ``RiskAlert``
    for every distinct owned ETF whose latest holdings ``snapshot_date`` is
    more than ``FRESHNESS_THRESHOLD_DAYS`` days old (``_build_freshness_alerts``).
    Both reuse data already computed above — no additional query.

    Args:
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        A ``HoldingsExposureResponse`` with one ``HoldingExposureResponse`` per
        distinct stock identity found across all owned ETFs' latest holdings
        snapshots, the tickers of any ETFs excluded for lacking a price
        record, and any active Concentration Risk / Data Freshness Risk
        alerts. Returns ``holdings=[]``/``alerts=[]`` when no ETFs are held.

    Raises:
        sqlalchemy.exc.OperationalError: If the database is unreachable at query time.
    """
    groups, etf_values, skipped_etfs = await _aggregate_stock_groups(session)

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

    alerts = _build_concentration_alerts(holdings) + _build_freshness_alerts(etf_values)

    return HoldingsExposureResponse(holdings=holdings, skipped_etfs=sorted(skipped_etfs), alerts=alerts)


@router.get("/holdings/geography", response_model=HoldingsGeographyResponse)
async def get_holdings_geography(
    session: AsyncSession = Depends(get_session),
) -> HoldingsGeographyResponse:
    """Aggregate look-through single-stock exposure into per-country buckets.

    Reuses _aggregate_stock_groups (the same per-stock aggregation powering
    GET /holdings/exposure) and re-groups each stock's per-ETF contributions
    by stock_country via _bucket_etf_contributions -- no additional query.
    Each country's ``contributions`` is a per-ETF breakdown (an ETF holding
    several stocks in that country collapses into one row), mirroring the
    Holdings tab's own per-ETF breakdown rather than listing individual
    stocks. A stock whose stock_country is None (unmapped country name, or
    a CSV upload that never carried the column) is bucketed under
    country_code=None; the frontend renders that bucket as "Unknown".

    Args:
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        A HoldingsGeographyResponse with one CountryExposureResponse per
        distinct stock_country value found across all owned ETFs' latest
        holdings snapshots (ordered by total_weight_percentage DESC), plus
        the tickers of any ETFs excluded for lacking a price record.
    """
    groups, _, skipped_etfs = await _aggregate_stock_groups(session)
    buckets = _bucket_etf_contributions(groups, "stock_country")

    countries = [
        CountryExposureResponse(
            country_code=bucket["bucket"],
            total_weight_percentage=bucket["total_weight_percentage"],
            contributions=bucket["contributions"],
        )
        for bucket in buckets
    ]

    return HoldingsGeographyResponse(countries=countries, skipped_etfs=sorted(skipped_etfs))


@router.get("/holdings/sectors", response_model=HoldingsSectorsResponse)
async def get_holdings_sectors(
    session: AsyncSession = Depends(get_session),
) -> HoldingsSectorsResponse:
    """Aggregate look-through single-stock exposure into per-sector buckets.

    Identical shape to get_holdings_geography, bucketed by stock_sector (the
    canonical GICS-like name normalised by _normalize_sector at holdings
    upload time) instead of stock_country -- each sector's ``contributions``
    is a per-ETF breakdown, not a per-stock one (see _bucket_etf_contributions).
    A stock whose stock_sector is None (unmapped raw sector label, or a CSV
    upload with no sector column) is bucketed under sector=None; the
    frontend renders that bucket as "Unknown".

    Args:
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        A HoldingsSectorsResponse with one SectorExposureResponse per
        distinct stock_sector value found across all owned ETFs' latest
        holdings snapshots (ordered by total_weight_percentage DESC), plus
        the tickers of any ETFs excluded for lacking a price record.
    """
    groups, _, skipped_etfs = await _aggregate_stock_groups(session)
    buckets = _bucket_etf_contributions(groups, "stock_sector")

    sectors = [
        SectorExposureResponse(
            sector=bucket["bucket"],
            total_weight_percentage=bucket["total_weight_percentage"],
            contributions=bucket["contributions"],
        )
        for bucket in buckets
    ]

    return HoldingsSectorsResponse(sectors=sectors, skipped_etfs=sorted(skipped_etfs))
