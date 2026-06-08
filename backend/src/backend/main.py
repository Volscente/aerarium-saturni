import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Aerarium Saturni Backend")

_origins = ["http://localhost:3000"]
_frontend_origin = os.getenv("FRONTEND_ORIGIN")
if _frontend_origin:
    _origins.append(_frontend_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    """Return a liveness response with no external dependencies.

    Called by CI, load balancers, and smoke tests immediately after startup
    to confirm the FastAPI process is running before any business logic is
    exercised.

    Returns:
        A dict ``{"status": "ok"}`` serialised as JSON by FastAPI.
    """
    return {"status": "ok"}
