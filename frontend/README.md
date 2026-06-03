# The Codex

## Purpose

The Codex is the standalone documentation service for the Aerarium Saturni platform. It provides a centralized, authoritative wiki for financial theory and platform-specific logic, with first-class KaTeX LaTeX rendering for mathematical formulas, a custom Roman-aesthetic theme, and header-prioritized full-text search — all served from a containerized Next.js/Nextra application behind an Nginx reverse proxy.

## Key components

- **`next.config.mjs`** — Nextra wrapper with the remark-math → rehype-katex plugin chain and standalone output mode
- **`content/_meta.js`** — Root navigation config: three-pillar layout (Home, Tabularium, Codex); per-page `theme: { sidebar: false, toc: false }` for Home and Tabularium
- **`content/index.mdx`** — Home page welcome composition (sidebar-free, ToC-free); centered layout with platform heading, tagline, and Lucide icon anchors styled with roman-* Tailwind tokens
- **`content/tabularium.mdx`** — Tabularium placeholder (sidebar-free, ToC-free); styled content added in TASK-3
- **`content/codex/`** — MDX content tree for the Codex pillar: `_meta.js` subtree nav + six section directories (fundamentals, instruments, portfolio, personal, infrastructure, library)
- **`app/layout.tsx`** — Root Next.js App Router layout; wires Nextra `<Layout>` with custom Navbar and Footer
- **`theme/config.tsx`** — Nextra theme configuration (logo, project link, footer, dark mode toggle)
- **`styles/globals.css`** — Global stylesheet: Tailwind directives, Roman CSS custom properties, `@layer base` overrides
- **`Dockerfile`** — Multi-stage Docker build: builder stage produces `.next/standalone`; runner stage is minimal
- **`docker-compose.yml`** — Service orchestration: `codex` container + `nginx` with health-checked dependency
- **`nginx/subdomain.conf`** — Nginx server block for subdomain routing (primary topology)
- **`nginx/path-based.conf`** — Nginx server block for `/wiki` path-based routing (secondary topology)
- **`.lighthouserc.js`** — Lighthouse CI: starts Next.js server and asserts performance score ≥ 0.9 for `/`, `/tabularium`, and `/codex/fundamentals`

## Public interfaces

- `GET /` — Home page (sidebar-free welcome interface)
- `GET /tabularium` — Tabularium placeholder (sidebar-free; portfolio management pillar stub)
- `GET /codex` — Codex section landing (financial theory wiki)
- `GET /codex/fundamentals/**` — Fundamentals articles (mechanics, money & inflation, mathematics)
- `GET /codex/instruments/**` — Instruments articles (equities, fixed income, commodities, crypto, pooled funds)
- `GET /codex/portfolio/**` — Portfolio articles (models, diversification, selection rules)
- `GET /codex/personal/**` — Personal finance articles (net worth, pensions, FIRE)
- `GET /codex/infrastructure/**` — Infrastructure articles (brokers, costs & fees, taxation)
- `GET /codex/library/**` — Library articles (education, media, reading list)
- `GET /_next/static/**` — Static assets (JS, CSS, images) served directly by Next.js standalone output

## External dependencies

- **Nextra** — Documentation framework on Next.js; handles MDX compilation, sidebar/navbar generation, and FlexSearch integration
- **remark-math / rehype-katex** — Unified pipeline plugins that parse and render LaTeX delimiters at build time; no client-side KaTeX JS bundle is shipped
- **KaTeX** — LaTeX renderer; only its CSS (`katex.min.css`) is loaded at runtime
- **Nginx** — Reverse proxy; terminates HTTP and routes traffic to the Codex container in both subdomain and path-based topologies
- **Docker** — Container runtime; multi-stage build keeps the production image to the compiled output only

## Constraints / invariants

- Lighthouse performance score must remain ≥ 90 at all times; enforced by `lhci autorun` in CI.
- Documentation builds must complete within 3 minutes; enforced by `timeout-minutes: 3` on the CI build step.
- All LaTeX is pre-rendered at build time — no KaTeX JS bundle is shipped to the browser.
- No standard Nextra styling may be visible in the final site (enforced in TASK-2 theme override).
- Search requires a minimum of 2 characters before querying the index; supports full substring matching via `tokenize: 'full'`.
- The search index file is fetched from `/_next/static/chunks/nextra-data-en-US.json`; the locale key `en-US` matches Nextra's `DEFAULT_LOCALE` used when no i18n config is present.

## Out of scope

- **Roman-aesthetic theme override** — Full Layout, Navbar, Sidebar, Footer, and CodeBlock overrides are TASK-2
- **FlexSearch tuning** — Header-priority weighting and financial term synonyms are TASK-2
- **CSS scroll-container wrappers** — Wide block LaTeX overflow handling on narrow viewports is TASK-2
- **User authentication** — The Codex is public-facing and read-only
- **Real-time market data** — Only static and calculated examples are supported

## Usage

```bash
# Development
cd the-codex
npm install
npm run dev
# → http://localhost:3000

# Production (Docker Compose)
cd the-codex
docker compose up --build -d
# → http://localhost (subdomain.conf active)

# Switch to path-based routing
# 1. Uncomment basePath: '/wiki' in next.config.mjs
# 2. Mount nginx/path-based.conf in docker-compose.yml
# 3. Rebuild: docker compose up --build -d
# → http://localhost/wiki
```

---

### Changelog

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
