import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import NullPool, create_engine

from backend.models import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Override sqlalchemy.url from DATABASE_URL environment variable.
# Raises KeyError if DATABASE_URL is not set.
config.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])


def run_migrations_online() -> None:
    """Run migrations in online mode using a synchronous psycopg3 connection.

    Reads DATABASE_URL from the environment (injected via config.set_main_option in
    the env.py module body before this function is called). Uses NullPool so no
    connections are held open after the migration context exits.

    Raises:
        KeyError: If DATABASE_URL is not set in the environment before env.py is imported.
        sqlalchemy.exc.OperationalError: If PostgreSQL is unreachable at migration time.
    """
    connectable = create_engine(
        config.get_main_option("sqlalchemy.url"),
        poolclass=NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
