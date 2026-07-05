# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.5] - 2026-07-05

### Added

- **Frontend**: `app/(tabularium)/tabularium/portfolio/components/PortfolioOverviewTable.tsx` — full `'use client'` interactive overview table replacing the typed placeholder; owns `selected` (`Set<string>` initialised to all rows), `sortColumn`, and `sortDirection` state; 7 columns: checkbox, Owner, Broker (logo + `Building2` fallback), Invested, Value, Performance (absolute + relative side-by-side, colour-coded), Share; `<tfoot>` Total row with weighted `performance_pct` = Σ(performance_abs) / Σ(total_invested) × 100 (null rows excluded from both Σ); Share column recalculates on every selection change; division-by-zero guard when all rows are unchecked.
- **Frontend**: New `app/(tabularium)/tabularium/portfolio/utils/brokerLogo.ts` — `brokerLogoPath(platform: string): string | null` helper; normalises platform to lowercase with no spaces or hyphens before lookup; maps `n26` → `/brokers/n26.png`, `ibkr` / `interactivebrokers` → `/brokers/ibkr.jpeg`; returns `null` for unrecognised platforms.
- **Frontend**: New `app/(tabularium)/tabularium/portfolio/utils/perfClass.ts` — `perfClass(value: number | null): string` utility; returns `'text-green-600'` for positive, `'text-red-600'` for negative, `'text-neutral-500'` for zero or null.

## [0.3.4] - 2026-07-05

### Added

- **Frontend**: New `app/(tabularium)/tabularium/portfolio/components/PortfolioPageClient.tsx` — `'use client'` tab container with `activeTab: 'portfolio' | 'etf-registry'` state; renders two-tab header styled with `roman-*` tokens; "Portfolio" tab (default) hosts `PortfolioOverviewTable`; "ETF Registry" tab hosts `AddEtfButton` + `EtfRegistryTable`; exports `PortfolioRowResponse` and `PortfolioOverviewResponse` TypeScript interfaces.
- **Frontend**: New `app/(tabularium)/tabularium/portfolio/components/PortfolioOverviewTable.tsx` — typed placeholder component accepting `rows: PortfolioRowResponse[]`; full interactive implementation delivered in TASK-3.

### Changed

- **Frontend**: `app/(tabularium)/tabularium/portfolio/page.tsx` — refactored from a single-purpose ETF Registry Server Component to a tab shell: parallel-fetches `GET /portfolio/overview` (cache tag `portfolio-overview`) and `GET /etfs` (cache tag `etfs`) via `Promise.all`, then renders `<PortfolioPageClient overviewData={...} etfs={...} />`.
- **Frontend**: `app/(tabularium)/tabularium/actions.ts` — `createTransaction` now calls `revalidateTag('portfolio-overview')` alongside the existing `revalidateTag('transactions')` to keep the Portfolio Overview cache consistent after any transaction write.
- **Frontend**: `app/(tabularium)/tabularium/etf-actions.ts` — `createEtf`, `updateEtf`, `deleteEtf`, and `addPriceSnapshot` each now call `revalidateTag('portfolio-overview')` alongside the existing `revalidateTag('etfs')`, since ETF price history feeds the Overview's `current_value` computation.

## [0.3.3] - 2026-07-01

### Added

- **Backend**: New `src/backend/schemas/portfolio.py` — `PortfolioRowResponse` and `PortfolioOverviewResponse` Pydantic v2 schemas; `current_value`, `performance_abs`, and `performance_pct` are nullable for groups where any held ISIN has no price record.
- **Backend**: New `src/backend/routers/portfolio.py` — `GET /portfolio/overview` route handler; two-phase SQLAlchemy async query: Phase 1 CTE groups `transactions` by `(owner, broker_platform, isin)` (buy/sell only) producing net holdings; Phase 2 left-joins to `etfs` with a correlated subquery on `etf_price_history` for the latest price per ISIN; Python-side `(owner, broker_platform)` grouping and null propagation ensure missing prices propagate to the whole group.
- **Tests**: New `tests/routers/test_portfolio.py` — 5 unit tests covering empty result, single row with price data, multiple rows with different owners, null `current_value` when no price data, and mixed null/non-null groups.

