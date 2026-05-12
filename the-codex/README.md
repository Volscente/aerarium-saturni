# The Codex

## Purpose

The Codex is the standalone documentation service for the Aerarium Saturni platform. It provides a centralized, authoritative wiki for financial theory and platform-specific logic, with first-class KaTeX LaTeX rendering for mathematical formulas, a custom Roman-aesthetic theme, and header-prioritized full-text search — all served from a containerized Next.js/Nextra application behind an Nginx reverse proxy.

## Key components

- **`next.config.mjs`** — Nextra wrapper with the remark-math → rehype-katex plugin chain and standalone output mode
- **`pages/`** — MDX content tree: `index.mdx` (landing), `finance/black-scholes.mdx` (sample financial article)
- **`theme/config.tsx`** — Nextra theme configuration (logo, project link, footer)
- **`theme/index.tsx`** — Custom theme entry point stub; will become the full Roman-aesthetic override in TASK-2
- **`styles/globals.css`** — Global stylesheet including the KaTeX CSS import
- **`Dockerfile`** — Multi-stage Docker build: builder stage produces `.next/standalone`; runner stage is minimal
- **`docker-compose.yml`** — Service orchestration: `codex` container + `nginx` with health-checked dependency
- **`nginx/subdomain.conf`** — Nginx server block for subdomain routing (primary topology)
- **`nginx/path-based.conf`** — Nginx server block for `/wiki` path-based routing (secondary topology)
- **`.lighthouserc.js`** — Lighthouse CI assertion: performance score ≥ 0.9

## Public interfaces

- `GET /` — Documentation landing page
- `GET /finance/black-scholes` — Black-Scholes model article with inline and block LaTeX
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

#### 2026-05-12

- Initial scaffold: Nextra project with remark-math/rehype-katex plugin chain
- Black-Scholes sample article demonstrating inline and block LaTeX rendering
- Multi-stage Dockerfile and Docker Compose with Nginx (subdomain and path-based configs)
- CI workflow with 3-minute build guard and Lighthouse CI (performance ≥ 90)
