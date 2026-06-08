FROM python:3.13-slim
WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./
COPY backend/pyproject.toml backend/README.md ./backend/
RUN uv sync --frozen --no-cache --package backend --no-install-project

COPY backend/src/ ./backend/src/
RUN uv sync --frozen --no-cache --package backend

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