### Changed

- **Backend**: `src/backend/main.py` — `portfolio` router registered at prefix `/portfolio`.
- **Tests**: `tests/conftest.py` — Added `_make_portfolio_row` helper and five `mock_session_portfolio_*` / `client_portfolio_*` fixture pairs.

## [0.3.2] - 2026-06-19

### Added

- **Frontend**: `app/(tabularium)/tabularium/portfolio/page.tsx` promoted from `return null` placeholder to a live Next.js Server Component — fetches `GET /etfs` with `{ next: { tags: ['etfs'] } }` cache tag; renders `AddEtfButton` (create drawer) + `EtfRegistryTable` or an empty-state message.
- **Frontend**: New `etf-schema.ts` — Zod `EtfFormSchema` with ISIN regex and JSON-parseability refinements on required JSONB distribution fields; `EtfFormValues` type exported; no directive so it is importable by both server and client.
- **Frontend**: New `etf-actions.ts` — `'use server'` — `createEtf`, `updateEtf`, `deleteEtf`, `addPriceSnapshot` Server Actions; each calls `revalidateTag('etfs')` after a successful backend write; parse JSONB string fields to `Record<string, number>` before sending to the backend.
- **Frontend**: New `components/EtfRegistryTable.tsx` — `'use client'` filterable table with client-side ticker-prefix, asset-class, and issuer filters; per-row Edit, Delete (with `window.confirm` guard), `PriceUpdateButton`, and `HoldingsUpload` actions; `editingEtf` state drives the edit drawer.
- **Frontend**: New `components/AddEtfButton.tsx` — `'use client'` trigger button; owns `isDrawerOpen` state; mounted inside `portfolio/page.tsx` (not the layout) so it appears only on the ETF registry view.
- **Frontend**: New `components/EtfDrawer.tsx` — `'use client'` fixed right-side slide-in panel mirroring `TransactionDrawer`; title toggles "Add ETF" / "Edit ETF" based on `etf` prop.
- **Frontend**: New `components/EtfForm.tsx` — `'use client'` create/edit form; single `formState` object state; asset-class-conditional field visibility (bonds JSONB fields for `asset_class === 'Bonds'`, equity metrics for `asset_class === 'Equities'`); exports the `EtfResponse` TypeScript interface.
- **Frontend**: New `components/PriceUpdateButton.tsx` — `'use client'` per-row toggle; expands to an inline price/currency/date form and calls `addPriceSnapshot` Server Action.
- **Frontend**: New `components/HoldingsUpload.tsx` — `'use client'` CSV file input; POSTs `FormData` to `/api/etfs/{id}/holdings/upload`; renders row-count confirmation or structured error.
- **Frontend**: New `app/api/etfs/[id]/holdings/upload/route.ts` — Next.js App Router POST route handler; proxies multipart CSV uploads from the browser to `${BACKEND_URL}/etfs/{id}/holdings/upload` (necessary because `BACKEND_URL` is server-side only).

### Changed

- **Infrastructure**: `frontend/.lighthouserc.js` — added `http://localhost:3000/tabularium/portfolio` to the Lighthouse CI URL audit list; performance score ≥ 0.9 now gated on the live ETF registry route.

## [0.3.1] - 2026-06-19

### Added

