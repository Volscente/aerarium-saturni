---
title: "Holdings Data Ingestion"
project: "Aerarium Saturni"
author: "Simone Porreca"
deadline: "2026-07-12"
notion-page: "https://app.notion.com/p/12-Holdings-Data-Ingestion-3a45cc6c0f0780b3accbf9b0f919a27f"
github-repo: "https://github.com/Volscente/aerarium-saturni"
milestone: [12-holdings-data-ingestion](https://github.com/Volscente/aerarium-saturni/milestone/10)
tech-stack:
  - Python             # backend language
  - FastAPI            # async web framework; existing ETF router extended
  - SQLAlchemy (async) # ORM and query layer
  - psycopg[binary]    # psycopg3 async PostgreSQL driver (psycopg2 banned)
  - Pydantic v2        # request/response validation; EtfHoldingRow CSV row parsing
  - PostgreSQL         # target database; etf_holdings table
  - Alembic            # all new schema changes must go through migrations
  - python-multipart   # multipart/form-data CSV file upload
scope-in:
  - ETF holdings database schema (etf_holdings table with ISIN, name, weight, snapshot date)
  - Alembic migration introducing the etf_holdings table with FK cascade to etfs
  - Manual CSV upload endpoint atomically replacing an ETF's full constituent list
  - CSV row validation via EtfHoldingRow Pydantic schema (rejects malformed rows with row number)
  - Support for target ETFs EUNL (iShares), VWCE (Vanguard), LYP6 (Amundi)
  - 100% constituent coverage with exact weights and ISIN identifiers
scope-out:
  - "Automated or scheduled ingestion: manual upload only — no API-driven or periodic refresh"
  - "Portfolio metric calculations (cost basis, P&L, TWR, MWR): deferred to a future analytics initiative"
  - "ML simulations: deferred to a dedicated future initiative"
  - "Authentication: the service is unauthenticated at this stage"
  - "Alembic baseline migration for the transactions table: deferred to a follow-up milestone"
milestones:
  - ""                  # Ordered milestone names; each maps to a GitHub Issue
context-paths:
  - "backend/README.md"
---

## Problem

The portfolio system currently has no mechanism to store or query the full constituent lists of held ETFs. Free financial data APIs cap ETF holding data at the top 10 positions, which makes complete look-through analysis across thousands of underlying stocks impossible. Issuers (iShares, Vanguard, Amundi) publish full constituent lists as CSV downloads on their product pages, but the backend has no persistent schema for this data and no pipeline to ingest it. Without this foundation the system cannot report accurate cross-ETF exposure for EUNL, VWCE, or LYP6.

## Approach direction

Extend the backend's existing ETF module with a dedicated `etf_holdings` table (introduced via Alembic) and a CSV upload endpoint that atomically replaces an ETF's full constituent list from an issuer-provided file. Each issuer's export layout is handled by dedicated parsing logic surfaced through `EtfHoldingRow` Pydantic validation; any malformed row aborts the entire upload and returns the row number in the error response.

## Success criteria

- The database persists individual constituent records (stock ISIN, name, weight percentage, snapshot date) for EUNL, VWCE, and LYP6.
- A file upload endpoint accepts CSV exports from iShares, Vanguard, and Amundi and rejects malformed rows with a clear per-row error.
- Querying any target ETF returns 100% of its holdings with exact weights and ISIN identifiers.

## Constraints

- All schema changes must go through Alembic migrations — `create_all()` is reserved for the `transactions` table only.
- `psycopg[binary]` (psycopg3) must be used as the database driver; `psycopg2` is banned for async engine compatibility.

## Desired tech

## Integration context

The holdings upload endpoint plugs into the existing `/etfs` router as a sub-resource (`POST /etfs/{id}/holdings/upload`), reusing the same `Depends(get_session)` dependency injection pattern and `python-multipart` `UploadFile` already in use for the ETF module. The `EtfHolding` ORM class carries a FK with `ON DELETE CASCADE` to `etfs.id`, keeping the data model consistent with the existing child-table pattern used by `EtfPriceHistory`.

## Known risks / concerns

- Each issuer (iShares, Vanguard, Amundi) uses a different CSV column layout; any format change on the issuer side silently breaks the corresponding parser until caught manually.
- Manual upload is the sole ingestion path — holdings freshness depends entirely on user action with no automated alert when data becomes stale.
- The atomic delete-then-insert strategy for replacing a full constituent list means a failed upload leaves the previous snapshot in place; partial uploads are not possible by design, but a network error mid-upload could leave the table empty for that ETF until the next successful upload.
- The initiative references XLS support but the upload endpoint accepts only CSV; XLS ingestion would require an additional conversion step not yet covered by the current `EtfHoldingRow` parsing logic.
