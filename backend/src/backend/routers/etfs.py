import asyncio
import csv
import io
from collections.abc import AsyncGenerator
from datetime import UTC, datetime, time
from decimal import Decimal
from pathlib import Path
from uuid import UUID

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile
from pydantic import ValidationError
from sqlalchemy import delete, func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.converters.holdings_xlsx import convert_holdings_xlsx, resolve_stock_isin_aliases
from backend.db import AsyncSessionLocal, get_session
from backend.models import Etf, EtfHolding, EtfPriceHistory
from backend.providers.base import PricePoint, PriceProvider, PriceProviderError
from backend.providers.yahoo import YahooPriceProvider
from backend.schemas.etfs import (
    EtfCreate,
    EtfHoldingRow,
    EtfPriceCreate,
    EtfPriceRefreshRequest,
    EtfPriceRefreshResult,
    EtfPriceResponse,
    EtfPriceUpdate,
    EtfResponse,
    EtfUpdate,
)

router = APIRouter()

MAX_CONCURRENT_FETCHES = 3
EXPECTED_PRICE_CURRENCY = "EUR"
_UPSERT_CHUNK_SIZE = 1000
_PROVIDER_TIMEOUT_SECONDS = 15.0
_PROVIDER_USER_AGENT = "Mozilla/5.0 (compatible; AerariumSaturni/1.0)"
_DAILY_CONFLICT_EXPRESSION = text("((timestamp AT TIME ZONE 'UTC')::date)")


@router.post("", response_model=EtfResponse, status_code=201)
async def create_etf(
    body: EtfCreate,
    session: AsyncSession = Depends(get_session),
) -> EtfResponse:
    """Persist a new ETF and return the created record.

    ``geographical_distribution``/``sector_distribution`` are not part of
    ``EtfCreate`` (they are derived, not user-entered) — a new ETF always
    starts with both as ``{}`` until its first holdings upload populates
    them via ``upload_holdings``'s ``_aggregate_fund_distribution``.

    Args:
        body: Validated ETF creation payload from the request body.
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        The persisted ETF record, including ``id`` and ``created_at``.

    Raises:
        sqlalchemy.exc.IntegrityError: If ``ticker`` or ``isin`` violates the UNIQUE constraint.
    """
    row = Etf(geographical_distribution={}, sector_distribution={}, **body.model_dump())
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return EtfResponse.model_validate(row)


