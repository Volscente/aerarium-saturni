# Hybrid Routing Migration — High-Level Planning

**Project:** Aerarium Saturni
**GitHub repo:** [Volscente/aerarium-saturni](https://github.com/Volscente/aerarium-saturni)
**GitHub Milestone:** [5-hybrid-routing-migration](https://github.com/Volscente/aerarium-saturni/milestone/3)
**Notion page:** [5-Hybrid-Routing-Migration](https://app.notion.com/p/5-Hybrid-Routing-Migration-36c5cc6c0f078050b8dae419491a7954)
**Total estimated effort:** 3 FTE-days (1 FTE = 1 day)

---

## Overview

Decouples the Tabularium pillar from Nextra's documentation rendering pipeline by introducing a dedicated Next.js App Router route group (`app/(tabularium)/`) with its own layout shell, while preserving Codex and Home routes unchanged on the Nextra `[[...slug]]` catch-all. A Python FastAPI backend workspace is scaffolded in `backend/` with CORS, a `/health` endpoint, and a SQLAlchemy async engine ready for future data endpoints. The `the-codex/` workspace is renamed to `frontend/` and a root `docker-compose.yml` orchestrates all three services.

### Dependency Order

```txt
TASK-1 ──► TASK-2 (recommended sequence; TASK-2 is structurally independent)
```

---

## TASK-1 — Frontend Routing Migration

**GitHub Issue:** #16
**Effort estimate:** 2 FTE-days

### Scope

Rename `the-codex/` to `frontend/`, lift the Nextra `<Layout>` out of the root layout into `app/[[...slug]]/layout.tsx`, create the Tabularium route group with its layout shell and sub-route placeholders, refactor `CustomNavbar` to a framework-agnostic data-driven component, remove Nextra's claim on `/tabularium`, and update `justfile` recipe names and paths. All steps must be applied in order.

### Goal

`GET /tabularium` and all `GET /tabularium/**` routes are served exclusively by the App Router route group with no Nextra sidebar, ToC, or prose wrapper; `GET /` and all `GET /codex/**` routes remain functionally and visually unchanged; `CustomNavbar` renders the correct active tab across all three pillars using `usePathname()`.

### Deliverables

- `frontend/` — workspace directory renamed from `the-codex/`; all internal paths unchanged
- `frontend/app/layout.tsx` — stripped to minimal shell (`<html>`, `<body>`, global CSS, `NextThemes`); Nextra `<Layout>` removed
- `frontend/app/[[...slug]]/layout.tsx` — new file; receives Nextra `<Layout>` wrapper
- `frontend/app/(tabularium)/tabularium/layout.tsx` — new file; `CustomNavbar` + `CustomFooter`, no Nextra chrome, full-width content area
- `frontend/app/(tabularium)/tabularium/page.tsx` — new file; Tabularium landing page
- `frontend/app/(tabularium)/tabularium/portfolio/page.tsx` — new file; empty placeholder
- `frontend/app/(tabularium)/tabularium/transactions/page.tsx` — new file; empty placeholder
- `frontend/theme/components/Navbar.tsx` — refactored to `'use client'`; typed `{ label, href }` link array; `usePathname()` active state via prefix matching; Providentia placeholder commented out
- `frontend/content/_meta.js` — `tabularium` entry removed
- `frontend/content/tabularium.mdx` — deleted
- `justfile` — `codex-rebuild` → `frontend-rebuild`, `codex-dev` → `frontend-dev`; all `the-codex/` paths updated to `frontend/`

### Technical Overview

The migration proceeds in three ordered steps. **Step 1** strips `frontend/app/layout.tsx` to a minimal shell and moves `<Layout>` to `app/[[...slug]]/layout.tsx`, ensuring any route not matched by the catch-all never enters the Nextra rendering path. **Step 2** creates the `(tabularium)` route group — the parenthetical wrapper is invisible to the URL router, avoiding slug conflict with `[[...slug]]` — and adds the Tabularium layout shell reusing `CustomNavbar` and `CustomFooter` directly, plus empty placeholder pages at `/tabularium/portfolio` and `/tabularium/transactions`. **Step 3** deletes `content/tabularium.mdx` and removes its `_meta.js` entry *before* creating the route group page (mandatory ordering to prevent Nextra's catch-all from shadowing the App Router page), then refactors `CustomNavbar` to a data-driven `'use client'` component: nav links are a typed `{ label, href }[]` array iterated to render `<Link>` components with `usePathname()` prefix-matching for active state. The Tailwind `roman-*` design tokens and Lucide React icons are reused without modification. CI must remain green: Lighthouse score ≥ 90 and build ≤ 3 minutes.

---

## TASK-2 — Python Backend Workspace Scaffold

**GitHub Issue:** #17
**Effort estimate:** 1 FTE-day

### Scope

Materialise the `backend/` UV workspace member declared in the root `pyproject.toml`, implement a FastAPI application with CORS middleware and a `/health` liveness endpoint, scaffold the async SQLAlchemy engine and session factory, add a root-level `docker-compose.yml` orchestrating `frontend`, `backend`, and `database` services, and add a `backend-dev` recipe to `justfile`.

### Goal

A running FastAPI service is reachable at `http://localhost:8000/health`, CORS is configured to allow requests from the Next.js dev server and the production origin, and the PostgreSQL connection layer is scaffolded ready for future ORM models and migrations — all without any additional architectural changes required for the first data-backed endpoint.

### Deliverables

- `backend/pyproject.toml` — UV workspace member; FastAPI, uvicorn, SQLAlchemy (async), psycopg2 dependencies declared
- `backend/src/backend/__init__.py` — package marker
- `backend/src/backend/main.py` — FastAPI app; `CORSMiddleware` allowing `http://localhost:3000` and `FRONTEND_ORIGIN` env var; `GET /health` returning `{"status": "ok"}`
- `backend/src/backend/db.py` — async SQLAlchemy engine pointed at `DATABASE_URL` env var; `get_session` async generator for dependency injection; no ORM models
- `docker-compose.yml` (root) — orchestrates `database` (`postgres:17-alpine`, port 5432), `backend` (`backend/Dockerfile`, port 8000), `frontend` (`frontend/Dockerfile`, port 3000); `backend` and `frontend` depend on `database`; `DATABASE_URL` injected via `.env`
- `justfile` — `backend-dev` recipe added: `cd backend && uv run uvicorn backend.main:app --reload --port 8000`

### Technical Overview

The root `pyproject.toml` already declares `members = ["backend"]` in the UV workspace configuration; this task creates the `backend/` directory and its contents. `CORSMiddleware` reads origins from a `FRONTEND_ORIGIN` environment variable to avoid hardcoding production URLs. The `/health` endpoint has no database dependency to enable CI and load-balancer liveness checks before any business logic is implemented. `db.py` configures an async engine using `DATABASE_URL` and exposes a `get_session` async generator for future FastAPI dependency injection — no ORM models or Alembic migrations are created in this task. The root `docker-compose.yml` is additive: the existing `frontend/docker-compose.yml` is retained for frontend-only development. A smoke-test of `GET /health` from the Next.js dev server immediately after wiring CORS is required before this task is closed.

---

## GitHub Issues

### Milestone 1 — Frontend Routing Migration

**Tasks:** TASK-1
**Effort:** 2 FTE-days

#### Scope

All Next.js routing changes required to isolate the Tabularium pillar from the Nextra rendering pipeline: workspace rename, Nextra layout scoping, Tabularium route group creation, `CustomNavbar` refactor, Nextra claim removal, and `justfile` path updates.

#### Goal

`GET /tabularium` and `GET /tabularium/**` are served exclusively by the App Router route group with no Nextra chrome; `GET /` and `GET /codex/**` are functionally and visually unchanged; `CustomNavbar` shows the correct active tab on all three pillars; CI remains green (Lighthouse ≥ 90, build ≤ 3 minutes).

#### Deliverables

- Workspace renamed from `the-codex/` to `frontend/`
- `frontend/app/layout.tsx` stripped to minimal shell
- `frontend/app/[[...slug]]/layout.tsx` created with Nextra `<Layout>`
- `frontend/app/(tabularium)/tabularium/layout.tsx` created with `CustomNavbar` + `CustomFooter`
- `frontend/app/(tabularium)/tabularium/page.tsx` created
- `frontend/app/(tabularium)/tabularium/portfolio/page.tsx` created (placeholder)
- `frontend/app/(tabularium)/tabularium/transactions/page.tsx` created (placeholder)
- `frontend/theme/components/Navbar.tsx` refactored to data-driven `'use client'` component
- `frontend/content/tabularium.mdx` deleted
- `frontend/content/_meta.js` `tabularium` entry removed
- `justfile` `codex-*` recipes renamed to `frontend-*`, paths updated to `frontend/`

---

### Milestone 2 — Python Backend Workspace Scaffold

**Tasks:** TASK-2
**Effort:** 1 FTE-day

#### Scope

Creation of the `backend/` UV workspace with FastAPI application, CORS configuration, `/health` endpoint, async SQLAlchemy engine scaffold, root `docker-compose.yml` for full-stack local development, and `backend-dev` `justfile` recipe.

#### Goal

FastAPI service runs at `http://localhost:8000/health`; CORS allows requests from the Next.js dev and prod origins; SQLAlchemy async engine and session factory are scaffolded ready for future ORM models; all three services (`frontend`, `backend`, `database`) are orchestrated by a root `docker-compose.yml`.

#### Deliverables

- `backend/pyproject.toml` created with FastAPI, uvicorn, SQLAlchemy, psycopg2 dependencies
- `backend/src/backend/__init__.py` created
- `backend/src/backend/main.py` created with CORS middleware and `GET /health`
- `backend/src/backend/db.py` created with async SQLAlchemy engine and `get_session` generator
- `docker-compose.yml` created at repository root orchestrating `frontend`, `backend`, `database`
- `justfile` `backend-dev` recipe added