- **Backend**: New `src/backend/schemas/etfs.py` — `EtfCreate` (ISIN `field_validator`; `model_validator` enforcing bond distribution maps when `asset_class = Bonds`), `EtfUpdate` (all fields optional for partial updates), `EtfResponse` (ORM-mode, 24 fields), `EtfPriceCreate`, `EtfPriceResponse`, `EtfHoldingRow` (CSV row parsing) Pydantic v2 models.
- **Backend**: New `src/backend/routers/etfs.py` — Six FastAPI route handlers at `/etfs`: `POST /etfs` (201), `GET /etfs` (ILIKE filters on ticker and issuer; exact match on asset_class), `PUT /etfs/{id}` (partial update), `DELETE /etfs/{id}` (204, cascades to holdings and price history), `POST /etfs/{id}/price` (manual price snapshot, 201), `POST /etfs/{id}/holdings/upload` (atomic CSV replace — delete-then-insert within one transaction; 422 with row number on any validation failure).
- **Backend**: `python-multipart>=0.0.9` added to `backend/pyproject.toml` runtime dependencies (required for `UploadFile` multipart parsing).
- **Tests**: `tests/conftest.py` extended with `VALID_ETF_PAYLOAD`, `_make_mock_etf_row`, `mock_session_with_etfs`, `mock_session_etf_not_found`, `client_with_etfs`, and `client_etf_not_found` fixtures.
- **Tests**: New `tests/routers/test_etfs.py` — 10 unit tests covering valid ETF creation, invalid ISIN (422), bonds without distribution maps (422), empty list, list with rows, update/delete 404, price creation, CSV upload success, and CSV upload invalid row.

### Changed

- **Backend**: `src/backend/main.py` — `etfs` router registered at prefix `/etfs`.

## [0.3.0] - 2026-06-19

### Added

- **Backend**: New `Etf`, `EtfHolding`, and `EtfPriceHistory` SQLAlchemy ORM models in `src/backend/models.py` — three-table ETF asset registry schema with UUID PKs, UNIQUE constraints on ticker/isin, four JSONB distribution columns (geographical, sector, bond maturities, bond credit scores), FK cascades from child to parent, GIN index declarations on JSONB columns, and a composite B-Tree index on `(etf_id, timestamp DESC)` for O(1) latest-price lookups.
- **Backend**: Alembic initialized at `backend/alembic/` — `alembic.ini` root config, `env.py` migration runner using synchronous psycopg3 `create_engine` with `NullPool`, and `script.py.mako` template.
- **Backend**: First Alembic migration `001_create_etf_tables.py` — creates `etfs`, `etf_holdings`, and `etf_price_history` tables with all constraints, FK cascades, GIN indexes on JSONB columns, and composite index on `(etf_id, timestamp DESC)`.
- **Backend**: `alembic>=1.13` added to runtime dependencies in `backend/pyproject.toml`.

## [0.2.3] - 2026-06-11

### Added

- **Frontend**: New `components/TabulariumSubNav.tsx` — `'use client'` persistent sub-navigation bar; two nav links (`/tabularium/portfolio`, `/tabularium/transactions`) with `usePathname()` prefix-match active state; `roman-terracotta` active underline, `roman-stone`/`roman-gold` inactive states; no Nextra imports.

### Changed

- **Frontend**: `app/(tabularium)/tabularium/layout.tsx` — `TabulariumSubNav` inserted between the `AddTransactionButton` action bar and `<main>`.

## [0.2.2] - 2026-06-11

### Added

- **Frontend**: New `transaction-schema.ts` — shared Zod `TransactionFormSchema` (no `'use client'`/`'use server'`) importable by both the Server Action and the form client component; `zod ^4.4.3` added as a dependency.
- **Frontend**: New `actions.ts` — `createTransaction` Server Action; Zod re-validation server-side; `POST /transactions`; `revalidateTag('transactions')` on success; returns `{ success: true } | { error: string }`.
- **Frontend**: New `components/AddTransactionButton.tsx` — `'use client'` trigger button (Lucide `Plus`, roman-* tokens); owns `isDrawerOpen` state; mounted in the Tabularium layout so the button is visible on all three sub-routes without prop-drilling.
- **Frontend**: New `components/TransactionDrawer.tsx` — `'use client'` fixed right-side slide-in panel (`fixed inset-y-0 right-0 z-50 w-96`); Tailwind `translate-x-full` / `translate-x-0` transition; semi-transparent backdrop overlay; `role="dialog"` for accessibility.
- **Frontend**: New `components/TransactionForm.tsx` — `'use client'` dynamic form with field visibility matrix (Buy/Sell: quantity + price + fees; Dividend: price as "Amount per share" + optional quantity; Split: ratio); Zod client-side validation with inline per-field error messages; calls `createTransaction` via `useTransition`.

