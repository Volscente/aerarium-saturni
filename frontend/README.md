# Frontend

## Purpose

The Frontend is the Next.js 15 + Nextra 4 application for the Aerarium Saturni platform. It serves three pillars — Home, Tabularium, and Codex — from a single deployment: the Codex and Home are rendered through Nextra's MDX pipeline (`app/[[...slug]]`), while the Tabularium runs as a dedicated App Router route group (`app/(tabularium)/`) with no Nextra chrome.

## Key components

- **`next.config.mjs`** — Nextra wrapper with the remark-math → rehype-katex plugin chain and standalone output mode
- **`content/_meta.js`** — Root navigation config: two-pillar Nextra layout (Home, Codex); Tabularium is served by the App Router route group, not the Nextra page map
- **`content/index.mdx`** — Home page welcome composition (sidebar-free, ToC-free); centered layout with platform heading, tagline, and Lucide icon anchors styled with roman-* Tailwind tokens
- **`content/codex/`** — MDX content tree for the Codex pillar: `_meta.js` subtree nav + six section directories (fundamentals, instruments, portfolio, personal, infrastructure, library)
- **`app/layout.tsx`** — Root Next.js App Router layout; minimal shell (`<html>`, `<body>`, `ThemeProvider`, global CSS)
- **`app/[[...slug]]/layout.tsx`** — Nextra `<Layout>` wrapper scoped to Home and Codex catch-all routes; passes `navbar={<CustomNavbar><Search /></CustomNavbar>}` so the Pagefind search bar appears inside the custom nav (see [Search integration](#search-integration))
- **`app/(tabularium)/tabularium/layout.tsx`** — Tabularium layout shell: `CustomNavbar` + `AddTransactionButton` action bar + `TabulariumSubNav` + `CustomFooter`, no Nextra chrome, full-width content area
- **`app/(tabularium)/tabularium/components/TabulariumSubNav.tsx`** — `'use client'` persistent sub-navigation bar; two nav links (`/tabularium/portfolio`, `/tabularium/transactions`) with `usePathname()` prefix-match active state; `roman-*` token styling; no Nextra imports
- **`app/(tabularium)/tabularium/page.tsx`** — Tabularium landing page
- **`app/(tabularium)/tabularium/portfolio/page.tsx`** — Portfolio tab shell: Next.js Server Component; parallel-fetches `GET /portfolio/overview` (`portfolio-overview` cache tag) and `GET /etfs` (`etfs` cache tag); renders `<PortfolioPageClient>` with both datasets as props
- **`app/(tabularium)/tabularium/portfolio/components/PortfolioPageClient.tsx`** — `'use client'` tab container; owns `activeTab: 'portfolio' | 'etf-registry'` state; renders two-tab header (roman-* tokens) and the active tab body; exports `PortfolioRowResponse` and `PortfolioOverviewResponse` TypeScript interfaces
- **`app/(tabularium)/tabularium/portfolio/components/PortfolioOverviewTable.tsx`** — placeholder `'use client'` component accepting `rows: PortfolioRowResponse[]`; full implementation delivered in TASK-3
- **`app/(tabularium)/tabularium/etf-schema.ts`** — Shared Zod schema (`EtfFormSchema`, `EtfFormValues`); no directive; JSONB distribution fields validated as JSON strings; importable by `etf-actions.ts` (server) and `EtfForm.tsx` (client)
- **`app/(tabularium)/tabularium/etf-actions.ts`** — `createEtf`, `updateEtf`, `deleteEtf`, `addPriceSnapshot` Server Actions; parse JSONB string fields to `Record<string, number>` before backend call; each calls `revalidateTag('etfs')` and `revalidateTag('portfolio-overview')` on success; return `{ success: true } | { error: string }`
- **`app/(tabularium)/tabularium/components/EtfRegistryTable.tsx`** — `'use client'` filterable table; owns ticker/asset-class/issuer filter state and `editingEtf` state; per-row Edit, Delete (with `window.confirm`), `PriceUpdateButton`, `HoldingsUpload` actions
- **`app/(tabularium)/tabularium/components/AddEtfButton.tsx`** — `'use client'` trigger button; owns `isDrawerOpen` state; mounted inside `PortfolioPageClient` within the "ETF Registry" tab body so it appears only when that tab is active
- **`app/(tabularium)/tabularium/components/EtfDrawer.tsx`** — `'use client'` fixed right-side slide-in panel (`fixed inset-y-0 right-0 z-50 w-[28rem]`); mirrors `TransactionDrawer`; title toggles "Add ETF" / "Edit ETF" based on `etf` prop
- **`app/(tabularium)/tabularium/components/EtfForm.tsx`** — `'use client'` create/edit form; single `formState` object state; field visibility matrix: bonds JSONB fields shown when `asset_class === 'Bonds'`, equity metric fields when `asset_class === 'Equities'`; `EtfResponse` interface exported from here and re-used by table/drawer
- **`app/(tabularium)/tabularium/components/PriceUpdateButton.tsx`** — `'use client'` per-row toggle that expands to an inline price/currency/date form; calls `addPriceSnapshot` Server Action
- **`app/(tabularium)/tabularium/components/HoldingsUpload.tsx`** — `'use client'` CSV file input; POSTs to `/api/etfs/{id}/holdings/upload` (Next.js route handler proxy); shows "Inserted N rows" or structured error
- **`app/api/etfs/[id]/holdings/upload/route.ts`** — Next.js App Router POST route handler; proxies multipart CSV uploads from the browser to `${BACKEND_URL}/etfs/{id}/holdings/upload` (needed because `BACKEND_URL` is server-side only)
- **`app/(tabularium)/tabularium/transactions/page.tsx`** — Transaction Ledger: Next.js Server Component; calls `GET /transactions` with `{ next: { tags: ['transactions'] } }` cache tag; renders a full-width chronological table (11 columns) or an empty-state message
- **`app/(tabularium)/tabularium/transaction-schema.ts`** — Shared Zod schema (`TransactionFormSchema`, `TransactionFormValues`); no `'use client'`/`'use server'` directive so it is importable by both `actions.ts` (server) and `TransactionForm.tsx` (client)
- **`app/(tabularium)/tabularium/actions.ts`** — `createTransaction` Server Action: re-validates with Zod, POSTs to `POST /transactions`, calls `revalidateTag('transactions')` and `revalidateTag('portfolio-overview')`, returns `{ success: true } | { error: string }`
- **`app/(tabularium)/tabularium/components/AddTransactionButton.tsx`** — `'use client'` trigger button; owns `isDrawerOpen` state; always mounted in the Tabularium layout so the button is visible on all three sub-routes
- **`app/(tabularium)/tabularium/components/TransactionDrawer.tsx`** — `'use client'` fixed right-side slide-in panel (`fixed inset-y-0 right-0 z-50 w-96`); Tailwind `translate-x-full` / `translate-x-0` transition; semi-transparent backdrop overlay; contains `TransactionForm`
- **`app/(tabularium)/tabularium/components/TransactionForm.tsx`** — `'use client'` dynamic form; field visibility driven by `transactionType` (Buy/Sell: quantity+price+fees; Dividend: price as "Amount per share"+optional quantity; Split: ratio); Zod validation on submit; calls `createTransaction` and invokes `onSuccess()` on HTTP 201
- **`theme/components/Navbar.tsx`** — Framework-agnostic `CustomNavbar`; data-driven `NavLink[]` array; `usePathname()` active state with prefix matching; accepts optional `children?: ReactNode` rendered at the trailing end of the right-side flex container; reused in both layouts
- **`theme/components/Footer.tsx`** — `CustomFooter`; Scale icon + year auto-fill; reused in both layouts
- **`styles/globals.css`** — Global stylesheet: Tailwind directives, Roman CSS custom properties, `@layer base` overrides
- **`Dockerfile`** — Multi-stage Docker build: builder stage produces `.next/standalone`; runner stage is minimal
- **`docker-compose.yml`** — Service orchestration: `frontend` container + `nginx` with health-checked dependency
- **`nginx/subdomain.conf`** — Nginx server block for subdomain routing (primary topology)
- **`nginx/path-based.conf`** — Nginx server block for `/wiki` path-based routing (secondary topology)
- **`.lighthouserc.js`** — Lighthouse CI: starts Next.js server and asserts performance score ≥ 0.9 for `/`, `/tabularium`, `/tabularium/transactions`, `/tabularium/portfolio`, and `/codex/fundamentals`
- **`.env.local`** — Local dev environment variables (git-ignored); sets `BACKEND_URL=http://localhost:8000`

## Public interfaces

- `GET /` — Home page (sidebar-free welcome interface; Nextra `[[...slug]]` route)
- `GET /tabularium` — Tabularium landing page (App Router route group; no Nextra chrome)
- `GET /tabularium/portfolio` — Portfolio tab shell: "Portfolio" tab (Overview visualisation, default) and "ETF Registry" tab (live filterable ETF table with create, edit, delete, price logging, and CSV holdings upload actions)
- `POST /api/etfs/{id}/holdings/upload` — Internal Next.js route handler; proxies CSV multipart upload from the browser to the FastAPI backend
- `GET /tabularium/transactions` — Transaction Ledger; server-rendered chronological table of all recorded transactions fetched from `GET /transactions` on the FastAPI backend
- `GET /codex` — Codex section landing (financial theory wiki; Nextra route)
- `GET /codex/fundamentals/**` — Fundamentals articles (mechanics, money & inflation, mathematics)
- `GET /codex/instruments/**` — Instruments articles (equities, fixed income, commodities, crypto, pooled funds)
- `GET /codex/portfolio/**` — Portfolio articles (models, diversification, selection rules)
- `GET /codex/personal/**` — Personal finance articles (net worth, pensions, FIRE)
- `GET /codex/infrastructure/**` — Infrastructure articles (brokers, costs & fees, taxation)
- `GET /codex/library/**` — Library articles (education, media, reading list)
- `GET /_next/static/**` — Static assets (JS, CSS, images) served directly by Next.js standalone output

## External dependencies

- **Nextra** — Documentation framework on Next.js; handles MDX compilation, sidebar/navbar generation, and Pagefind search integration; scoped to `[[...slug]]` routes only
- **remark-math / rehype-katex** — Unified pipeline plugins that parse and render LaTeX delimiters at build time; no client-side KaTeX JS bundle is shipped
- **KaTeX** — LaTeX renderer; only its CSS (`katex.min.css`) is loaded at runtime
- **next-themes** — Theme provider (`ThemeProvider`) in root layout; `useTheme()` consumed by `CustomNavbar` for dark/light toggle
- **Nginx** — Reverse proxy; terminates HTTP and routes traffic to the frontend container in both subdomain and path-based topologies
- **Docker** — Container runtime; multi-stage build keeps the production image to the compiled output only

## Constraints / invariants

- Lighthouse performance score must remain ≥ 90 at all times; enforced by `lhci autorun` in CI.
- Builds must complete within 3 minutes; enforced by `timeout-minutes: 3` on the CI build step.
- All LaTeX is pre-rendered at build time — no KaTeX JS bundle is shipped to the browser.
- No standard Nextra styling may be visible in the final site.
- Search uses Pagefind (Nextra 4 default); the index is built from compiled `.html` files by `next build` and served from `/_pagefind/pagefind.js`. Search is intentionally disabled in `next dev` — run `next build && next start` to test it locally.
- The `<Search />` component (from `nextra/components`) must be passed as `children` to `CustomNavbar` in the `[[...slug]]` layout's `navbar` prop. **Do not remove it or break this chain** — see [Search integration](#search-integration).
- `content/tabularium.mdx` must not be re-created; its absence is what allows the App Router route group to own `/tabularium` without Nextra shadowing it.
- The Tabularium has exactly **two sub-routes**: `/tabularium/portfolio` and `/tabularium/transactions`. Do not add a third sub-route (e.g. `/tabularium/holdings`, `/tabularium/performance`) without first consolidating or splitting the existing `portfolio` page. The original RFC proposed three routes, but `portfolio` was intentionally kept as a single rich dashboard covering holdings, allocation, and performance visualisations — the split is only worth making when both sides are data-backed.
- Any Server Action that writes transaction data must call `revalidateTag('transactions')`. If a future analytics PR makes `/tabularium/portfolio` data-backed from the transactions table, it must also add `revalidateTag` for the portfolio cache tag to `createTransaction` in `actions.ts`.

## Search integration

### How it works

Nextra 4 ships `<Search />` from `nextra/components`. This component drives Pagefind: on first keystroke it lazy-loads `/_pagefind/pagefind.js` (built during `next build`) and queries the static HTML index.

Nextra's own `<Layout>` expects to render search through its internal `ClientNavbar`, which reads `themeConfig.search` via `useThemeConfig()`. **Because this project passes a custom `navbar` prop, `ClientNavbar` is never mounted** — so `themeConfig.search` never reaches the header regardless of what the `search` prop is set to.

The fix: `<Search />` is injected directly into `CustomNavbar` via its `children` prop, so it appears in the right-side flex container of every Codex and Home page header.

```tsx
// frontend/app/[[...slug]]/layout.tsx
import { Search } from 'nextra/components'
import { CustomNavbar } from '../../theme/components/Navbar'

<Layout
  navbar={<CustomNavbar><Search /></CustomNavbar>}
  ...
>
```

### Invariants to preserve

| Rule | Why |
|------|-----|
| Always pass `<Search />` as `children` to `CustomNavbar` in `app/[[...slug]]/layout.tsx` | Nextra's `search` prop only reaches the header via `ClientNavbar`; once a custom `navbar` is used, that channel is bypassed |
| Never set `search={false}` or `search={null}` on `<Layout>` without a compensating render elsewhere | The sidebar also reads `themeConfig.search` to show search on mobile; suppressing it removes mobile search |
| `CustomNavbar` must remain free of Nextra-specific imports | It is reused in the Tabularium layout, which has no Nextra context |

### Symptom: search bar disappears

If search disappears from Codex pages, check in order:

1. **`app/[[...slug]]/layout.tsx` — `navbar` prop** — confirm it is `<CustomNavbar><Search /></CustomNavbar>`, not bare `<CustomNavbar />`.
2. **`theme/components/Navbar.tsx` — `children` rendering** — confirm `{children}` is rendered inside the right-side `<div className="flex items-center gap-6">` flex container.
3. **`nextra/components` export** — confirm `Search` is still exported: `grep "Search" node_modules/nextra/dist/client/components/index.js`. If it moves, update the import path; do **not** try to import it from `nextra-theme-docs` (it is not exported there).
4. **Pagefind index missing** — if the search widget renders but returns no results, the Pagefind index was not built. Run `next build`; the index is absent in `next dev` by design.

## Out of scope

- **Dashboard content** — Charts, data tables, and forms are future work; the Tabularium currently provides only the layout shell and route structure
- **Database integration and queries** — Data persistence is a dedicated future initiative
- **User authentication** — The platform is unauthenticated at this stage
- **Real-time market data** — Only static and calculated examples are supported

## Usage

```bash
# Development
cd frontend
npm install
npm run dev
# → http://localhost:3000

# Production (Docker Compose)
cd frontend
docker compose up --build -d
# → http://localhost (subdomain.conf active)

# Via justfile (from repo root)
just frontend-rebuild   # clean build + pagefind index
just frontend-dev       # rebuild then start server

# Switch to path-based routing
# 1. Uncomment basePath: '/wiki' in next.config.mjs
# 2. Mount nginx/path-based.conf in docker-compose.yml
# 3. Rebuild: docker compose up --build -d
# → http://localhost/wiki
```

---

### Changelog

#### 2026-07-05 (v0.3.4)

- Refactored `app/(tabularium)/tabularium/portfolio/page.tsx` into a tab shell: parallel-fetches `GET /portfolio/overview` and `GET /etfs`; renders `<PortfolioPageClient>`
- Added `app/(tabularium)/tabularium/portfolio/components/PortfolioPageClient.tsx` — `'use client'` tab container with `activeTab` state; "Portfolio" tab (default) and "ETF Registry" tab (relocated `AddEtfButton` + `EtfRegistryTable`)
- Added `app/(tabularium)/tabularium/portfolio/components/PortfolioOverviewTable.tsx` — typed placeholder accepting `rows: PortfolioRowResponse[]`; full implementation in TASK-3
- Modified `app/(tabularium)/tabularium/actions.ts` — `createTransaction` now also calls `revalidateTag('portfolio-overview')`
- Modified `app/(tabularium)/tabularium/etf-actions.ts` — `createEtf`, `updateEtf`, `deleteEtf`, `addPriceSnapshot` each now also call `revalidateTag('portfolio-overview')`

#### 2026-06-19 (v0.3.2)

- Promoted `app/(tabularium)/tabularium/portfolio/page.tsx` from `return null` placeholder to a live Next.js Server Component fetching `GET /etfs` with the `etfs` cache tag
- Added `app/(tabularium)/tabularium/etf-schema.ts` — Zod `EtfFormSchema` with JSON-parseability refine on JSONB distribution fields
- Added `app/(tabularium)/tabularium/etf-actions.ts` — `createEtf`, `updateEtf`, `deleteEtf`, `addPriceSnapshot` Server Actions; all call `revalidateTag('etfs')`
- Added `app/(tabularium)/tabularium/components/EtfRegistryTable.tsx` — filterable client table with per-row edit/delete/price/holdings actions
- Added `app/(tabularium)/tabularium/components/AddEtfButton.tsx` — create-mode ETF drawer trigger; mounted in `portfolio/page.tsx` (not the layout)
- Added `app/(tabularium)/tabularium/components/EtfDrawer.tsx` — right-side slide-in panel; mirrors `TransactionDrawer`; supports create and edit modes
- Added `app/(tabularium)/tabularium/components/EtfForm.tsx` — create/edit form with asset-class-conditional field visibility and single `formState` object state; exports `EtfResponse` interface
- Added `app/(tabularium)/tabularium/components/PriceUpdateButton.tsx` — per-row inline price snapshot form calling `addPriceSnapshot`
- Added `app/(tabularium)/tabularium/components/HoldingsUpload.tsx` — CSV file input POSTing to `/api/etfs/{id}/holdings/upload` route handler proxy
- Added `app/api/etfs/[id]/holdings/upload/route.ts` — Next.js App Router POST route handler proxying multipart CSV uploads to the backend
- Modified `frontend/.lighthouserc.js` — added `/tabularium/portfolio` to the Lighthouse CI URL audit list

#### 2026-06-11 (v0.2.3)

- Added `app/(tabularium)/tabularium/components/TabulariumSubNav.tsx` — `'use client'` sub-navigation bar with two active-state links (`/tabularium/portfolio`, `/tabularium/transactions`); `usePathname()` prefix-match; `roman-*` Tailwind tokens; no Nextra imports
- Modified `app/(tabularium)/tabularium/layout.tsx` — `TabulariumSubNav` inserted between the `AddTransactionButton` bar and `<main>`

#### 2026-06-11 (v0.2.2)

- Added `app/(tabularium)/tabularium/transaction-schema.ts` — shared Zod `TransactionFormSchema` (owner, broker_platform, transaction_type, asset_class, currency, transaction_date, optional ticker/ISIN/quantity/price/ratio, fees default 0); `zod ^4.4.3` added as dependency
- Added `app/(tabularium)/tabularium/actions.ts` — `createTransaction` Server Action; Zod re-validation; `POST /transactions`; `revalidateTag('transactions')`; returns `{ success: true } | { error: string }`
- Added `app/(tabularium)/tabularium/components/AddTransactionButton.tsx` — `'use client'` trigger button (Lucide `Plus`, roman-* tokens); owns `isDrawerOpen` state; always mounted in the Tabularium layout
- Added `app/(tabularium)/tabularium/components/TransactionDrawer.tsx` — `'use client'` fixed right-side slide-in panel with Tailwind translate transition and backdrop overlay
- Added `app/(tabularium)/tabularium/components/TransactionForm.tsx` — `'use client'` dynamic form with field visibility matrix (Buy/Sell: quantity+price+fees; Dividend: price as "Amount per share"; Split: ratio); Zod client-side validation; inline field errors
- Modified `app/(tabularium)/tabularium/layout.tsx` — mounted `AddTransactionButton` in a right-aligned bar between `CustomNavbar` and `<main>`

#### 2026-06-11 (v0.2.1)

- Converted `app/(tabularium)/tabularium/transactions/page.tsx` from a `return null` placeholder into a Next.js Server Component: calls `GET /transactions` with `{ next: { tags: ['transactions'] } }` cache tag; renders an 11-column chronological ledger table or an empty-state message; null `ticker`/`isin`/`price` cells render as `—`
- Added `.env.local` (git-ignored) with `BACKEND_URL=http://localhost:8000` for local development
- Added `BACKEND_URL: http://backend:8000` to the `frontend` service environment in root `docker-compose.yml`
- Added `/tabularium/transactions` to the Lighthouse CI URL list in `.lighthouserc.js`; performance score ≥ 0.9 now gated on the new route
- Added `.env.local` to root `.gitignore`

#### 2026-06-05

- Restored Pagefind search bar in Codex routes: `CustomNavbar` now accepts optional `children?: ReactNode`; `app/[[...slug]]/layout.tsx` passes `<Search />` as children via `navbar={<CustomNavbar><Search /></CustomNavbar>}`
- Corrected outdated FlexSearch references to Pagefind throughout docs (Nextra 4 changed search engines)
- Added Search integration section documenting the invariant and a step-by-step recovery guide

#### 2026-06-01

- Renamed workspace directory from `the-codex/` to `frontend/`
- Migrated Tabularium from Nextra MDX page to dedicated App Router route group (`app/(tabularium)/tabularium/`)
- Stripped `app/layout.tsx` to minimal shell; moved Nextra `<Layout>` to `app/[[...slug]]/layout.tsx`
- Created Tabularium layout shell (`app/(tabularium)/tabularium/layout.tsx`) with `CustomNavbar` + `CustomFooter`, no Nextra chrome
- Created Tabularium landing page and empty placeholders at `/tabularium/portfolio` and `/tabularium/transactions`
- Refactored `CustomNavbar` to framework-agnostic `'use client'` component: data-driven `NavLink[]` array, `usePathname()` prefix-matching active state, Providentia placeholder commented out
- Deleted `content/tabularium.mdx`; removed `tabularium` entry from `content/_meta.js`

#### 2026-05-26

- Implemented Home page welcome composition in `content/index.mdx`: centered layout with `BookOpen` Lucide icon, platform heading, tagline, and pillar icon anchors using Tailwind `roman-*` tokens
- Added `Home page visual regression` Playwright `test.describe` block to `tests/mobile-screenshot.spec.ts`; captures `home-mobile.png` fullPage snapshot at 375 px

#### 2026-05-25

- Migrated content tree from flat `content/` to three-pillar layout: Home (`/`), Tabularium (`/tabularium`), Codex (`/codex/**`)
- Moved all six wiki section directories (fundamentals, instruments, portfolio, personal, infrastructure, library) under `content/codex/`
- Created `content/codex/_meta.js` for Codex subtree navigation
- Replaced root `content/_meta.js` with three-pillar nav; Home and Tabularium entries carry `theme: { sidebar: false, toc: false }`
- Updated `content/index.mdx` to Home stub; `content/tabularium.mdx` created as Tabularium stub
- Updated `.lighthouserc.js` to URL-based LHCI targeting `/`, `/tabularium`, and `/codex/fundamentals`
- Updated Playwright test URL from `/finance/black-scholes` to `/codex/fundamentals/mathematics`

#### 2026-05-14

- Light/dark mode toggle added to the Navbar (Sun/Moon icon); preference persisted in `localStorage` under `the-codex-theme`; default is dark
- Fixed search locale mismatch: component now uses `en-US` to match Nextra's `DEFAULT_LOCALE`, resolving the silent 404 on the search index file
- Search now requires a minimum of 2 characters before querying; full substring matching confirmed via `tokenize: 'full'`

#### 2026-05-12

- Initial scaffold: Nextra project with remark-math/rehype-katex plugin chain
- Black-Scholes sample article demonstrating inline and block LaTeX rendering
- Multi-stage Dockerfile and Docker Compose with Nginx (subdomain and path-based configs)
- CI workflow with 3-minute build guard and Lighthouse CI (performance ≥ 90)
