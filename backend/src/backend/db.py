import os
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

_database_url = os.environ["DATABASE_URL"]

engine = create_async_engine(_database_url)
_AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async SQLAlchemy session for use as a FastAPI dependency.

    Intended for injection via ``Depends(get_session)`` in future route
    handlers. The session is committed or rolled back by the caller; this
    generator only handles creation and closure.

    Yields:
        An ``AsyncSession`` bound to the engine configured in ``db.py``.

    Raises:
        sqlalchemy.exc.OperationalError: If the database is unreachable when
            the session is first used (not when the generator is entered).
    """
    async with _AsyncSessionLocal() as session:
        yield session