### Changed

- **Frontend**: `app/(tabularium)/tabularium/layout.tsx` — mounted `AddTransactionButton` in a right-aligned bar between `CustomNavbar` and `<main>`; import added.
- **Backend**: `src/backend/models.py` — `quantity` column made nullable (`Mapped[Decimal | None]`); new `ratio: Mapped[str | None] = mapped_column(String(10))` column for Split transaction ratio (e.g. `"4:1"`).
- **Backend**: `src/backend/schemas/transactions.py` — `TransactionCreate`: `quantity` changed to optional (`Decimal | None`), `ratio: str | None` added; `model_validator(mode="after")` enforces quantity for buy/sell and ratio for split; `TransactionResponse`: `quantity` updated to `Decimal | None`, `ratio: str | None` added.
- **Tests**: `backend/tests/conftest.py` — `_make_mock_row` extended with `row.ratio = overrides.get("ratio", None)` to keep all 7 backend tests passing after the schema change.

## [0.2.1] - 2026-06-11

### Added

- **Frontend**: `app/(tabularium)/tabularium/transactions/page.tsx` converted from placeholder to Next.js Server Component — calls `GET /transactions` with `{ next: { tags: ['transactions'] } }` cache tag; renders an 11-column chronological ledger (Date, Owner, Broker, Type, Asset Class, Ticker, ISIN, Quantity, Price, Currency, Fees) or an empty-state message; `ticker`, `isin`, and `price` null cells render as `—`.
- **Frontend**: `.env.local` (git-ignored) — sets `BACKEND_URL=http://localhost:8000` for local Next.js development.

### Changed

- **Infrastructure**: `docker-compose.yml` — added `BACKEND_URL: http://backend:8000` to the `frontend` service environment block so Server Components can reach the backend container by name.
- **Infrastructure**: `frontend/.lighthouserc.js` — added `http://localhost:3000/tabularium/transactions` to the URL audit list; Lighthouse CI now gates performance score ≥ 0.9 on the new route.
- **Infrastructure**: `.gitignore` — added `.env.local` pattern to prevent accidental commit of local environment files.

## [0.2.0] - 2026-06-11

### Added

- **Backend**: New `src/backend/models.py` — SQLAlchemy 2.0 `DeclarativeBase` (`Base`) and `Transaction` ORM class with 13 columns (`id`, `owner`, `broker_platform`, `transaction_type`, `asset_class`, `ticker`, `isin`, `quantity`, `price`, `currency`, `fees`, `transaction_date`, `created_at`); `owner` and `broker_platform` columns indexed.
- **Backend**: New `src/backend/schemas/transactions.py` — `TransactionCreate` Pydantic v2 request model with `str_strip_whitespace`, field constraints (`gt`, `ge`), and ISIN `field_validator` (12 alphanumeric characters); `TransactionResponse` with ORM-mode `from_attributes=True`.
- **Backend**: New `src/backend/routers/transactions.py` — `POST /transactions` (HTTP 201, persists and returns new row) and `GET /transactions` (optional `?owner=` filter, ordered `transaction_date DESC`) FastAPI route handlers using `Depends(get_session)`.
- **Backend**: Updated `src/backend/main.py` — Added `lifespan` async context manager that materialises the `transactions` table at startup via `conn.run_sync(Base.metadata.create_all)`; transactions router registered at prefix `/transactions`.
- **Tests**: New `tests/conftest.py` — Session and engine mocks enabling database-free unit tests; `_make_async_cm` and `_make_mock_row` helpers; `client` and `client_with_rows` pytest fixtures with `dependency_overrides` and `patch("backend.main.engine")`.
- **Tests**: New `tests/routers/test_transactions.py` — 7 tests covering: valid `POST` returns 201 with UUID, invalid ISIN returns 422, omitted ISIN returns `null`, negative quantity returns 422, `GET` empty returns `[]`, `GET ?owner=` filters by owner, `GET` ordered by date descending.

