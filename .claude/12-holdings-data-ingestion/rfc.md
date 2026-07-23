# [RFC] Holdings Data Ingestion — Aerarium Saturni

| Author          | Simone Porreca                                                                                  |
| :-------------- | :---------------------------------------------------------------------------------------------- |
| **Project**     | Aerarium Saturni                                                                                |
| **RFC status**  | Draft                                                                                           |
| **Review deadline** | 2026-07-12                                                                                  |
| **Notion page** | [Holdings Data Ingestion](https://app.notion.com/p/12-Holdings-Data-Ingestion-3a45cc6c0f0780b3accbf9b0f919a27f) |
| **GitHub repo** | [Volscente/aerarium-saturni](https://github.com/Volscente/aerarium-saturni)                    |
| **Milestone**   | [12-holdings-data-ingestion](https://github.com/Volscente/aerarium-saturni/milestone/10)       |

### Timeline

| Date       | Status | Note  |
| :--------- | :----- | :---- |
| 2026-07-23 | Draft  |       |

### Table of contents

[Motivation](#motivation)

[Objectives](#objectives)

[Scope](#scope)

[Holdings Data Ingestion](#holdings-data-ingestion)

[Tech Stack](#tech-stack)

[Effort Estimations](#effort-estimations)

[FAQs](#faqs)

[Risks & Open Questions](#risks--open-questions)

[References](#references)

---

## Motivation {#motivation}

The portfolio system currently has no mechanism to store or query the full constituent lists of held ETFs. Free financial data APIs cap ETF holding data at the top 10 positions, which makes complete look-through analysis across thousands of underlying stocks impossible. Issuers (iShares, Vanguard, Amundi) publish full constituent lists as CSV downloads on their product pages, but the backend has no persistent schema for this data and no pipeline to ingest it. Without this foundation the system cannot report accurate cross-ETF exposure for EUNL, VWCE, or LYP6. For full context, see the [Notion initiative page](https://app.notion.com/p/12-Holdings-Data-Ingestion-3a45cc6c0f0780b3accbf9b0f919a27f).

## Objectives {#objectives}

- **Persist ETF constituents**: The database stores complete constituent records — stock ISIN, name, weight percentage, and snapshot date — for every target ETF (EUNL, VWCE, LYP6).
- **Enable atomic CSV ingestion**: A single upload call atomically replaces the full constituent list for a given ETF within one database transaction, returning the inserted row count or an actionable error.
- **Validate at the boundary**: Every CSV row is validated by the `EtfHoldingRow` schema before any write; a malformed row aborts the entire upload and returns the specific row number in the error response.
- **Maintain schema integrity**: All table changes are introduced through Alembic-versioned migrations; referential integrity between `etf_holdings` and `etfs` is enforced by a `CASCADE`-delete foreign key.

## Scope {#scope}

**In-Scope:**

- ETF holdings database schema (`etf_holdings` table with ISIN, name, weight, snapshot date)
- Alembic migration introducing the `etf_holdings` table with FK cascade to `etfs`
- Manual CSV upload endpoint atomically replacing an ETF's full constituent list
- CSV row validation via `EtfHoldingRow` Pydantic schema (rejects malformed rows with row number)
- Support for target ETFs EUNL (iShares), VWCE (Vanguard), LYP6 (Amundi)
- 100% constituent coverage with exact weights and ISIN identifiers

**Out-of-Scope:**

- **Automated or scheduled ingestion**: Manual upload only — no API-driven or periodic refresh.
- **Portfolio metric calculations (cost basis, P&L, TWR, MWR)**: Deferred to a future analytics initiative.
- **ML simulations**: Deferred to a dedicated future initiative.
- **Authentication**: The service is unauthenticated at this stage.
- **Alembic baseline migration for the transactions table**: Deferred to a follow-up milestone.

**Constraints:**

- All schema changes must go through Alembic migrations — `create_all()` is reserved for the `transactions` table only.
- `psycopg[binary]` (psycopg3) must be used as the database driver; `psycopg2` is banned for async engine compatibility.

---

# **Holdings Data Ingestion** {#holdings-data-ingestion}

## Approach Overview {#approach-overview}

The solution extends the backend's existing `/etfs` router with a `POST /etfs/{id}/holdings/upload` sub-resource that accepts a CSV file via `multipart/form-data`. The endpoint first validates the parent ETF exists (404 otherwise), then streams the uploaded file through `EtfHoldingRow` Pydantic validation row by row. If every row passes, a single database transaction deletes the existing holdings for that ETF and inserts all new rows, returning `{"inserted_rows": n}`. Any row-level validation failure aborts the upload immediately and returns an HTTP 422 with the offending row number — no partial writes are ever committed. All holdings rows carry a `snapshot_date` derived from the uploaded file content, preserving a point-in-time reference for each ingestion.

The approach aligns with the direction stated in the proposal: an atomic delete-then-insert behind `EtfHoldingRow` validation, integrated as a sub-resource of the ETF router. No divergence from the stated direction was necessary; the design adopts it wholesale because the atomic-replace semantic is the right model for index constituent lists, which are always published as complete snapshots rather than incremental diffs.

## Integration {#integration}

The holdings upload endpoint lives inside `src/backend/routers/etfs.py` alongside the five existing ETF CRUD and price-log handlers. It reuses `Depends(get_session)` for session injection and `python-multipart`'s `UploadFile` for file handling — both already required by the ETF module. The `EtfHolding` ORM class is a child of `Etf` with `ON DELETE CASCADE`, mirroring the existing `EtfPriceHistory` child-table pattern in `src/backend/models.py`. Schema changes are introduced in a new Alembic migration that builds on the `001_create_etf_tables.py` chain already in `backend/alembic/versions/`. No other module is affected; the `transactions` router and the `portfolio` router are untouched.

## M1 — Data Layer {#m1-data-layer}

Introduce the `EtfHolding` ORM class in `src/backend/models.py` with the required columns (`id`, `etf_id` FK, `stock_isin`, `stock_name`, `weight_percentage`, `snapshot_date`) and a composite B-Tree index on `(etf_id, snapshot_date DESC)` for efficient per-ETF queries. Write an Alembic migration (a new version file extending the `001` chain) that creates the `etf_holdings` table with the FK constraint and `ON DELETE CASCADE`. Add the `EtfHoldingRow` Pydantic v2 model in `src/backend/schemas/etfs.py` to validate individual CSV rows at the boundary.

## M2 — API Layer {#m2-api-layer}

Implement `POST /etfs/{id}/holdings/upload` in `src/backend/routers/etfs.py`. The handler must: (1) look up the parent ETF by ID and return 404 if absent; (2) read the `UploadFile` byte stream and parse rows into `EtfHoldingRow` objects, collecting the first validation error with its row number; (3) within a single `AsyncSession` transaction, execute `DELETE FROM etf_holdings WHERE etf_id = {id}` followed by a bulk insert of the validated rows; (4) return `{"inserted_rows": n}` on success or HTTP 422 with `{"detail": "Row {n}: {validation_error}"}` on failure. Register no new router prefix — the endpoint is a sub-resource under the existing `/etfs` prefix.

## Tech Stack {#tech-stack}

- **Python**: Backend language; the existing financial ecosystem (SQLAlchemy, Pydantic, psycopg3) provides everything needed without additional runtime dependencies.
- **FastAPI**: Async web framework already in use; `UploadFile` from `python-multipart` is natively supported and already declared as a dependency in `pyproject.toml`.
- **SQLAlchemy (async)**: ORM and query layer; `AsyncSession` wraps the delete-then-insert in a single unit of work, guaranteeing atomicity without explicit transaction management in the handler.
- **psycopg[binary]**: The only supported PostgreSQL driver for the async engine; `psycopg2` is banned by project constraint.
- **Pydantic v2**: `EtfHoldingRow` uses `field_validator` and `model_validator` to enforce ISIN format, positive weight, and non-null required fields before any data reaches the database.
- **PostgreSQL**: Relational store; the `etf_holdings` table uses a B-Tree composite index on `(etf_id, snapshot_date DESC)` enabling fast constituent lookups ordered by recency.
- **Alembic**: All new tables introduced through versioned migration files; `create_all()` is explicitly banned for this initiative per project constraint.
- **python-multipart**: Required by FastAPI's `UploadFile` for `multipart/form-data` parsing; already present in `backend/pyproject.toml` as of v0.3.1.

## Effort Estimations {#effort-estimations}

Total estimated effort: **{N} sessions**.

| Milestone          | Description                                                             | Est. effort | GitHub Issue |
| :----------------- | :---------------------------------------------------------------------- | :---------- | :----------- |
| M1 — Data Layer    | EtfHolding ORM, Alembic migration, EtfHoldingRow schema, unit tests     | {N}         | #{issue}     |
| M2 — API Layer     | Upload endpoint, integration with etfs router, end-to-end test          | {N}         | #{issue}     |

### Recommended Order

1. M1 — Data Layer (schema and validation must exist before the handler can be written)
2. M2 — API Layer (depends on M1 ORM class and EtfHoldingRow schema)

---

# **FAQs** {#faqs}

**Q: Why atomic replace (delete-then-insert) rather than upsert or incremental merge?**

A: Issuer files represent a complete point-in-time snapshot of the index; stocks are added and removed between rebalancing dates. An upsert would require a stable primary key shared across uploads and would leave stale rows for stocks that exited the index. Full replacement keeps the holdings table exactly consistent with the issuer file and avoids tracking deletions explicitly.

**Q: Why is XLS not supported if the initiative mentions `.xls` files?**

A: The `python-multipart` `UploadFile` pipeline processes raw byte streams; CSV requires no additional library dependency. XLS/XLSX parsing requires `openpyxl` or `xlrd`, which adds a dependency for a secondary format. The practical workaround is to export CSV from the issuer's XLS file before uploading, which all three target issuers support. XLS support can be added as a follow-on once the CSV path is stable.

**Q: Why is the upload endpoint a sub-resource of `/etfs` rather than its own `/holdings` router?**

A: Holdings have no independent existence — every holding row belongs to a specific ETF. Sub-resource placement (`/etfs/{id}/holdings/upload`) enforces this ownership at the URL level, allows the handler to validate the parent ETF in one step, and keeps the ETF router as the single authority over ETF-related data mutations.

**Q: How does a caller retrieve the full holdings list after upload?**

A: This RFC scopes only the ingestion path. A `GET /etfs/{id}/holdings` read endpoint — or inclusion of holdings in the `EtfResponse` payload — is not in scope and is tracked as an open question below. Callers can verify insert success via the `{"inserted_rows": n}` response body.

**Q: Terminology?**

A:

- **ETF** → Exchange-Traded Fund; a fund traded on a stock exchange tracking an underlying index (e.g. MSCI World).
- **ISIN** → International Securities Identification Number; a 12-character alphanumeric code uniquely identifying a security.
- **EUNL** → iShares Core MSCI World ETF (ticker on Euronext).
- **VWCE** → Vanguard FTSE All-World ETF (ticker on Xetra).
- **LYP6** → Amundi STOXX Europe 600 ETF (ticker on Euronext).
- **Look-through** → Treating an ETF as transparent and analysing the underlying stocks it holds, rather than the ETF unit itself.

---

## Risks & Open Questions {#risks--open-questions}

| Risk / Question | Likelihood | Mitigation / Answer |
| :-------------- | :--------- | :------------------ |
| Issuer CSV column layout changes without notice, silently breaking the parser for that issuer | Medium | Version-stamp each issuer parser; add a dry-run validation mode that reports parse errors without writing; monitor issuer release notes manually |
| Holdings become stale with no automated alert — manual upload cadence is entirely user-driven | Medium | Surface `snapshot_date` in every holdings response so callers can detect staleness; document recommended refresh cadence for each target ETF's rebalancing schedule |
| A network interruption mid-upload (after connection accepted, before commit) could leave the ETF temporarily with zero holdings if the transaction does not roll back cleanly | Low | SQLAlchemy `AsyncSession` rolls back automatically on any unhandled exception; the delete step is not committed until the insert succeeds — the previous snapshot is preserved on failure |
| No read endpoint for holdings is currently in scope — callers cannot verify completeness after ingestion beyond the `inserted_rows` count | Open | Decide whether holdings are returned inline in `EtfResponse` (via a SQLAlchemy `relationship` eager-load) or via a dedicated `GET /etfs/{id}/holdings` endpoint; the read path is the prerequisite for any downstream analytics |
| XLS format referenced in the initiative is not supported by the CSV-only upload endpoint | Low | Pre-convert XLS to CSV before uploading; document this as a known limitation; add `openpyxl`-based conversion as a follow-on if the manual step proves too friction-heavy |

## References {#references}

- [Notion: Holdings Data Ingestion](https://app.notion.com/p/12-Holdings-Data-Ingestion-3a45cc6c0f0780b3accbf9b0f919a27f)
- [GitHub Milestone: 12-holdings-data-ingestion](https://github.com/Volscente/aerarium-saturni/milestone/10)
- [GitHub Repo: Volscente/aerarium-saturni](https://github.com/Volscente/aerarium-saturni)
