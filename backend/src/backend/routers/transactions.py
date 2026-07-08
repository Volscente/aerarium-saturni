from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db import get_session
from backend.models import Transaction
from backend.schemas.transactions import TransactionCreate, TransactionResponse, TransactionUpdate

router = APIRouter()


@router.post("", response_model=TransactionResponse, status_code=201)
async def create_transaction(
    body: TransactionCreate,
    session: AsyncSession = Depends(get_session),
) -> TransactionResponse:
    """Persist a new transaction and return the created record.

    Accepts a validated ``TransactionCreate`` payload, inserts a ``Transaction``
    ORM row into the database via the provided async session, commits, and
    returns the full ``TransactionResponse`` including the server-assigned ``id``
    and ``created_at`` audit timestamp.

    Args:
        body: Validated transaction creation payload from the request body.
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        The persisted transaction record, including ``id`` and ``created_at``.

    Raises:
        sqlalchemy.exc.IntegrityError: If a database constraint is violated
            (e.g. a NOT NULL column receives None after Pydantic validation passes).
    """
    row = Transaction(**body.model_dump())
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return TransactionResponse.model_validate(row)


@router.get("", response_model=list[TransactionResponse])
async def list_transactions(
    owner: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> list[TransactionResponse]:
    """Return all transactions ordered by transaction date descending.

    Optionally filters to a single portfolio owner when the ``?owner=`` query
    parameter is provided. Returns an empty list when no rows match.

    Args:
        owner: Optional portfolio owner string to filter by. ``None`` returns
            all transactions regardless of owner.
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        A list of ``TransactionResponse`` objects ordered ``transaction_date DESC``.
        Empty list when no transactions exist.

    Raises:
        sqlalchemy.exc.OperationalError: If the database is unreachable at
            query time.
    """
    stmt = select(Transaction).order_by(Transaction.transaction_date.desc())
    if owner is not None:
        stmt = stmt.where(Transaction.owner == owner)
    result = await session.execute(stmt)
    rows = result.scalars().all()
    return [TransactionResponse.model_validate(row) for row in rows]


@router.put("/{id}", response_model=TransactionResponse)
async def update_transaction(
    id: UUID,
    body: TransactionUpdate,
    session: AsyncSession = Depends(get_session),
) -> TransactionResponse:
    """Apply a partial update to an existing transaction and return the result.

    Fetches the ``Transaction`` ORM row by primary key. Applies only the
    non-``None`` fields from ``body`` via a ``setattr`` loop, commits, refreshes,
    and returns the full ``TransactionResponse``. Raises HTTP 404 if the row
    does not exist. Mirrors ``update_etf`` in ``routers/etfs.py``.

    Args:
        id: UUID primary key of the transaction to update.
        body: Partial update payload; only non-``None`` fields are written.
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        The updated ``TransactionResponse`` including all fields.

    Raises:
        HTTPException 404: If no transaction with the given ``id`` exists.
    """
    result = await session.execute(select(Transaction).where(Transaction.id == id))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(row, field, value)
    await session.commit()
    await session.refresh(row)
    return TransactionResponse.model_validate(row)


@router.delete("/{id}", status_code=204, response_model=None)
async def delete_transaction(
    id: UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Permanently delete a transaction row.

    Fetches the ``Transaction`` ORM row by primary key. Deletes it and commits.
    Returns HTTP 204 No Content on success. Raises HTTP 404 if the row does
    not exist. Mirrors ``delete_etf`` in ``routers/etfs.py``.

    Args:
        id: UUID primary key of the transaction to delete.
        session: Async SQLAlchemy session injected by ``Depends(get_session)``.

    Returns:
        None — HTTP 204 No Content.

    Raises:
        HTTPException 404: If no transaction with the given ``id`` exists.
    """
    result = await session.execute(select(Transaction).where(Transaction.id == id))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    await session.delete(row)
    await session.commit()
