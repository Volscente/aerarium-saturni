# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Behavioral Guidelines

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```txt
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## Architecture

### Overview

Aerarium Saturni is a monorepo with two services:

- **Frontend** — Next.js 15 + Nextra 4 application serving three pillars: Home, Tabularium, and Codex.
- **Backend** — Python FastAPI service owning all data access for the Tabularium pillar.

Traffic flows: browser → Nginx → Next.js frontend (SSR) → FastAPI backend → PostgreSQL.

---

### Frontend (`frontend/`)

**Stack:** Next.js 15, Nextra 4, Tailwind CSS, Zod, next-themes, Pagefind search.

**Routing model:** two separate routing strategies coexist in the same Next.js app:

| Route group | Path pattern | Renderer |
| --- | --- | --- |
| Nextra (`[[...slug]]`) | `/`, `/codex/**` | Nextra MDX pipeline |
| App Router `(tabularium)` | `/tabularium/**` | Plain Next.js App Router; no Nextra chrome |

**Key files:**

- `next.config.mjs` — Nextra wrapper; remark-math → rehype-katex plugin chain; standalone output.
- `content/_meta.js` — Root Nextra nav (Home, Codex); Tabularium is excluded.
- `app/layout.tsx` — Minimal root shell (`<html>`, `<body>`, `ThemeProvider`, global CSS).
- `app/[[...slug]]/layout.tsx` — Nextra `<Layout>` wrapper; passes `navbar={<CustomNavbar><Search /></CustomNavbar>}` so Pagefind search appears in the header.
- `app/(tabularium)/tabularium/layout.tsx` — Tabularium shell: `CustomNavbar` + `AddTransactionButton` bar + `TabulariumSubNav` + `CustomFooter`; no Nextra chrome.
- `app/(tabularium)/tabularium/components/TabulariumSubNav.tsx` — `'use client'` sub-nav with two active-state links (`/tabularium/portfolio`, `/tabularium/transactions`).
- `app/(tabularium)/tabularium/transactions/page.tsx` — Server Component; calls `GET /transactions` with `{ next: { tags: ['transactions'] } }` cache tag; renders an 11-column chronological table.
- `app/(tabularium)/tabularium/transaction-schema.ts` — Shared Zod schema (`TransactionFormSchema`); no server/client directive; imported by both `actions.ts` and `TransactionForm.tsx`.
- `app/(tabularium)/tabularium/actions.ts` — `createTransaction` Server Action; Zod re-validation; `POST /transactions`; calls `revalidateTag('transactions')`.
- `app/(tabularium)/tabularium/components/AddTransactionButton.tsx` — `'use client'` trigger; owns `isDrawerOpen` state; always mounted in the Tabularium layout.
- `app/(tabularium)/tabularium/components/TransactionDrawer.tsx` — `'use client'` fixed right-side slide-in panel (Tailwind translate transition + backdrop).
- `app/(tabularium)/tabularium/components/TransactionForm.tsx` — `'use client'` dynamic form; field visibility driven by `transactionType`; Zod validation on submit.
- `theme/components/Navbar.tsx` — Framework-agnostic `CustomNavbar`; data-driven `NavLink[]`; `usePathname()` active state; accepts optional `children` (used to inject `<Search />`); reused in both layouts.
- `theme/components/Footer.tsx` — `CustomFooter`; reused in both layouts.

**Public routes:**

| Route | Description |
| --- | --- |
| `GET /` | Home page (Nextra, sidebar-free) |
| `GET /tabularium` | Tabularium landing (App Router) |
| `GET /tabularium/portfolio` | Portfolio dashboard placeholder |
| `GET /tabularium/transactions` | Transaction Ledger (server-rendered) |
| `GET /codex/**` | Codex MDX wiki (Nextra) |

**Key invariants:**

- Lighthouse performance score ≥ 90 on `/`, `/tabularium`, `/tabularium/transactions`, `/codex/fundamentals`; enforced by `lhci autorun` in CI.
- All LaTeX pre-rendered at build time — no KaTeX JS bundle shipped to the browser.
- `<Search />` must be passed as `children` to `CustomNavbar` in `app/[[...slug]]/layout.tsx`; removing it breaks Pagefind in Codex headers.
- `content/tabularium.mdx` must not be re-created; its absence lets the App Router route group own `/tabularium`.
- The Tabularium has exactly **two sub-routes**: `/tabularium/portfolio` and `/tabularium/transactions`. Do not add a third without consolidating or splitting the existing `portfolio` page.
- Any Server Action that writes transaction data must call `revalidateTag('transactions')`.
- `CustomNavbar` must remain free of Nextra-specific imports — it is reused in the Tabularium layout which has no Nextra context.

---

### Backend (`backend/`)

**Stack:** Python, FastAPI, SQLAlchemy (async), psycopg3, Pydantic v2, PostgreSQL.

**Key files:**

- `src/backend/main.py` — FastAPI entry point; `lifespan` creates the `transactions` table via `Base.metadata.create_all`; CORS middleware; transactions router at `/transactions`; `GET /health`.
- `src/backend/db.py` — Async SQLAlchemy engine and session factory; `get_session` async generator for dependency injection.
- `src/backend/models.py` — `Base` (declarative base) and `Transaction` ORM class; 14 columns: `id`, `owner`, `broker_platform`, `transaction_type`, `asset_class`, `ticker`, `isin`, `quantity` (nullable), `price`, `currency`, `fees`, `ratio` (nullable, Split only), `transaction_date`, `created_at`.
- `src/backend/schemas/transactions.py` — `TransactionCreate` Pydantic v2 request model (ISIN validator; `model_validator` enforcing quantity for buy/sell and ratio for split); `TransactionResponse` with ORM-mode serialization.
- `src/backend/routers/transactions.py` — `POST /transactions` (HTTP 201) and `GET /transactions` route handlers.

**Public interfaces:**

| Endpoint | Description |
| --- | --- |
| `GET /health` | Liveness check; no DB dependency; returns `{"status": "ok"}` |
| `POST /transactions` | Create a transaction; accepts `TransactionCreate`; returns `TransactionResponse` (HTTP 201) |
| `GET /transactions` | List all transactions ordered by `transaction_date DESC`; optional `?owner=` filter |

**Key invariants:**

- `GET /health` must return `{"status": "ok"}` even when PostgreSQL is unavailable.
- `DATABASE_URL` must be set before startup; the async engine is created at module import time.
- CORS must allowlist `http://localhost:3000` unconditionally; production origin set via `FRONTEND_ORIGIN`.
- `psycopg[binary]` (psycopg3) must be used — not `psycopg2` — for async engine compatibility.
- `Base.metadata.create_all()` at startup is idempotent. Future schema changes require Alembic.
- The `transactions` table is the canonical financial record; schema extensions must use tracked migrations.
