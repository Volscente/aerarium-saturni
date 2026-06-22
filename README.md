# Aerarium Saturni

A financial cognitive ecosystem platform for the long-term passive investor — combining a transaction ledger, ETF registry, and a financial theory wiki.

---

## Scope

Aerarium Saturni is a personal investment platform designed explicitly for the long-term passive investor. Rather than targeting active traders, it focuses on the three disciplines that matter for multi-decade wealth accumulation: structured knowledge, rigorous portfolio analytics, and long-horizon forecasting.

The platform is fully self-hosted and unauthenticated — no cloud accounts, no shared data. All financial records, portfolio metrics, and analytical outputs remain local. The stack is deliberately minimal: a Next.js frontend consuming a FastAPI backend over HTTP, with PostgreSQL as the single source of truth for all financial data.

---

## Vision

The long-term direction is a three-pillar cognitive ecosystem:

- **Codex (The Investment Bible):** A centralized, deeply structured knowledge base designed to serve as the investor's personalized financial handbook, where advanced market research, strategies, and asset behavior are permanently documented.
- **Tabularium (The Analytical Hub):** A robust transaction ledger paired with a high-fidelity analytics dashboard. It empowers the investor to aggregate cost-basises, run geographical and sector "X-Rays," isolate asset class comparisons, run cluster risk diagnostics, and execute tax-optimized cash routing.
- **Providentia (The Statistical Playground):** A high-performance forecasting engine utilizing stochastic analysis and Monte Carlo simulations. It serves as a personal laboratory to stress-test 30-year accumulation horizons, model behavioral anomalies under historic market shock regimes, and simulate safe, dynamic decumulation strategies.

---

## Features

### Transaction Ledger

- Record Buy, Sell, Dividend, and Split transactions with full metadata: owner, broker platform, asset class, ticker, ISIN, currency, fees, and date.
- Dynamic form with field visibility driven by transaction type: quantity + price + fees for Buy/Sell; amount per share for Dividend; split ratio for Split.
- Chronological server-rendered ledger view with 11-column display; null fields (ticker, ISIN, price) rendered as `—`.

### ETF Registry

- Full CRUD for ETF assets: create, read, update, and delete records with scalar metadata (ticker, ISIN, asset class, issuer, TER, replication method) and JSONB distribution fields (geographic, sector, asset-class, currency breakdowns).
- Manual price snapshots: log price and currency at a given date per ETF.
- Atomic CSV holdings upload: replace all holdings for an ETF from a `multipart/form-data` CSV; rolls back entirely on any row validation error.
- Filterable registry table with per-row edit, delete, price update, and holdings upload actions.

### Codex Wiki

- MDX-based financial theory wiki spanning six sections: Fundamentals, Instruments, Portfolio, Personal Finance, Infrastructure, and Library.
- LaTeX rendering via remark-math → rehype-katex at build time — no KaTeX JavaScript bundle shipped to the browser.
- Full-text Pagefind search indexed from compiled HTML at build time; search bar injected into every Codex and Home page header.

---

## Architecture

```
Browser
  |
  | HTTP
  v
Nginx (reverse proxy)
  |
  v
Next.js Frontend (:3000)
  |
  | HTTP (REST)
  v
FastAPI Backend (:8000)
  |
  | SQLAlchemy (async)
  v
PostgreSQL (:5432)
```

### Monorepo Structure

| Path | Purpose |
|---|---|
| `backend/` | FastAPI application — data persistence, REST API |
| `frontend/` | Next.js 15 + Nextra 4 — Tabularium UI + Codex wiki |
| `justfile` | Task runner: start services, run tests, apply migrations |
| `docker-compose.yml` | Orchestrates frontend, backend, and PostgreSQL containers |

### Backend

A **FastAPI** application serving the data layer. It persists transactions, ETF records, holdings, and price history in **PostgreSQL** via an async **SQLAlchemy** ORM, with **Pydantic v2** schemas enforcing request and response contracts. Schema changes are managed with **Alembic**; the `psycopg[binary]` driver (psycopg3) is required for async engine compatibility.

See [`backend/README.md`](backend/README.md) for the full API reference, schema details, and constraints.

### Frontend

A **Next.js 15** application running two routing strategies side by side: **Nextra 4** handles the MDX-based Codex and Home routes (`/`, `/codex/**`); a dedicated App Router route group (`app/(tabularium)/`) drives the Tabularium UI (`/tabularium/**`) with no Nextra chrome. Form validation uses **Zod** schemas shared between Server Actions and client components. All data fetching for financial records is server-side only.

See [`frontend/README.md`](frontend/README.md) for the full component reference, public interfaces, and constraints.

### Development

All common workflows are defined in the `justfile`:

```bash
just backend-dev       # Start FastAPI with hot reload (localhost:8000)
just frontend-dev      # Rebuild + start Next.js (localhost:3000)

docker compose up --build -d  # Full stack via Docker Compose
```

---

## Roadmap

### Milestone 1: Tabularium Core Analytics (v0.3.0)

**Objective:** Transform the platform from a raw transaction ledger into a functional portfolio dashboard, unblocking the currently empty `/tabularium/portfolio` view.

- **Holding Aggregation Engine (Backend):** Write the calculation logic to process raw ledger transactions (Buy, Sell, Split) into real-time share balances, current values, and weighted cost-basises.
- **Manual Asset Characteristics Ledger:** Build a basic database schema and frontend UI to allow manual input of geographic and sector weights for your core 5–6 ETFs.
- **Portfolio X-Ray Dashboard:** Implement client-side charts on the portfolio page to visualize aggregate geographical and asset-class asset distributions.
- **Asset Comparison Playground:** Introduce a module to evaluate and compare tracking parameters between core funds (e.g., EUNL vs. VWCE).

### Milestone 2: Passive Portfolio Optimization (v0.4.0)

**Objective:** Provide actionable insights that help the passive investor optimize asset allocations and risk management without triggering tax events.

- **Overlap & Cluster Risk Matrix:** Build a diagnostic tool mapping top underlying holdings across separate ETFs to flag hidden stock concentration risks.
- **Smart Rebalancing & Cash Router:** Implement the automated calculator that takes a monthly cash contribution input and routes it precisely across funds to fix drift passively.

### Milestone 3: German Tax Integration (v0.5.0)

**Objective:** Ground the portfolio metrics in domestic tax realities to provide hyper-localized financial alpha.

- **Sparer-Pauschbetrag Tracker:** Add tracking for the annual €1,000 / €2,000 tax-free allowance alongside a tax-harvesting turnover simulator.
- **Vorabpauschale Automation:** Build backend calculation logic for accumulating funds (Thesaurierend) based on the official German base interest rate framework.
- **Teilfreistellung Accounting:** Integrate the 30% partial tax exemption rules directly into cost-basis and capital gains ledger analytics.

### Milestone 4: Providentia Foresight Engine (v1.0.0)

**Objective:** Unlock the forecasting pillar, turning the platform into a predictive playground for multi-decade statistical modeling.

- **Statistical Infrastructure:** Add math and data-science library dependencies (NumPy/SciPy) to the FastAPI backend.
- **Stochastic Monte Carlo Simulator:** Launch the 30-year accumulation path model capable of adapting to variable monthly contributions over time.
- **Behavioral Stress-Testing Sandbox:** Allow users to simulate how their portfolio curves survive historically simulated macro-crises (e.g., 2008 GFC).
- **Decumulation Plan Simulator:** Implement drawdown models incorporating Variable Percentage Withdrawal (VPW) rules and dynamic safety guardrails.
