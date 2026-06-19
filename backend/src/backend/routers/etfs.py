import csv
import io
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from pydantic import ValidationError
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db import get_session
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


@router.post("/{id}/holdings/upload", status_code=200)
async def upload_holdings(
    id: UUID,
    file: UploadFile,
    session: AsyncSession = Depends(get_session),
) -> dict[str, int]:
    """Replace all holdings for an ETF atomically from a CSV upload.

    Reads the uploaded CSV, parses each row into an ``EtfHoldingRow`` model,
    then within a single session transaction deletes all existing
    ``etf_holdings`` rows for the given ETF and bulk-inserts the new rows.
    Any parsing failure or constraint error rolls back the entire operation.

    Args:
        id: UUID of the parent ETF; raises 404 if not found in ``etfs`` table.
        file: Uploaded CSV; required columns match ``EtfHoldingRow`` field names.
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        ``{"inserted_rows": n}`` — count of successfully inserted holding rows.

    Raises:
        HTTPException 404: If no ETF with the given ``id`` exists.
        HTTPException 422: If any CSV row fails ``EtfHoldingRow`` validation;
            body includes ``{"row": n, "field": "...", "error": "..."}``.
    """
    result = await session.execute(select(Etf).where(Etf.id == id))
    etf = result.scalar_one_or_none()
    if etf is None:
        raise HTTPException(status_code=404, detail="ETF not found")

    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode("utf-8")))
    holdings: list[EtfHoldingRow] = []
    for i, row_dict in enumerate(reader, start=1):
        try:
            holding = EtfHoldingRow(**row_dict)
        except ValidationError as exc:
            raise HTTPException(
                status_code=422,
                detail={"row": i, "errors": exc.errors()},
            )
        holdings.append(holding)

    await session.execute(delete(EtfHolding).where(EtfHolding.etf_id == id))
    session.add_all([EtfHolding(etf_id=id, **h.model_dump()) for h in holdings])
    await session.commit()

    return {"inserted_rows": len(holdings)}
