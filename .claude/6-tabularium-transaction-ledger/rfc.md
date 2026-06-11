# [RFC] Tabularium Transaction Ledger & Input Engine — Aerarium Saturni

| Author              | Simone Porreca                                                                                                                                                         |
| :------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Project**         | Aerarium Saturni                                                                                                                                                       |
| **RFC status**      | Draft                                                                                                                                                                  |
| **Review deadline** | 2026-06-21                                                                                                                                                             |
| **Notion page**     | [6-Tabularium-Transaction-Ledger-Input-Engine](https://app.notion.com/p/6-Tabularium-Transaction-Ledger-Input-Engine-37a5cc6c0f0780a8a9d7cb0bd6ef5119)                 |
| **GitHub repo**     | [Volscente/aerarium-saturni](https://github.com/Volscente/aerarium-saturni)                                                                                           |
| **Milestone**       | [6-tabularium-transaction-ledger](https://github.com/Volscente/aerarium-saturni/milestone/4)                                                                          |

### Timeline

| Date       | Status | Note |
| :--------- | :----- | :--- |
| 2026-06-10 | Draft  |      |

### Table of contents

[Motivation](#motivation)

[Objectives](#objectives)

[Scope](#scope)

[Tabularium Transaction Ledger & Input Engine](#tabularium-transaction-ledger--input-engine)

[Tech Stack](#tech-stack)

[Effort Estimations](#effort-estimations)

[FAQs](#faqs)

[Risks & Open Questions](#risks--open-questions)

[References](#references)

---

## Motivation {#motivation}

The Tabularium currently provides only a static layout shell and route placeholders with no data layer. A portfolio dashboard is only as valuable as its underlying transaction history — without a mechanism to record financial events (purchases, sales, dividends, stock splits), the system cannot compute essential portfolio metrics such as cost basis, realized P&L, or time-weighted returns. The gap exists at two levels: infrastructure (no database schema, no data-backed FastAPI endpoints, no wiring between Next.js and the backend) and UX (no interface for data entry or historical review). This initiative closes both gaps simultaneously, establishing the data foundation that all future analytics in the Tabularium depend on. For full context, see the [Notion initiative page](https://app.notion.com/p/6-Tabularium-Transaction-Ledger-Input-Engine-37a5cc6c0f0780a8a9d7cb0bd6ef5119).

## Objectives {#objectives}

- **Establish the transaction data layer**: Define a PostgreSQL schema via SQLAlchemy ORM that supports 4 transaction types (Buy, Sell, Dividend, Split), 3 asset classes (stock, bond, ETF), fractional quantities up to 4 decimal places, multi-currency input, Broker Platform, Transaction Owner, and financial security identifiers (Ticker, ISIN).
- **Expose a validated CRUD API**: Deliver FastAPI endpoints for transaction creation and retrieval, with Pydantic v2 models providing strict request/response validation; Next.js Server Components fetch from this service over HTTP only.
- **Build the Transaction Ledger view**: Render a chronological, read-only ledger at `/tabularium/transactions` displaying Owner, Broker Platform, Ticker, ISIN, transaction type, asset class, quantity, price, currency, and date — refreshed without full page reload after each new entry.
- **Implement the transaction input UX**: Deliver a `+ Add Transaction` trigger accessible from all Tabularium sub-routes, opening a right-side drawer with dynamic, context-sensitive form fields driven by the selected transaction type and asset class.
- **Extend Tabularium sub-navigation**: Add a persistent sub-navigation bar covering `/tabularium/performance`, `/tabularium/holdings`, and `/tabularium/transactions` within the shared Tabularium layout shell.

## Scope {#scope}

**In-Scope:**

- Dedicated Transaction Ledger view at `/tabularium/transactions` showing chronological event history
- Global `+ Add Transaction` action button accessible across all Tabularium views
- Contextual right-side drawer/modal for transaction data entry
- Four transaction types: Buy, Sell, Dividend, Split
- Two broker platforms: IBKR and N26
- Three asset classes: stocks, bonds, ETFs
- Dynamic form fields that adjust based on the selected transaction type and asset class
- Tabularium sub-navigation: `/tabularium/performance`, `/tabularium/holdings`, `/tabularium/transactions`
- FastAPI endpoints for transaction creation and retrieval with Pydantic v2 models for validation
- PostgreSQL schema for transactions defined via SQLAlchemy ORM
- Transaction Owner field to support portfolio management and multi-user tracking
- Financial security identifiers: Ticker and ISIN (ISO 6166) for precise asset identification
- Fractional share support (up to 4 decimal places) and multi-currency input
- Immediate UI refresh on transaction submission without a full page reload

**Out-of-Scope:**

- **User authentication**: The platform remains unauthenticated at this stage.
- **Real-time or live market data feeds**: Only manually entered data is supported.
- **Portfolio metric calculations (cost basis, P&L, TWR, MWR)**: This initiative provides the data foundation; calculations are future work.
- **CSV import or bulk transaction entry**: Only single manual entry is in scope.
- **ML simulations**: Deferred to a dedicated future initiative per backend README.

**Constraints:**

- Lighthouse performance score must remain ≥ 90 at all times; enforced by `lhci autorun` in CI.
- Frontend builds must complete within 3 minutes; enforced by the existing `timeout-minutes: 3` CI guard.
- The `psycopg[binary]` (psycopg3) driver must be used for all PostgreSQL access — not psycopg2.
- CORS must unconditionally allowlist `http://localhost:3000`; the production origin is controlled by `FRONTEND_ORIGIN`.
- `GET /health` must remain database-independent and return `{"status": "ok"}` even when PostgreSQL is unavailable.

---

# **Tabularium Transaction Ledger & Input Engine** {#tabularium-transaction-ledger--input-engine}

## Approach Overview {#approach-overview}

The initiative introduces the first real data layer in Aerarium Saturni via a symmetric two-layer architecture: a FastAPI backend defining the PostgreSQL schema through SQLAlchemy ORM declarative models and validating all I/O through Pydantic v2, paired with a Next.js frontend that consumes those endpoints exclusively through Server Components and Server Actions. No client-side fetch calls touch financial data, consistent with the principle stated in `backend/README.md`.

The data model is built around a single `transactions` table owned by a SQLAlchemy `Transaction` ORM class. Schema creation is handled via `Base.metadata.create_all()` called at backend startup — no Alembic migration tooling is introduced in this initiative. On the frontend, the Tabularium layout is extended with a persistent sub-navigation bar and a `+ Add Transaction` button that opens a right-side drawer. Drawer form submission is wired through a Next.js Server Action that POSTs to the backend and calls `revalidatePath('/tabularium/transactions')`, triggering a cache invalidation and data refresh without a full page reload.

The proposal's approach direction referenced Alembic migrations; this design deliberately departs from that in favor of SQLAlchemy ORM's `create_all()` for initial schema creation. The rationale: Alembic adds operational complexity (migration scripts, version table, `env.py` wiring) that is premature when no schema history exists yet. The Pydantic and SQLAlchemy ORM additions were introduced as explicit feedback and are adopted without modification. The trade-off of skipping Alembic is that future schema changes will require either Alembic adoption or manual DDL — a documented decision the next data initiative should address.

### Integration {#integration}

On the backend, the new `src/backend/models.py` introduces `Base = declarative_base()` and the `Transaction` ORM class, wired to the existing async engine in `src/backend/db.py`. A startup event in `src/backend/main.py` synchronously calls `Base.metadata.create_all()` to materialise the schema if it does not exist. A new `src/backend/routers/transactions.py` module registers `POST /transactions` and `GET /transactions` on the existing FastAPI app using the `get_session` dependency already in `db.py`. Pydantic schemas live in `src/backend/schemas/transactions.py`.

On the frontend, `app/(tabularium)/tabularium/layout.tsx` is extended with two additions: a `TabulariumSubNav` client component rendering three sub-route links using the `usePathname()` active-state pattern already established in `CustomNavbar`, and an `AddTransactionButton` client component. The button renders a `TransactionDrawer` — a right-side slide-in panel. The dynamic form lives in `app/(tabularium)/tabularium/components/TransactionForm.tsx`; it conditionally renders fields based on `transactionType` and `assetClass` state. Form submission calls a Server Action in `app/(tabularium)/tabularium/actions.ts` that validates the payload, POSTs to the FastAPI backend, and on success closes the drawer and calls `revalidatePath('/tabularium/transactions')`.

## Milestone 1 — Backend Schema and API {#milestone-1-backend-schema-and-api}

Define the `Transaction` SQLAlchemy ORM model in `src/backend/models.py` with the following columns:

| Column | Type | Notes |
| :----- | :--- | :---- |
| `id` | `UUID`, primary key, default `uuid4` | Immutable transaction identifier |
| `owner` | `String(255)`, not null, indexed | Portfolio owner; future multi-user join key |
| `broker` | `Enum('IBKR', 'N26')`, not null, indexed | Broker platform used |
| `transaction_type` | `Enum('buy', 'sell', 'dividend', 'split')` | Drives form field visibility |
| `asset_class` | `Enum('stock', 'bond', 'etf')` | Drives form field visibility |
| `ticker` | `String(20)`, nullable | Exchange ticker symbol (e.g. `AAPL`) |
| `isin` | `String(12)`, nullable | ISO 6166 identifier (e.g. `US0378331005`) |
| `quantity` | `Numeric(14, 4)` | Fractional share support |
| `price` | `Numeric(14, 4)`, nullable | Per-unit price; null for splits |
| `currency` | `String(3)`, not null | ISO 4217 currency code |
| `fees` | `Numeric(14, 4)`, default `0` | Brokerage fees; required for future cost-basis calculations |
| `transaction_date` | `Date`, not null | Business date of the event |
| `created_at` | `DateTime(timezone=True)`, server default `now()` | Audit timestamp |

The `owner` field is a plain string (no foreign key) to remain compatible with the unauthenticated platform. It is indexed to support future `WHERE owner = ?` portfolio queries. `ticker` and `isin` are nullable — they are optional enrichment fields and must not block entry. The `fees` column is included now because omitting it later requires a DDL change that affects cost-basis accuracy for all historical rows.

Pydantic v2 schemas in `src/backend/schemas/transactions.py`:

- `TransactionCreate` — request body with `model_config = ConfigDict(str_strip_whitespace=True)`; validates ISIN length (exactly 12 alphanumeric characters when provided) via a `field_validator`
- `TransactionResponse` — all columns plus `id` and `created_at`; returned on creation (HTTP 201) and in list responses

FastAPI routes in `src/backend/routers/transactions.py`:

- `POST /transactions` — accepts `TransactionCreate`, persists via `AsyncSession`, returns `TransactionResponse` (HTTP 201)
- `GET /transactions` — returns `list[TransactionResponse]` ordered by `transaction_date DESC`, optionally filtered by `?owner=` query parameter

## Milestone 2 — Transaction Ledger View {#milestone-2-transaction-ledger-view}

Convert `app/(tabularium)/tabularium/transactions/page.tsx` from a placeholder into a Next.js Server Component that calls `GET /transactions` from the FastAPI backend. The ledger renders a full-width table with columns: Date, Owner, Type, Asset Class, Ticker, ISIN, Quantity, Price, Currency, Fees. Rows are sorted chronologically descending (newest first), matching the API's default ordering.

The `fetch()` call uses `{ next: { tags: ['transactions'] } }` for granular cache invalidation. The Tabularium landing page is audited to confirm it does not regress below Lighthouse 90 after adding the new sub-route.

## Milestone 3 — Transaction Input Flyout {#milestone-3-transaction-input-flyout}

`AddTransactionButton` is a `'use client'` component in the Tabularium layout that controls `isDrawerOpen` state and renders `TransactionDrawer`. Placing it in the layout ensures the trigger is visible on all three sub-routes without prop-drilling or React Context.

`TransactionDrawer` is a right-side slide-in panel (Tailwind `translate-x-full` / `translate-x-0` transition, `z-50`, fixed positioning) containing `TransactionForm`. The form exposes two top-level selectors — `transactionType` and `assetClass` — and conditionally renders fields per the following matrix:

| Transaction Type | Required fields | Optional fields |
| :--------------- | :-------------- | :-------------- |
| Buy / Sell | Quantity, Price, Currency, Fees | Ticker, ISIN |
| Dividend | Currency, Amount per share | Ticker, ISIN |
| Split | Ratio (e.g. `4:1`), Asset Class | Ticker, ISIN |

Owner and Transaction Date are always required. Ticker and ISIN are always optional but prominently placed with placeholder hints (e.g. `US0378331005` for ISIN).

Form submission calls the `createTransaction` Server Action in `actions.ts`. The action validates the payload, POSTs to `POST /transactions`, and on success calls `revalidatePath('/tabularium/transactions')` and returns a success signal that triggers drawer close on the client. A Zod schema on the Next.js side mirrors the Pydantic `TransactionCreate` rules (ISIN format, required fields per type) to provide immediate client-side feedback before the server round-trip.

## Milestone 4 — Sub-navigation and State Wiring {#milestone-4-sub-navigation-and-state-wiring}

`TabulariumSubNav` is added to `app/(tabularium)/tabularium/layout.tsx` between `CustomNavbar` and the page `{children}`. It renders three links using `usePathname()` prefix-matching (the same pattern in `CustomNavbar`) styled with the existing Tailwind `roman-*` tokens.

End-to-end verification: submitting a transaction from any Tabularium sub-route must close the drawer and cause the ledger at `/tabularium/transactions` to display the new row without a full page reload. This is confirmed manually before marking the milestone complete. The `CustomNavbar` invariant — remaining free of Nextra-specific imports — must be preserved in the sub-nav component as well, since both share the Tabularium layout.

## Tech Stack {#tech-stack}

- **Next.js 15**: App Router route group (`app/(tabularium)/`) for the Tabularium pillar; Server Components fetch transaction data at render time; Server Actions handle form submission and `revalidatePath` cache invalidation, keeping financial data off the client.
- **Nextra 4**: Scoped to Home and Codex routes only; the Tabularium layout shell remains Nextra-free per the invariant in `frontend/README.md` — the sub-navigation and drawer must not import from `nextra` or `nextra/components`.
- **Tailwind CSS**: Drawer slide-in animation, form layout, and sub-navigation active states using the existing `roman-*` token system; no new CSS files.
- **Lucide React**: Icons for the `+ Add Transaction` trigger button and the drawer close action, consistent with the Tabularium's existing iconography.
- **Python 3.13**: Runtime for the FastAPI service; UV workspace member configuration unchanged.
- **FastAPI**: ASGI framework hosting the new `/transactions` router; `Depends(get_session)` wires the existing async session factory from `db.py` to CRUD handlers; OpenAPI schema auto-generated from Pydantic models.
- **Pydantic**: v2 models (`TransactionCreate`, `TransactionResponse`) enforce field-level validation including ISIN format, cross-field conditionality (price null for splits), and whitespace stripping; `ConfigDict(from_attributes=True)` enables ORM-mode serialization.
- **SQLAlchemy ORM**: Declarative `Base` with the `Transaction` model; `create_all()` at startup creates the schema if absent; async `AsyncSession` via the existing `get_session` generator in `src/backend/db.py`; no Alembic in this initiative.
- **UV**: Python dependency management; all new backend dependencies (if any) declared in `backend/pyproject.toml`.

## Effort Estimations {#effort-estimations}

Total estimated effort: **4 sessions**.

| Milestone | Description | Est. effort | GitHub Issue |
| :-------- | :---------- | :---------- | :----------- |
| M1 — Backend Schema and API | SQLAlchemy ORM model, Pydantic schemas, FastAPI CRUD endpoints, startup `create_all` | 1 session | #{issue} |
| M2 — Transaction Ledger View | Server Component ledger page at `/tabularium/transactions` with full column set | 1 session | #{issue} |
| M3 — Transaction Input Flyout | Drawer, dynamic form matrix, Server Action, Zod mirror schema, drawer close wiring | 1.5 sessions | #{issue} |
| M4 — Sub-navigation and State Wiring | Sub-nav component, layout integration, end-to-end verification | 0.5 sessions | #{issue} |

### Recommended Order

1. M1 — Backend Schema and API (no frontend dependency; validates the data model early and unblocks M2 and M3)
2. M2 — Transaction Ledger View (requires M1 `GET /transactions`; validates the full read path before the write path exists)
3. M3 — Transaction Input Flyout (requires M1 `POST /transactions`; most complex piece — benefits from M2 being visible for end-to-end testing)
4. M4 — Sub-navigation and State Wiring (requires M2 + M3; final integration and verification step)

---

# **FAQs** {#faqs}

**Q: Why SQLAlchemy ORM's `create_all()` instead of Alembic migrations?**

A: Alembic is valuable for managing schema evolution across deployed environments, but it adds operational complexity (migration scripts, `env.py`, version table, autogenerate configuration) that is premature when no schema history exists yet. Using `create_all()` at startup is simpler and keeps scope tight. When schema changes become necessary — likely in the first analytics initiative — Alembic can be introduced with `alembic init` and `--autogenerate` from the existing ORM models, producing an accurate initial migration without data loss or re-architecting.

**Q: Why are Ticker and ISIN nullable rather than required?**

A: Dividend and Split transactions may reference securities the user already conceptually tracks, and the platform has no security master database against which to validate an ISIN. Requiring either identifier would block valid entries (e.g. a dividend from a bond holding without a readily known ticker). Nullable fields with optional Pydantic format validation (12 alphanumeric characters when ISIN is provided) strike the right balance between data quality and usability for a manually entered ledger.

**Q: How does the `+ Add Transaction` button remain visible across all Tabularium sub-routes without React Context?**

A: The button lives directly in `app/(tabularium)/tabularium/layout.tsx`, which wraps every Tabularium sub-route. As a `'use client'` component managing its own `isDrawerOpen` state, it is always mounted and always accessible regardless of which sub-route is active. No React Context, no prop-drilling, no global store — the layout is the right level of ownership.

**Q: Why Server Actions instead of direct `fetch()` calls from the drawer form?**

A: The backend README explicitly states that no client-side API calls should be made for sensitive financial data. Server Actions execute on the server, keep the FastAPI service URL and any future credentials out of the browser, and allow `revalidatePath` to invalidate the Next.js cache for the ledger in the same server-side round-trip — eliminating the need for a separate client-side state update after submission.

**Q: Terminology?**

A:

- **ISIN** → International Securities Identification Number; a 12-character alphanumeric code standardized by ISO 6166 that globally identifies a financial security (e.g. `US0378331005` for Apple Inc.).
- **TWR / MWR** → Time-Weighted Return / Money-Weighted Return; portfolio performance metrics deferred to a future analytics initiative.
- **P&L** → Profit and Loss; realized and unrealized gains/losses calculated from transaction history — future work.
- **ORM** → Object-Relational Mapper; SQLAlchemy ORM maps Python classes to PostgreSQL tables declaratively.
- **ASGI** → Asynchronous Server Gateway Interface; the Python async server standard used by FastAPI and uvicorn.
- **CRUD** → Create, Read, Update, Delete; the four basic data operations; this initiative covers Create and Read only.

---

## Risks & Open Questions {#risks--open-questions}

| Risk / Question | Likelihood | Mitigation / Answer |
| :-------------- | :--------- | :------------------ |
| Early ORM schema decisions are load-bearing for all future analytics. Columns omitted now (fees, owner index) require manual DDL or Alembic introduction later, potentially affecting historical data integrity. | Medium | Include `fees`, indexed `owner`, and nullable `ticker`/`isin` from day one. Document the `transactions` table as the canonical financial record; any future analytics PR must extend it via a tracked migration and must not rely on re-creating the table. |
| Ticker and ISIN data quality may degrade over time if users omit them consistently, reducing the value of future market-data lookup integrations. | Low | Pydantic validates ISIN format when provided. The form UI surfaces both fields prominently with inline hints. An optional future initiative can introduce a security lookup API to pre-fill these from a ticker search, but that integration must not be blocked on this field being required. |
| Dynamic form complexity: 4 transaction types × 3 asset classes = 12 combinations, and some are semantically ambiguous (e.g. Split on a bond, Dividend on an ETF). Edge cases need explicit handling. | Medium | Define the full field visibility matrix before implementing `TransactionForm` (see M3 table). Pydantic `model_validator` enforces cross-field rules server-side; Zod mirrors this on the Next.js side for immediate feedback. Ambiguous combinations (e.g. Split + bond) are permitted but the form should not hide required fields. |
| `revalidatePath('/tabularium/transactions')` only invalidates the ledger route. When `/tabularium/holdings` and `/tabularium/performance` become data-backed, stale transaction data may persist on those pages. | Low | Acceptable for this initiative since both pages are still placeholders. Document in `actions.ts` that future data-backed sub-routes must add their own `revalidatePath` calls to `createTransaction`. |

## References {#references}

- [SQLAlchemy ORM — Declarative Base](https://docs.sqlalchemy.org/en/20/orm/declarative_base.html)
- [SQLAlchemy — create_all](https://docs.sqlalchemy.org/en/20/core/metadata.html#sqlalchemy.schema.MetaData.create_all)
- [Pydantic v2 — Model Validators](https://docs.pydantic.dev/latest/concepts/validators/)
- [Next.js — Server Actions and Mutations](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations)
- [Next.js — revalidatePath](https://nextjs.org/docs/app/api-reference/functions/revalidatePath)
- [ISO 6166 — International Securities Identification Number](https://www.iso.org/standard/78502.html)
- [Notion initiative page](https://app.notion.com/p/6-Tabularium-Transaction-Ledger-Input-Engine-37a5cc6c0f0780a8a9d7cb0bd6ef5119)