## [0.1.2] - 2026-06-06

### Added

- **Backend**: New `backend/` UV workspace member materialised from the `members = ["backend"]` declaration in the root `pyproject.toml`.
- **Backend**: `backend/src/backend/main.py` — FastAPI application with `CORSMiddleware` allowing `http://localhost:3000` and the `FRONTEND_ORIGIN` environment variable; `GET /health` liveness endpoint returning `{"status": "ok"}` with no database dependency.
- **Backend**: `backend/src/backend/db.py` — Async SQLAlchemy engine (`psycopg[binary]` / psycopg3 driver, `postgresql+psycopg://` prefix); `get_session` async generator for FastAPI dependency injection; no ORM models.
- **Backend**: `backend/pyproject.toml` — UV workspace member; FastAPI, uvicorn[standard], sqlalchemy[asyncio], psycopg[binary], and pydantic dependencies declared.
- **Backend**: `backend/Dockerfile` — Minimal container image stub using `python:3.13-slim`; installs UV, syncs dependencies, exposes port 8000.
- **Infrastructure**: Root `docker-compose.yml` — Orchestrates `database` (`postgres:17-alpine`, port 5432), `backend` (port 8000), and `frontend` (port 3000); `backend` and `frontend` depend on `database` via health check; `DATABASE_URL` and `FRONTEND_ORIGIN` injected via `.env`.
- **Infrastructure**: `justfile` — `backend-dev` recipe added: starts uvicorn with hot-reload at port 8000.

## [0.1.1] - 2026-06-05

### Fixed

- **Search**: Restored FlexSearch search bar in Codex routes (`/codex/**`). The `<Layout>` component was receiving a custom `navbar` prop that replaced the entire default Nextra navbar — including its embedded `<Search />` component. Fix imports `Search` from `nextra/components` and passes it explicitly as the `search` prop to `<Layout>`, keeping `CustomNavbar` framework-agnostic.

## [0.1.0] - 2026-06-01

### Added

- **Frontend**: New `app/(tabularium)/tabularium/layout.tsx` — Tabularium layout shell with `CustomNavbar` + `CustomFooter`, full-width content area, no Nextra chrome.
- **Frontend**: New `app/(tabularium)/tabularium/page.tsx` — Tabularium landing page using `roman-*` Tailwind tokens.
- **Frontend**: New `app/(tabularium)/tabularium/portfolio/page.tsx` — empty placeholder establishing `/tabularium/portfolio` sub-route.
- **Frontend**: New `app/(tabularium)/tabularium/transactions/page.tsx` — empty placeholder establishing `/tabularium/transactions` sub-route.
- **Frontend**: New `app/[[...slug]]/layout.tsx` — Nextra `<Layout>` wrapper scoped exclusively to Home and Codex catch-all routes.

### Changed

