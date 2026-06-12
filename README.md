# Aerarium Saturni

Personal finance platform for private investors — portfolio tracking, financial knowledge base, and future ML-driven simulations.

## Overview

Aerarium Saturni is a self-hosted finance platform built around three named pillars, each covering a distinct stage of the investment lifecycle: learning (Codex), acting (Tabularium), and planning (Providentia). The platform uses a Roman naming convention throughout — from the pillar names to the Tailwind design tokens (`roman-*`). Current version: **v0.2.3** (active development).

## Pillars

| Pillar | Status | Description |
| --- | --- | --- |
| **Home** | Live | Platform landing page |
| **Tabularium** | Active development | Portfolio management: transaction ledger (Buy/Sell/Dividend/Split), portfolio dashboard |
| **Codex** | Active | Financial knowledge wiki — MDX articles with LaTeX support across six sections (fundamentals, instruments, portfolio, personal finance, infrastructure, library) |
| **Providentia** | Planned | FIRE simulations and ML-driven portfolio models |

## Repository structure

```txt
aerarium-saturni/
├── frontend/          # Next.js 15 + Nextra 4 — serves Home, Tabularium, Codex
├── backend/           # Python FastAPI service — data access layer for Tabularium
├── docker-compose.yml # Orchestrates database, backend, frontend
├── justfile           # Dev shortcuts (frontend-dev, backend-dev, …)
└── CHANGELOG.md       # Version history (Keep a Changelog / Semantic Versioning)
```

## Tech stack

| Layer | Technology |
| ------- | ------------ |
| Frontend | Next.js 15, Nextra 4, TypeScript, Tailwind CSS |
| Backend | Python, FastAPI, SQLAlchemy 2.0 (async), Pydantic v2 |
| Database | PostgreSQL 17 |
| Container | Docker Compose |
| CI | GitHub Actions, Lighthouse CI (performance ≥ 0.9) |

## Quick start

```bash
# Full stack
docker compose up --build -d
# frontend → http://localhost:3000
# backend  → http://localhost:8000
# database → localhost:5432

# Dev (via justfile, from repo root)
just frontend-dev   # Next.js with hot reload
just backend-dev    # uvicorn with hot reload
```

Requires a `.env` file at the repo root with `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DATABASE_URL`, and optionally `FRONTEND_ORIGIN`.

## Vision

The long-term goal is a unified personal finance OS that covers the full investment lifecycle in one self-hosted installation. The **Codex** handles theory — a structured wiki for financial education. The **Tabularium** handles practice — transaction recording, portfolio valuation, P&L analytics, and cost-basis tracking. The **Providentia** will handle foresight — FIRE simulations and ML-driven predictions for portfolio risk and growth. The platform is designed for a single private investor who values data ownership and control over commercial alternatives.

## Future Potential Additions

| Feature | Status | Description |
| --- | --- | --- |
| **Asset Comparison** | Planned | Dashboard showing how different ETF, Stocks or Bonds compare between each other |
