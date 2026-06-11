from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db import get_session
from backend.models import Transaction
from backend.schemas.transactions import TransactionCreate, TransactionResponse

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