- **Infrastructure**: Renamed workspace directory from `the-codex/` to `frontend/`; all internal paths unchanged.
- **Frontend**: `app/layout.tsx` stripped to minimal shell — `<html>`, `<body>`, `ThemeProvider` (`next-themes`, `defaultTheme=dark`), global CSS; Nextra `<Layout>` moved to `app/[[...slug]]/layout.tsx`.
- **Frontend**: `theme/components/Navbar.tsx` refactored to framework-agnostic `'use client'` component — data-driven `NavLink[]` array (Home, Tabularium, Codex); `usePathname()` prefix-matching active state; Nextra `<Navbar>` wrapper removed; Providentia placeholder commented out for future extension.
- **Frontend**: `content/_meta.js` — `tabularium` entry removed; Nextra page map now drives only Home and Codex tabs.
- **Frontend**: `content/tabularium.mdx` — deleted; removes Nextra's claim on `/tabularium`.
- **Infrastructure**: `justfile` — renamed `codex-rebuild` → `frontend-rebuild`, `codex-dev` → `frontend-dev`; updated all `the-codex/` path references to `frontend/`.

## [0.0.5] - 2026-05-26

### Added

- **The Codex / Content**: `content/index.mdx` — Home page welcome composition; centered layout with `BookOpen` Lucide icon anchor, platform heading ("Aerarium Saturni"), tagline, and Codex / Tabularium pillar icon anchors, styled exclusively with Tailwind `roman-*` tokens.
- **The Codex / Tests**: `tests/mobile-screenshot.spec.ts` — `Home page visual regression` test block capturing `home-mobile.png` fullPage screenshot at 375 px viewport.

## [0.0.4] - 2026-05-25

### Added

- **The Codex / Content**: `content/tabularium.mdx` — Tabularium section stub; sidebar-free, ToC-free placeholder establishing the `/tabularium` routing slot for the future portfolio management pillar.
- **The Codex / Content**: `content/codex/_meta.js` — Codex subtree navigation config mapping the six wiki section directories (fundamentals, instruments, portfolio, personal, infrastructure, library).

### Changed

- **The Codex / Content**: Migrated all wiki section directories from flat `content/` into `content/codex/` — all Codex articles now served under `/codex/**` URL namespace.
- **The Codex / Content**: Updated `content/_meta.js` to three-pillar navigation: `index` (Home), `tabularium`, `codex`; Home and Tabularium entries carry `theme: { sidebar: false, toc: false }` to suppress wiki chrome.
- **The Codex / Content**: Replaced `content/index.mdx` Codex wiki landing with a clean Home stub for TASK-2 styling.
- **The Codex / Infrastructure**: Updated `.lighthouserc.js` from `staticDistDir` to URL-based LHCI collection with `startServerCommand: 'npm run start'`; added explicit assertion targets for `/`, `/tabularium`, and `/codex/fundamentals`.
- **The Codex / Tests**: Updated `tests/mobile-screenshot.spec.ts` URL fixture from stale `/finance/black-scholes` to `/codex/fundamentals/mathematics`; renamed snapshot to `fundamentals-mathematics-mobile.png`.

## [0.0.3] - 2026-05-13

### Added

