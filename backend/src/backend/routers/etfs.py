import csv
import io
from pathlib import Path
from uuid import UUID

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile
from pydantic import ValidationError
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.converters.holdings_xlsx import convert_holdings_xlsx, resolve_stock_isin_aliases
from backend.db import AsyncSessionLocal, get_session
from backend.models import Etf, EtfHolding, EtfPriceHistory
from backend.schemas.etfs import (
    EtfCreate,
    EtfHoldingRow,
    EtfPriceCreate,
    EtfPriceResponse,
    EtfResponse,
    EtfUpdate,
)

router = APIRouter()


@router.post("", response_model=EtfResponse, status_code=201)
async def create_etf(
    body: EtfCreate,
    session: AsyncSession = Depends(get_session),
) -> EtfResponse:
    """Persist a new ETF and return the created record.

    Args:
        body: Validated ETF creation payload from the request body.
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        The persisted ETF record, including ``id`` and ``created_at``.

    Raises:
        sqlalchemy.exc.IntegrityError: If ``ticker`` or ``isin`` violates the UNIQUE constraint.
    """
    row = Etf(**body.model_dump())
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
    """
    result = await session.execute(select(Etf).where(Etf.id == id))
    etf = result.scalar_one_or_none()
    if etf is None:
        raise HTTPException(status_code=404, detail="ETF not found")
    row = EtfPriceHistory(etf_id=id, **body.model_dump())
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return EtfPriceResponse.model_validate(row)


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


@router.post("/{id}/holdings/upload", status_code=200)
async def upload_holdings(
    id: UUID,
    file: UploadFile,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> dict[str, int]:
    """Replace all holdings for an ETF atomically from a CSV or issuer XLSX upload.

    Reads the uploaded file, parses each row into an ``EtfHoldingRow`` model,
    then within a single session transaction deletes all existing
    ``etf_holdings`` rows for the given ETF and bulk-inserts the new rows.
    Any parsing failure or constraint error rolls back the entire operation.

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

    await session.execute(delete(EtfHolding).where(EtfHolding.etf_id == id))
    session.add_all(
        [
            EtfHolding(etf_id=id, stock_country=row_dict.get("stock_country"), **h.model_dump())
            for h, row_dict in holdings
        ]
    )
    await session.commit()

    background_tasks.add_task(_reconcile_stock_isin_aliases_in_background)

    return {"inserted_rows": len(holdings)}