@router.get("", response_model=list[EtfResponse])
async def list_etfs(
    ticker: str | None = Query(default=None),
    asset_class: str | None = Query(default=None),
    issuer: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> list[EtfResponse]:
    """Return all ETFs, optionally filtered by ticker, asset class, or issuer.

    Builds a SELECT query against the ``etfs`` table and applies
    ILIKE filters for any non-None query parameters before fetching.
    Mirrors ``list_transactions`` in ``routers/transactions.py``.

    Args:
        ticker: Optional ticker prefix; applied as ``Etf.ticker.ilike(f"{v}%")``.
        asset_class: Optional exact match on ``Etf.asset_class``.
        issuer: Optional issuer prefix; applied as ``Etf.issuer.ilike(f"{v}%")``.
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        List of ``EtfResponse`` models; empty list when no rows match.

    Raises:
        Nothing — returns an empty list when no rows match.
    """
    stmt = select(Etf)
    if ticker is not None:
        stmt = stmt.where(Etf.ticker.ilike(f"{ticker}%"))
    if asset_class is not None:
        stmt = stmt.where(Etf.asset_class == asset_class)
    if issuer is not None:
        stmt = stmt.where(Etf.issuer.ilike(f"{issuer}%"))
    result = await session.execute(stmt)
    rows = result.scalars().all()
    return [EtfResponse.model_validate(row) for row in rows]


@router.put("/{id}", response_model=EtfResponse)
async def update_etf(
    id: UUID,
    body: EtfUpdate,
    session: AsyncSession = Depends(get_session),
) -> EtfResponse:
    """Update scalar fields or JSONB distribution blocks for an existing ETF.

    Args:
        id: UUID of the ETF to update.
        body: Partial update payload; only non-None fields are applied.
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        The updated ETF record.

    Raises:
        HTTPException 404: If no ETF with the given ``id`` exists.
    """
    result = await session.execute(select(Etf).where(Etf.id == id))
    etf = result.scalar_one_or_none()
    if etf is None:
        raise HTTPException(status_code=404, detail="ETF not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(etf, field, value)
    await session.commit()
    await session.refresh(etf)
    return EtfResponse.model_validate(etf)


@router.delete("/{id}", status_code=204, response_model=None)
async def delete_etf(
    id: UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Delete an ETF and cascade to its holdings and price history.

    Args:
        id: UUID of the ETF to delete.
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        None — HTTP 204 No Content on success.

    Raises:
        HTTPException 404: If no ETF with the given ``id`` exists.
    """
    result = await session.execute(select(Etf).where(Etf.id == id))
    etf = result.scalar_one_or_none()
    if etf is None:
        raise HTTPException(status_code=404, detail="ETF not found")
    await session.delete(etf)
    await session.commit()


@router.get("/{id}/price-history", response_model=list[EtfPriceResponse])
async def get_price_history(
    id: UUID,
    session: AsyncSession = Depends(get_session),
) -> list[EtfPriceResponse]:
    """Return all price snapshots for an ETF ordered by timestamp descending.

    Args:
        id: UUID of the parent ETF; raises 404 if not found in ``etfs`` table.
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        List of ``EtfPriceResponse`` models ordered newest-first; empty list
        when no snapshots have been recorded yet.

    Raises:
        HTTPException 404: If no ETF with the given ``id`` exists.
    """
    result = await session.execute(select(Etf).where(Etf.id == id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="ETF not found")
    stmt = (
        select(EtfPriceHistory)
        .where(EtfPriceHistory.etf_id == id)
        .order_by(EtfPriceHistory.timestamp.desc())
    )
    rows = (await session.execute(stmt)).scalars().all()
    return [EtfPriceResponse.model_validate(row) for row in rows]


@router.post("/{id}/price", response_model=EtfPriceResponse, status_code=201)
async def create_price(
    id: UUID,
    body: EtfPriceCreate,
    session: AsyncSession = Depends(get_session),
) -> EtfPriceResponse:
    """Append a manual price snapshot to the ETF's price history.

    Args:
        id: UUID of the parent ETF; raises 404 if not found in ``etfs`` table.
        body: Validated price snapshot payload.
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        The persisted price history record, including ``id``.

    Raises:
        HTTPException 404: If no ETF with the given ``id`` exists.
        HTTPException 409: If the ETF already has a price for that UTC day
            (``uq_etf_price_history_etf_id_day``). The ETF's existence is checked
            first, so any ``IntegrityError`` at commit is that unique index.
    """
    result = await session.execute(select(Etf).where(Etf.id == id))
    etf = result.scalar_one_or_none()
    if etf is None:
        raise HTTPException(status_code=404, detail="ETF not found")
    row = EtfPriceHistory(etf_id=id, **body.model_dump())
    session.add(row)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail={"error": "A price already exists for this ETF on that day"},
        )
    await session.refresh(row)
    return EtfPriceResponse.model_validate(row)


@router.put("/{id}/price/{price_id}", response_model=EtfPriceResponse)
async def update_price(
    id: UUID,
    price_id: UUID,
    body: EtfPriceUpdate,
    session: AsyncSession = Depends(get_session),
) -> EtfPriceResponse:
    """Apply a partial update to an existing price snapshot and return the result.

    Fetches the ``EtfPriceHistory`` row scoped to both the parent ETF and its
    own id, so a ``price_id`` belonging to a different ETF 404s rather than
    silently updating the wrong ETF's price history. Applies only the
    non-``None`` fields from ``body`` via a ``setattr`` loop. Mirrors
    ``update_transaction`` in ``routers/transactions.py``.

    Args:
        id: UUID of the parent ETF.
        price_id: UUID primary key of the price snapshot to update.
        body: Partial update payload; only non-None fields are written.
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        The updated ``EtfPriceResponse``.

    Raises:
        HTTPException 404: If no price snapshot with the given ``price_id``
            exists for the given ETF ``id``.
        HTTPException 409: If the update moves the snapshot onto a UTC day that
            already has a price for this ETF (``uq_etf_price_history_etf_id_day``).
    """
    result = await session.execute(
        select(EtfPriceHistory).where(
            EtfPriceHistory.id == price_id, EtfPriceHistory.etf_id == id
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Price snapshot not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(row, field, value)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail={"error": "A price already exists for this ETF on that day"},
        )
    await session.refresh(row)
    return EtfPriceResponse.model_validate(row)


@router.delete("/{id}/price/{price_id}", status_code=204, response_model=None)
async def delete_price(
    id: UUID,
    price_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Permanently delete a price snapshot.

    Scoped to both the parent ETF and its own id (see ``update_price``).
    Mirrors ``delete_transaction`` in ``routers/transactions.py``.

    Args:
        id: UUID of the parent ETF.
        price_id: UUID primary key of the price snapshot to delete.
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        None — HTTP 204 No Content.

    Raises:
        HTTPException 404: If no price snapshot with the given ``price_id``
            exists for the given ETF ``id``.
    """
    result = await session.execute(
        select(EtfPriceHistory).where(
            EtfPriceHistory.id == price_id, EtfPriceHistory.etf_id == id
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Price snapshot not found")
    await session.delete(row)
    await session.commit()


def _aggregate_fund_distribution(
    holdings: list[tuple[EtfHoldingRow, dict]], key: str
) -> dict[str, float]:
    """Aggregates a fund's own holdings weight_percentage by stock_country or stock_sector.

    Unlike the portfolio-wide look-through aggregation in routers/portfolio.py,
    this sums weight_percentage directly across a single ETF's own holdings
    (no portfolio-weighting) -- the fund-level distribution stored on
    Etf.geographical_distribution/sector_distribution. A holding whose
    stock_country/stock_sector could not be derived (or a CSV upload that
    never carried the column) is bucketed under "Unknown" rather than a raw
    None key, since JSONB/JSON object keys must be strings.

    Args:
        holdings: The (EtfHoldingRow, raw row dict) tuples about to be
            inserted for this ETF.
        key: Either "stock_country" or "stock_sector".

    Returns:
        Dict mapping country code / canonical sector name (or "Unknown") to
        the summed weight_percentage, as plain floats. Empty dict when
        holdings is empty.
    """
    totals: dict[str, Decimal] = {}
    for holding, row_dict in holdings:
        bucket = row_dict.get(key) or "Unknown"
        totals[bucket] = totals.get(bucket, Decimal("0")) + holding.weight_percentage
    return {bucket: float(total) for bucket, total in totals.items()}


async def _reconcile_stock_isin_aliases_in_background() -> None:
    """Run resolve_stock_isin_aliases decoupled from any single upload request.

    Scheduled as a FastAPI BackgroundTask so a slow or rate-limited OpenFIGI
    reconciliation (a couple of minutes at full holdings volume, since
    OpenFIGI's unauthenticated tier is paced to ~25 requests/minute) never
    blocks the upload response or ties up the request connection — a
    connection held open that long is fragile (a container restart, reverse
    proxy timeout, or client-side timeout during that window silently drops
    the whole reconciliation, as opposed to just delaying it).

    Uses its own session and http client rather than the upload request's,
    since the request-scoped session may already be closed by the time a
    background task runs. Any failure (OpenFIGI unreachable, a transient DB
    issue) is swallowed — the holdings are already committed by the caller,
    and reconciliation is simply retried on the next holdings upload of any
    ETF.
    """
    try:
        async with AsyncSessionLocal() as session, httpx.AsyncClient() as http_client:
            await resolve_stock_isin_aliases(session, http_client)
    except Exception:
        pass


async def get_price_provider() -> AsyncGenerator[PriceProvider, None]:
    """Yield the price provider used by ``refresh_prices``.

    Wraps ``YahooPriceProvider`` around a per-request ``httpx.AsyncClient`` with
    a timeout and a browser-like ``User-Agent`` (Yahoo answers 429 without one),
    and closes the client once the request finishes. Exposed as a dependency so
    tests can swap in a stub provider.

    Yields:
        A ``PriceProvider`` ready to fetch daily prices.
    """
    async with httpx.AsyncClient(
        timeout=_PROVIDER_TIMEOUT_SECONDS, headers={"User-Agent": _PROVIDER_USER_AGENT}
    ) as client:
        yield YahooPriceProvider(client)


async def _upsert_prices(session: AsyncSession, etf_id: UUID, points: list[PricePoint]) -> int:
    """Insert daily prices for an ETF, overwriting any row already stored for the same UTC day.

    Targets the unique expression index ``uq_etf_price_history_etf_id_day``
    (``etf_id``, UTC day) with ``ON CONFLICT DO UPDATE``, so repeated or
    overlapping refreshes never duplicate rows and provider data wins over a
    manual snapshot for the same day. Each point is stored at 00:00:00 UTC of
    its date. Rows are inserted in chunks to stay well below the driver's
    bind-parameter limit. The caller commits.

    Args:
        session: Async SQLAlchemy session.
        etf_id: UUID of the ETF the prices belong to.
        points: Daily prices, at most one per date.

    Returns:
        Number of rows written (inserted or updated); 0 when ``points`` is empty.
    """
    for i in range(0, len(points), _UPSERT_CHUNK_SIZE):
        chunk = points[i : i + _UPSERT_CHUNK_SIZE]
        stmt = pg_insert(EtfPriceHistory).values(
            [
                {
                    "etf_id": etf_id,
                    "price": point.close,
                    "currency": point.currency,
                    "timestamp": datetime.combine(point.date, time.min, tzinfo=UTC),
                }
                for point in chunk
            ]
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[EtfPriceHistory.etf_id, _DAILY_CONFLICT_EXPRESSION],
            set_={
                "price": stmt.excluded.price,
                "currency": stmt.excluded.currency,
                "timestamp": stmt.excluded.timestamp,
            },
        )
        await session.execute(stmt)
    return len(points)


@router.post("/prices/refresh", response_model=list[EtfPriceRefreshResult])
async def refresh_prices(
    body: EtfPriceRefreshRequest | None = None,
    session: AsyncSession = Depends(get_session),
    provider: PriceProvider = Depends(get_price_provider),
) -> list[EtfPriceRefreshResult]:
    """Fetch prices from the external provider and upsert them for all or selected ETFs.

    Provider calls run concurrently, bounded by ``MAX_CONCURRENT_FETCHES``;
    database writes then run one ETF at a time (a single ``AsyncSession`` cannot
    be shared across concurrent tasks), each in its own commit, so one failing
    ETF is rolled back and reported without affecting the others. The provider
    symbol is ``price_symbol`` or, when unset, ``ticker``. The first run for an
    ETF requests the full available history; later runs start at the UTC date
    of its latest stored price (inclusive, so a partial last day is
    overwritten). Prices are expected in ``EXPECTED_PRICE_CURRENCY``; an ETF
    whose provider data is in any other currency is reported as failed and
    nothing is written for it.

    Args:
        body: Optional selection; ``etf_ids`` omitted or empty means all ETFs.
            Duplicate ids are collapsed.
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.
        provider: Price source injected by ``Depends(get_price_provider)``.

    Returns:
        One ``EtfPriceRefreshResult`` per ETF, ordered by ticker. Always HTTP 200
        once the ids resolve; per-ETF failures are reported in the results.

    Raises:
        HTTPException 404: If any requested ``etf_ids`` entry does not exist.
    """
    requested_ids = list(dict.fromkeys(body.etf_ids)) if body and body.etf_ids else None
    stmt = select(Etf).order_by(Etf.ticker)
    if requested_ids:
        stmt = stmt.where(Etf.id.in_(requested_ids))
    etfs = (await session.execute(stmt)).scalars().all()
    if requested_ids:
        missing = set(requested_ids) - {etf.id for etf in etfs}
        if missing:
            raise HTTPException(
                status_code=404,
                detail=f"ETF not found: {', '.join(str(m) for m in sorted(missing, key=str))}",
            )
    if not etfs:
        return []

    # Plain tuples: a rollback in the write loop expires ORM attributes, which
    # cannot be lazily reloaded on an AsyncSession.
    targets = [(etf.id, etf.ticker, etf.price_symbol or etf.ticker) for etf in etfs]

    latest_rows = await session.execute(
        select(EtfPriceHistory.etf_id, func.max(EtfPriceHistory.timestamp))
        .where(EtfPriceHistory.etf_id.in_([etf_id for etf_id, _, _ in targets]))
        .group_by(EtfPriceHistory.etf_id)
    )
    latest_by_etf = dict(latest_rows.all())

    semaphore = asyncio.Semaphore(MAX_CONCURRENT_FETCHES)

    async def fetch(etf_id: UUID, symbol: str) -> list[PricePoint] | PriceProviderError:
        latest = latest_by_etf.get(etf_id)
        start = latest.astimezone(UTC).date() if latest else None
        async with semaphore:
            try:
                return await provider.fetch_daily_prices(symbol, start)
            except PriceProviderError as exc:
                return exc

    outcomes = await asyncio.gather(*(fetch(etf_id, symbol) for etf_id, _, symbol in targets))

    results: list[EtfPriceRefreshResult] = []
    for (etf_id, ticker, _), outcome in zip(targets, outcomes):
        if isinstance(outcome, PriceProviderError):
            results.append(_refresh_failure(etf_id, ticker, str(outcome)))
            continue
        wrong_currencies = sorted({p.currency for p in outcome if p.currency != EXPECTED_PRICE_CURRENCY})
        if wrong_currencies:
            results.append(
                _refresh_failure(
                    etf_id,
                    ticker,
                    f"Provider returned prices in {', '.join(wrong_currencies)}; "
                    f"expected {EXPECTED_PRICE_CURRENCY}",
                )
            )
            continue
        try:
            rows_written = await _upsert_prices(session, etf_id, outcome)
            await session.commit()
        except SQLAlchemyError:
            await session.rollback()
            results.append(_refresh_failure(etf_id, ticker, "Database error while storing prices"))
            continue
        results.append(
            EtfPriceRefreshResult(
                etf_id=etf_id, ticker=ticker, status="updated", rows_written=rows_written
            )
        )
    return results


def _refresh_failure(etf_id: UUID, ticker: str, error: str) -> EtfPriceRefreshResult:
    return EtfPriceRefreshResult(
        etf_id=etf_id, ticker=ticker, status="failed", rows_written=0, error=error
    )



@router.post("/{id}/holdings/upload", status_code=200)
async def upload_holdings(
    id: UUID,
    file: UploadFile,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> dict[str, int]:
    """Replace all holdings for an ETF atomically from a CSV or issuer XLSX upload.

    Reads the uploaded file, parses each row into an ``EtfHoldingRow`` model,
    then within a single session transaction updates the ETF's own
    ``geographical_distribution``/``sector_distribution`` (via
    ``_aggregate_fund_distribution`` — summed directly across this upload's
    rows, not portfolio-weighted) and deletes all existing ``etf_holdings``
    rows for the given ETF before bulk-inserting the new rows. Any parsing
    failure or constraint error rolls back the entire operation, including
    the distribution update.

    A ``.xlsx`` file is first run through ``convert_holdings_xlsx``, which
    picks an issuer-specific parser from the uploaded filename's ticker (e.g.
    ``EUNL.xlsx`` → iShares) — issuer exports are structurally too different
    (language, layout, available identifier) to parse with one generic reader.
    Any other filename is read as CSV, unchanged from the original contract.

    After the new holdings are committed, ``_reconcile_stock_isin_aliases_in_background``
    is scheduled as a ``BackgroundTask`` — it runs *after* this response is
    sent, so the client gets ``inserted_rows`` back immediately rather than
    waiting on OpenFIGI reconciliation (which can take a couple of minutes at
    full holdings volume). See its own docstring for why it uses an
    independent session rather than this request's.

    Args:
        id: UUID of the parent ETF; raises 404 if not found in ``etfs`` table.
        file: Uploaded CSV or issuer XLSX; CSV columns (or, for XLSX, the
            converter's output) must match ``EtfHoldingRow`` field names.
        background_tasks: FastAPI-injected; used to schedule the ISIN
            reconciliation after the response is sent.
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        ``{"inserted_rows": n}`` — count of successfully inserted holding rows.

    Raises:
        HTTPException 404: If no ETF with the given ``id`` exists.
        HTTPException 422: If the XLSX filename's ticker isn't a recognised
            issuer, or any row fails ``EtfHoldingRow`` validation; body is
            ``{"error": "..."}`` or ``{"row": n, "errors": [...]}`` respectively.
    """
    result = await session.execute(select(Etf).where(Etf.id == id))
    etf = result.scalar_one_or_none()
    if etf is None:
        raise HTTPException(status_code=404, detail="ETF not found")

    content = await file.read()
    filename = file.filename or ""
    if filename.lower().endswith(".xlsx"):
        try:
            row_dicts = convert_holdings_xlsx(io.BytesIO(content), ticker=Path(filename).stem)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail={"error": str(exc)})
    else:
        row_dicts = list(csv.DictReader(io.StringIO(content.decode("utf-8"))))

    holdings: list[tuple[EtfHoldingRow, dict]] = []
    for i, row_dict in enumerate(row_dicts, start=1):
        try:
            holding = EtfHoldingRow(**row_dict)
        except ValidationError as exc:
            raise HTTPException(
                status_code=422,
                detail={"row": i, "errors": exc.errors()},
            )
        holdings.append((holding, row_dict))

    etf.geographical_distribution = _aggregate_fund_distribution(holdings, "stock_country")
    etf.sector_distribution = _aggregate_fund_distribution(holdings, "stock_sector")

    await session.execute(delete(EtfHolding).where(EtfHolding.etf_id == id))
    session.add_all(
        [
            EtfHolding(
                etf_id=id,
                stock_country=row_dict.get("stock_country"),
                stock_sector=row_dict.get("stock_sector"),
                **h.model_dump(),
            )
            for h, row_dict in holdings
        ]
    )
    await session.commit()

    background_tasks.add_task(_reconcile_stock_isin_aliases_in_background)

    return {"inserted_rows": len(holdings)}