- **The Codex / Theme**: `theme/components/Navbar.tsx` — Roman-aesthetic navbar with `BookOpen` and `Github` Lucide icons; injected via `DocsThemeConfig.navbar.component`.
- **The Codex / Theme**: `theme/components/Sidebar.tsx` — `SidebarTitle` component with `Folder`, `FileText`, and `ChevronRight` Lucide icons; injected via `DocsThemeConfig.sidebar.titleComponent`.
- **The Codex / Theme**: `theme/components/Footer.tsx` — Roman footer with `Scale` Lucide icon and year auto-fill; injected via `DocsThemeConfig.footer.component`.
- **The Codex / Theme**: `theme/components/CodeBlock.tsx` — Styled `<pre>` wrapper with copy-to-clipboard button using `Copy`/`Check` Lucide icons; injected via `DocsThemeConfig.components.pre`.
- **The Codex / Theme**: `theme/components/Search.tsx` — Custom FlexSearch component fetching `nextra-data-${locale}.json` directly and building a Document index with 2× title-field boost for h1/h2 heading prioritization; injected via `DocsThemeConfig.search.component`. Includes keyboard navigation (ArrowUp/Down, Enter, Escape) and 150 ms debounce.
- **The Codex / Theme**: `theme/index.tsx` — Full `Layout` component wrapping `nextra-theme-docs`'s Layout; applies Roman palette Tailwind classes to the outer page shell.
- **The Codex / Styles**: `tailwind.config.js` — Tailwind JIT config with Roman color palette (`obsidian`, `parchment`, `terracotta`, `gold`, `stone`); content paths cover project source only (`theme/`, `pages/`, `rehype/`).
- **The Codex / Styles**: `postcss.config.js` — PostCSS config enabling Tailwind and Autoprefixer.
- **The Codex / Styles**: Updated `styles/globals.css` — Tailwind directives, Roman CSS custom properties, `@layer base` overrides for Nextra sidebar, navbar, headings, links, and TOC surfaces.
- **The Codex / Rehype**: `rehype/katexOverflow.ts` — Typed rehype plugin that wraps every `.katex-display` div in an `overflow-x-auto` scroll container, preventing LaTeX overflow on narrow viewports. Registered inline in `next.config.mjs` after `rehype-katex`.
- **The Codex / Tests**: `tests/mobile-screenshot.spec.ts` — Playwright tests at 375 × 812 px: no-horizontal-overflow assertion, `overflow-x-auto` wrapper verification for all `.katex-display` elements, and visual snapshot comparison.
- **The Codex / Tests**: `playwright.config.ts` — Playwright config with iPhone SE device, `maxDiffPixelRatio: 0.02` tolerance, and `webServer` for `next start`.
- **Infrastructure**: Updated `.github/workflows/ci.yml` — Added `playwright` job (installs Chromium, runs mobile screenshot tests, uploads HTML report). Added `update-snapshots` workflow-dispatch job for generating Linux baseline screenshots.

### Changed

- **The Codex**: Updated `theme/config.tsx` — Replaced minimal stub config with full `DocsThemeConfig`: Lucide icons for project/chat slots, forced dark mode (`forcedTheme: 'dark'`), `primaryHue: 18` (terracotta), all component override slots wired.
- **The Codex**: Updated `next.config.mjs` — Added `katexOverflow` rehype plugin (inlined from `rehype/katexOverflow.ts`) after `rehype-katex` in the MDX plugin pipeline.
- **The Codex**: Bumped `package.json` version to `0.0.3`; added `tailwindcss`, `autoprefixer`, `postcss`, `@tailwindcss/typography`, `lucide-react`, and `@playwright/test` to devDependencies.

## [0.0.2] - 2026-05-12

### Added

- **The Codex**: New `the-codex/` Next.js/Nextra documentation service providing a centralized financial wiki for Aerarium Saturni.
- **The Codex**: `next.config.mjs` — Nextra wrapper with remark-math → rehype-katex plugin chain; all LaTeX pre-rendered to KaTeX HTML at build time with no client-side JS bundle.
- **The Codex**: MDX content tree with `pages/index.mdx` (landing page) and `pages/finance/black-scholes.mdx` (sample financial article demonstrating inline and block LaTeX).
- **The Codex**: `theme/config.tsx` — Nextra theme configuration; `theme/index.tsx` — custom theme entry point stub for TASK-2 override.
- **The Codex**: `Dockerfile` — multi-stage Docker build (node:20-alpine builder + minimal runner copying `.next/standalone` only).
- **The Codex**: `docker-compose.yml` — service orchestration for `codex` + `nginx` with health-checked `depends_on`.
- **The Codex**: `nginx/subdomain.conf` — Nginx server block for subdomain routing (`docs.aerariumsaturni.com`); `nginx/path-based.conf` — server block for `/wiki` path-based routing.
- **The Codex**: `.lighthouserc.js` — Lighthouse CI assertion enforcing performance score ≥ 0.9.
- **Infrastructure**: `.github/workflows/ci.yml` — CI pipeline with 3-minute build guard (`timeout-minutes: 3`) and `lhci autorun` Lighthouse step.
